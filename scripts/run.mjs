// Launchers (Grabbit's, with RayConnect's ports):
//   browser      engine (tsx watch, token "dev") + Vite; open http://localhost:5174. The engine takes 7330, or a free
//                port when 7330 is busy, and Vite is told which (VITE_ENGINE_URL).
//   desktop-dev  Vite + Electron loading it (Electron starts its own engine from engine/dist, rebuilt first)
//   desktop      Electron on the built UI (run `npm run build` first; `npm start` does both)
// Development state lives in .dev-data/: the engine's data in browser mode, and a separate Electron profile
// (.dev-data/desktop) in the desktop modes, so a dev window never shares the installed app's profile or servers.
//
// Development runs never touch the OS proxy setting (RAYCONNECT_NO_SYSPROXY=1): the machine's proxy may belong to the
// installed RayConnect or another client. Set RAYCONNECT_SYSPROXY=1 to test System proxy mode for real.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'browser';
const win = process.platform === 'win32';
const children = [];
const ENGINE_PORT = 7330;
const UI_PORT = 5174;

const baseEnv = { ...process.env, ...(process.env.RAYCONNECT_SYSPROXY === '1' ? {} : { RAYCONNECT_NO_SYSPROXY: '1' }) };

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: 'inherit', shell: win, cwd: root, env: baseEnv, ...opts });
  children.push(child);
  child.on('exit', (code) => {
    // One part exiting ends the session.
    for (const c of children) if (c !== child && c.exitCode === null) stop(c);
    process.exitCode = code ?? 0;
  });
  return child;
}

/**
 * Stop a child and everything it started. On Windows the children run through a shell, and kill() would only end the
 * shell, leaving Vite or the engine running on their own.
 */
function stop(child) {
  if (win && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill();
}

function stopAll() {
  for (const c of children) if (c.exitCode === null) stop(c);
}

function npm(args, opts) {
  const r = spawnSync('npm', args, { stdio: 'inherit', shell: win, cwd: root, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/** Vite's "localhost" may be IPv4 or IPv6 depending on the machine: try both. */
function waitForPort(port, timeoutMs = 60000) {
  const until = Date.now() + timeoutMs;
  const hosts = ['127.0.0.1', '::1'];
  let attempt = 0;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const s = net.connect(port, hosts[attempt++ % hosts.length]);
      s.once('connect', () => (s.destroy(), resolve()));
      s.once('error', () => {
        s.destroy();
        if (Date.now() > until) reject(new Error(`port ${port} did not open`));
        else setTimeout(tryOnce, 150);
      });
    };
    tryOnce();
  });
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

const devProfile = { ...baseEnv, RAYCONNECT_USER_DATA: process.env.RAYCONNECT_USER_DATA ?? join(root, '.dev-data', 'desktop') };

function electronBinary() {
  return createRequire(join(root, 'desktop', 'package.json'))('electron');
}

process.on('SIGINT', () => {
  stopAll();
  process.exit(0);
});
// A launcher that fails (a port that never opens) must not leave the dev servers running behind it.
process.on('unhandledRejection', (e) => {
  console.error(e);
  stopAll();
  process.exit(1);
});

if (mode === 'browser') {
  const port = (await portIsFree(ENGINE_PORT)) ? ENGINE_PORT : await freePort();
  if (port !== ENGINE_PORT) console.log(`\n  Port ${ENGINE_PORT} is in use: the dev engine uses ${port} instead.\n`);
  run('npx', ['tsx', 'watch', 'src/index.ts', '--port', String(port), '--token', 'dev', '--data-dir', '../.dev-data'], { cwd: join(root, 'engine') });
  run('npm', ['--prefix', 'ui', 'run', 'dev'], { env: { ...baseEnv, VITE_ENGINE_URL: `http://127.0.0.1:${port}` } });
  await waitForPort(UI_PORT);
  console.log(`\n  RayConnect UI: http://localhost:${UI_PORT}  (engine on 127.0.0.1:${port}, token "dev")\n`);
} else if (mode === 'desktop-dev') {
  npm(['--prefix', 'engine', 'run', 'bundle']);
  npm(['--prefix', 'desktop', 'run', 'bundle']);
  run('npm', ['--prefix', 'ui', 'run', 'dev']);
  await waitForPort(UI_PORT);
  run(electronBinary(), ['.'], { cwd: join(root, 'desktop'), shell: false, env: { ...devProfile, RAYCONNECT_DEV_URL: `http://localhost:${UI_PORT}` } });
} else if (mode === 'desktop') {
  run(electronBinary(), ['.'], { cwd: join(root, 'desktop'), shell: false, env: devProfile });
} else {
  console.error(`unknown mode ${mode}: browser | desktop-dev | desktop`);
  process.exit(1);
}
