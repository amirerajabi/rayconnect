// Small HTTP client with what RayConnect needs and Node's fetch lacks: going through an HTTP proxy (CONNECT for https),
// a hard overall timeout and a size cap. Also TCP ping and free-port helpers.
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as tls from 'node:tls';

export interface FetchOptions {
  /** Local HTTP proxy port (Xray's HTTP inbound on 127.0.0.1). */
  proxyPort?: number;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  /** Stop after the response head (delay tests do not need the body). */
  headOnly?: boolean;
  /** Called with (received, total) while the body arrives. */
  onProgress?: (received: number, total: number | null) => void;
}

export interface FetchResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  /** Time until the response head arrived. */
  ms: number;
}

const MAX_REDIRECTS = 5;

export function fetchUrl(url: string, opts: FetchOptions = {}, redirects = 0): Promise<FetchResult> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxBytes = opts.maxBytes ?? 20 * 1024 * 1024;
  const u = new URL(url);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return Promise.reject(new Error('Only http and https addresses are supported'));
  const secure = u.protocol === 'https:';
  const started = Date.now();

  return new Promise<FetchResult>((resolve, reject) => {
    let done = false;
    const sockets: net.Socket[] = [];
    const finish = (err: Error | null, result?: FetchResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const s of sockets) s.destroy();
      if (err) reject(err);
      else resolve(result!);
    };
    const timer = setTimeout(() => finish(new Error('Timed out')), timeoutMs);

    const send = (socket?: net.Socket) => {
      const headers = { 'User-Agent': 'RayConnect', Accept: '*/*', ...opts.headers };
      const common = { method: 'GET', headers, path: `${u.pathname}${u.search}`, host: u.hostname, port: u.port || (secure ? 443 : 80) };
      let req: http.ClientRequest;
      if (socket && secure) {
        // createConnection is only used without an agent: TLS over the tunnel the proxy opened.
        const servername = net.isIP(u.hostname) ? undefined : u.hostname;
        req = https.request({ ...common, agent: false, createConnection: () => tls.connect({ socket, servername }) });
      } else if (opts.proxyPort && !secure) {
        // Plain http through the proxy: absolute URL in the request line.
        req = http.request({ host: '127.0.0.1', port: opts.proxyPort, method: 'GET', path: url, headers: { ...headers, Host: u.host } });
      } else {
        req = (secure ? https : http).request(common);
      }
      req.on('socket', (s) => sockets.push(s));
      req.on('error', (e) => finish(e));
      req.on('response', (res) => {
        const ms = Date.now() - started;
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location && !opts.headOnly) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) return finish(new Error('Too many redirects'));
          const next = new URL(res.headers.location, url).toString();
          clearTimeout(timer);
          done = true;
          for (const s of sockets) s.destroy();
          fetchUrl(next, opts, redirects + 1).then(resolve, reject);
          return;
        }
        if (opts.headOnly) return finish(null, { status, headers: res.headers, body: Buffer.alloc(0), ms });
        const total = Number(res.headers['content-length']) || null;
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) return finish(new Error('The response is too large'));
          chunks.push(c);
          opts.onProgress?.(size, total);
        });
        res.on('end', () => finish(null, { status, headers: res.headers, body: Buffer.concat(chunks), ms }));
        res.on('error', (e) => finish(e));
      });
      req.end();
    };

    if (opts.proxyPort && secure) {
      const connect = http.request({ host: '127.0.0.1', port: opts.proxyPort, method: 'CONNECT', path: `${u.hostname}:${u.port || 443}` });
      connect.on('socket', (s) => sockets.push(s));
      connect.on('error', (e) => finish(e));
      connect.on('connect', (res, socket) => {
        sockets.push(socket);
        if (res.statusCode !== 200) return finish(new Error(`Proxy refused the connection (${res.statusCode})`));
        send(socket);
      });
      connect.end();
    } else {
      send();
    }
  });
}

/** Time to open a TCP connection, in ms; -1 when it fails or takes longer than `timeoutMs`. */
export function tcpPing(host: string, port: number, timeoutMs = 3000): Promise<number> {
  return new Promise((resolve) => {
    const started = Date.now();
    const s = net.connect({ host, port });
    const end = (v: number) => {
      s.destroy();
      resolve(v);
    };
    s.setTimeout(timeoutMs, () => end(-1));
    s.once('connect', () => end(Date.now() - started));
    s.once('error', () => end(-1));
  });
}

export function portIsFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return portProblem(port, host).then((p) => p === null);
}

/**
 * Why `port` cannot be listened on: 'in-use' by another program, 'reserved' (Windows keeps ranges for Hyper-V and
 * WinNAT that move after a reboot, and refuses them with EACCES), or null when it is free.
 */
export function portProblem(port: number, host = '127.0.0.1'): Promise<'in-use' | 'reserved' | null> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', (e: NodeJS.ErrnoException) => resolve(e.code === 'EACCES' ? 'reserved' : 'in-use'));
    s.listen(port, host, () => s.close(() => resolve(null)));
  });
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });
}

/** Wait until something accepts connections on 127.0.0.1:port. */
export async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((await tcpPing('127.0.0.1', port, 500)) >= 0) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}
