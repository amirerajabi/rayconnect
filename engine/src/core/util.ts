import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function newId(): string {
  return randomBytes(8).toString('hex');
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

let tmpCounter = 0;

/**
 * Write a file atomically: temp file + rename, so a crash never leaves half a JSON document. Each call gets its own temp
 * file, so overlapping writes of the same file cannot rename each other's temp file away.
 */
export async function atomicWrite(file: string, data: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${++tmpCounter}.tmp`;
  await fs.promises.writeFile(tmp, data, 'utf8');
  await fs.promises.rename(tmp, file);
}

export function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    const code = (e as NodeJS.ErrnoException).code;
    const friendly = code ? NET_ERRORS[code] : undefined;
    return friendly ?? e.message;
  }
  return String(e);
}

const NET_ERRORS: Record<string, string> = {
  ENOTFOUND: 'Server not found (DNS lookup failed)',
  ECONNREFUSED: 'Connection refused',
  ECONNRESET: 'Connection reset',
  ETIMEDOUT: 'Connection timed out',
  EAI_AGAIN: 'DNS lookup timed out',
  EACCES: 'Permission denied',
  EPERM: 'Permission denied',
  ENOENT: 'File not found',
  CERT_HAS_EXPIRED: 'The server certificate has expired',
};
