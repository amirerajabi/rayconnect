import * as os from 'node:os';
import * as path from 'node:path';
import { Manager } from './core/Manager';
import { errorMessage } from './core/util';
import { createServer } from './http/server';

/**
 * RayConnect engine. Run by the desktop app as a utility process (it passes --port 0, --token and --data-dir), or on its
 * own for UI development: `npm run dev` listens on 7330 with the token "dev".
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function defaultDataDir(): string {
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'RayConnect');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'RayConnect');
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'rayconnect');
}

const port = Number(arg('port') ?? 7330);
const token = arg('token') ?? 'dev';
const dataDir = arg('data-dir') ?? defaultDataDir();

const manager = new Manager(dataDir);
const server = createServer(manager, token);

/** Tell the parent (Electron utilityProcess) where we listen. */
function report(msg: unknown): void {
  const parentPort = (process as unknown as { parentPort?: { postMessage(m: unknown): void } }).parentPort;
  if (parentPort) parentPort.postMessage(msg);
  else if (process.send) process.send(msg);
}

// A stray rejection must not take the engine down while the system proxy points at it.
process.on('unhandledRejection', (e) => manager.log('error', `Unexpected error: ${errorMessage(e)}`));

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE' && port !== 0) {
    console.warn(`port ${port} busy, using a random port`);
    server.listen(0, '127.0.0.1');
    return;
  }
  console.error(e);
  process.exit(1);
});

void manager.load().then(() => {
  server.listen(port, '127.0.0.1', () => {
    const addr = server.address();
    const actual = typeof addr === 'object' && addr ? addr.port : port;
    console.log(`RayConnect engine listening on http://127.0.0.1:${actual} (data: ${dataDir})`);
    report({ type: 'ready', port: actual });
    if (manager.getSettings().autoConnect && manager.state().selectedId) void manager.connect().catch(() => undefined);
  });
});

let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  server.close();
  await manager.shutdown();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
(process as unknown as { parentPort?: { on(e: string, cb: (m: { data: unknown }) => void): void } }).parentPort?.on('message', (m) => {
  if ((m.data as { type?: string })?.type === 'shutdown') void shutdown();
});
