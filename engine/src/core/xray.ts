// The Xray core: where its executable is, which version it is, running it with a config, and installing it.
//
// Lookup order: the path chosen in Settings, then <data>/core (where "Download Xray" installs it), then a copy bundled
// with the app (RAYLIT_BUNDLED_CORE, set by the desktop shell). geoip.dat / geosite.dat are looked up next to the
// executable and one folder up (v2rayN's layout), and handed to Xray through XRAY_LOCATION_ASSET.
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { LogLine } from '../../../shared/protocol';
import { fetchUrl, waitForPort } from './net';
import { atomicWrite, errorMessage } from './util';

export const EXE = process.platform === 'win32' ? 'xray.exe' : 'xray';

export function findCore(dataDir: string, configured: string): string | null {
  const candidates = [
    configured,
    path.join(dataDir, 'core', EXE),
    process.env.RAYLIT_BUNDLED_CORE ? path.join(process.env.RAYLIT_BUNDLED_CORE, EXE) : '',
  ];
  for (const c of candidates) {
    if (!c) continue;
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      /* next */
    }
  }
  return null;
}

export function assetDir(corePath: string): string {
  const dir = path.dirname(corePath);
  for (const d of [dir, path.dirname(dir)]) if (fs.existsSync(path.join(d, 'geoip.dat'))) return d;
  return dir;
}

export function coreVersion(corePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const p = spawn(corePath, ['version'], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d: Buffer) => (out += d.toString()));
    p.on('error', () => resolve(null));
    p.on('close', () => resolve(/Xray\s+([\w.-]+)/.exec(out)?.[1] ?? null));
    setTimeout(() => p.kill(), 5000);
  });
}

const LEVEL = /\[(Debug|Info|Warning|Error)\]/;

export function parseLogLine(text: string): LogLine {
  const m = LEVEL.exec(text);
  const lvl = m?.[1];
  // Xray prefixes every line with a date and time; the log pane shows its own time.
  const clean = text.replace(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}(\.\d+)? /, '');
  return { t: Date.now(), level: lvl === 'Error' ? 'error' : lvl === 'Warning' ? 'warning' : 'info', text: clean };
}

export interface RunOptions {
  corePath: string;
  configFile: string;
  config: unknown;
  /** A port the config listens on: the core counts as started once it accepts connections. */
  readyPort: number;
  onLog: (line: LogLine) => void;
  onExit: (code: number | null, lastError: string | undefined) => void;
}

/** One running Xray process. */
export class CoreProcess {
  private child: ChildProcess | null = null;
  private stopping = false;
  private lastError: string | undefined;

  get pid(): number | undefined {
    return this.child?.pid;
  }

  get running(): boolean {
    return !!this.child && this.child.exitCode === null;
  }

  async start(o: RunOptions): Promise<void> {
    await atomicWrite(o.configFile, JSON.stringify(o.config, null, 2));
    const child = spawn(o.corePath, ['run', '-c', o.configFile], {
      windowsHide: true,
      cwd: path.dirname(o.corePath),
      env: { ...process.env, XRAY_LOCATION_ASSET: assetDir(o.corePath) },
    });
    this.child = child;
    this.stopping = false;
    this.lastError = undefined;

    let buffer = '';
    const onData = (d: Buffer) => {
      buffer += d.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const l of lines) {
        if (!l.trim()) continue;
        const line = parseLogLine(l);
        if (line.level === 'error' || /failed|error|invalid/i.test(line.text)) this.lastError = line.text;
        o.onLog(line);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);

    const exited = new Promise<never>((_, reject) => {
      child.once('error', (e) => reject(new Error(`Could not run Xray: ${errorMessage(e)}`)));
      child.once('exit', (code) => reject(new Error(this.lastError ? `Xray stopped: ${this.lastError}` : `Xray exited (code ${code})`)));
    });
    // Handled here once, so an exit after a failed or finished start is never an unhandled rejection.
    exited.catch(() => undefined);
    let started = false;
    child.once('exit', (code) => {
      if (this.child === child) this.child = null;
      // An exit before the start finished is reported by start() itself.
      if (started && !this.stopping) o.onExit(code, this.lastError);
    });

    try {
      await Promise.race([
        exited,
        waitForPort(o.readyPort, 10_000).then((ok) => {
          if (!ok) throw new Error('Xray did not start within 10 seconds');
        }),
      ]);
      started = true;
    } catch (e) {
      await this.stop();
      throw e;
    }
  }

  stop(): Promise<void> {
    const child = this.child;
    if (!child || child.exitCode !== null) return Promise.resolve();
    this.stopping = true;
    return new Promise((resolve) => {
      const t = setTimeout(resolve, 3000);
      child.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
      child.kill();
    });
  }
}

/** The Xray-core release asset for this machine. */
export function releaseAsset(platform = process.platform, arch = process.arch): string {
  const os = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux';
  const a = arch === 'arm64' ? 'arm64-v8a' : arch === 'ia32' ? '32' : '64';
  return `Xray-${os}-${a}.zip`;
}

const RELEASE_BASE = 'https://github.com/XTLS/Xray-core/releases/latest/download';

/**
 * Download the latest Xray-core release from GitHub, check it against the SHA-256 in its .dgst file, and unpack the
 * executable and the geo files into `dir`.
 */
export async function installCore(dir: string, onProgress: (percent: number) => void): Promise<string> {
  const asset = releaseAsset();
  const dgst = await fetchUrl(`${RELEASE_BASE}/${asset}.dgst`, { timeoutMs: 30_000, maxBytes: 64 * 1024 });
  if (dgst.status !== 200) throw new Error(`GitHub answered ${dgst.status} for ${asset}.dgst`);
  const expected = /SHA2-256=\s*([0-9a-f]{64})/i.exec(dgst.body.toString())?.[1]?.toLowerCase();
  if (!expected) throw new Error('The release has no SHA-256 checksum');

  const zip = await fetchUrl(`${RELEASE_BASE}/${asset}`, {
    timeoutMs: 10 * 60_000,
    maxBytes: 200 * 1024 * 1024,
    onProgress: (got, total) => total && onProgress(Math.round((got / total) * 100)),
  });
  if (zip.status !== 200) throw new Error(`GitHub answered ${zip.status} for ${asset}`);
  const actual = createHash('sha256').update(zip.body).digest('hex');
  if (actual !== expected) throw new Error('The download is corrupt (checksum mismatch)');

  const wanted = new Set([EXE, 'geoip.dat', 'geosite.dat']);
  const files = unzip(zip.body).filter((f) => wanted.has(f.name));
  if (!files.some((f) => f.name === EXE)) throw new Error(`${asset} does not contain ${EXE}`);
  await fs.promises.mkdir(dir, { recursive: true });
  for (const f of files) {
    const target = path.join(dir, f.name);
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, f.data, { mode: 0o755 });
    await fs.promises.rename(tmp, target);
  }
  return path.join(dir, EXE);
}

/** The top-level files of a zip archive (stored or deflated; no zip64, which Xray's archives do not need). */
export function unzip(buf: Buffer): { name: string; data: Buffer }[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip archive');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: { name: string; data: Buffer }[] = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Damaged zip archive');
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || name.includes('/') || name.includes('\\')) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + compressed);
    if (method === 0) out.push({ name, data: Buffer.from(raw) });
    else if (method === 8) out.push({ name, data: inflateRawSync(raw) });
  }
  return out;
}
