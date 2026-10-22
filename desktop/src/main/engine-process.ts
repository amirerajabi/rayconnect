// The engine runs as an Electron utility process (Node without a window), like Grabbit's: the UI talks to it over
// HTTP + WebSocket with a per-launch token, so the connection stays up while the window is closed.
import { utilityProcess, type UtilityProcess } from 'electron';
import { randomBytes } from 'node:crypto';
import { bundledCoreDir, dataDir, engineEntry } from './paths';

export interface EngineInfo {
  url: string;
  token: string;
  port: number;
}

let child: UtilityProcess | null = null;

export function startEngine(): Promise<EngineInfo> {
  const token = randomBytes(24).toString('hex');
  return new Promise((resolve, reject) => {
    // Port 0: nothing outside the app needs to find the engine, so any free port will do.
    const proc = utilityProcess.fork(engineEntry(), ['--port', '0', '--token', token, '--data-dir', dataDir()], {
      serviceName: 'Raylit engine',
      stdio: 'pipe',
      env: { ...process.env, RAYLIT_BUNDLED_CORE: bundledCoreDir() },
    });
    child = proc;
    const timer = setTimeout(() => reject(new Error('The engine did not start within 15 seconds')), 15_000);
    proc.stdout?.on('data', (d: Buffer) => process.stdout.write(`[engine] ${d}`));
    proc.stderr?.on('data', (d: Buffer) => process.stderr.write(`[engine] ${d}`));
    proc.on('message', (m: { type?: string; port?: number }) => {
      if (m?.type !== 'ready' || typeof m.port !== 'number') return;
      clearTimeout(timer);
      resolve({ url: `http://127.0.0.1:${m.port}`, token, port: m.port });
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      if (child === proc) child = null;
      reject(new Error(`The engine exited (code ${code})`));
    });
  });
}

/** Ask the engine to disconnect (which puts the system proxy back) and save, then make sure it is gone. */
export function stopEngine(): Promise<void> {
  const proc = child;
  if (!proc) return Promise.resolve();
  return new Promise((resolve) => {
    const kill = setTimeout(() => {
      proc.kill();
      resolve();
    }, 8000);
    proc.once('exit', () => {
      clearTimeout(kill);
      resolve();
    });
    proc.postMessage({ type: 'shutdown' });
  });
}
