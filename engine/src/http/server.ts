import * as http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import type { EngineEvent, EngineState, Settings } from '../../../shared/protocol';
import type { Manager } from '../core/Manager';
import { errorMessage } from '../core/util';

export const ENGINE_VERSION = '0.1.0';

type Handler = (ctx: { body: any; params: Record<string, string> }) => Promise<unknown> | unknown;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

class HttpFailure extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Local API: REST under /api and live events on /ws?token=..., both guarded by the per-launch token. */
export function createServer(manager: Manager, token: string): http.Server {
  const routes: Route[] = [];
  const route = (method: string, p: string, handler: Handler) => {
    const keys: string[] = [];
    const pattern = new RegExp(`^${p.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
    routes.push({ method, pattern, keys, handler });
  };

  route('GET', '/api/state', (): EngineState => ({ ...manager.state(), version: ENGINE_VERSION }));
  route('PUT', '/api/settings', ({ body }) => manager.updateSettings((body ?? {}) as Partial<Settings>));

  route('POST', '/api/servers/import', ({ body }) => {
    const text = typeof body?.text === 'string' ? body.text : '';
    if (!text.trim()) throw new HttpFailure(400, 'Paste one or more share links');
    if (text.length > 5 * 1024 * 1024) throw new HttpFailure(400, 'That is too much text');
    return manager.importText(text);
  });
  route('PATCH', '/api/servers/:id', ({ params, body }) => manager.updateServer(params.id, { name: body?.name, link: body?.link }));
  route('GET', '/api/servers/:id/link', ({ params }) => ({ link: manager.shareLink(params.id) }));
  route('POST', '/api/servers/delete', async ({ body }) => (await manager.deleteServers(ids(body?.ids)), { ok: true }));
  route('POST', '/api/servers/test', ({ body }) => {
    // Answers at once; results arrive as 'delay' events.
    void manager.testDelays(ids(body?.ids)).catch((e) => manager.log('error', `Delay test failed: ${errorMessage(e)}`));
    return { ok: true };
  });
  route('POST', '/api/servers/:id/select', ({ params }) => (manager.select(params.id), { ok: true }));

  route('POST', '/api/connect', ({ body }) => manager.connect(typeof body?.id === 'string' ? body.id : undefined));
  route('POST', '/api/disconnect', () => manager.disconnect());
  route('POST', '/api/connect-fastest', ({ body }) => manager.connectFastest(typeof body?.groupId === 'string' ? body.groupId : undefined));

  route('POST', '/api/subscriptions', ({ body }) => manager.addSubscription(String(body?.name ?? ''), String(body?.url ?? '')));
  route('PATCH', '/api/subscriptions/:id', ({ params, body }) => manager.editSubscription(params.id, body ?? {}));
  route('DELETE', '/api/subscriptions/:id', async ({ params }) => (await manager.deleteSubscription(params.id), { ok: true }));
  route('POST', '/api/subscriptions/:id/update', ({ params }) => manager.updateSubscription(params.id));

  route('POST', '/api/core/install', () => manager.installCore());
  route('POST', '/api/core/refresh', () => manager.refreshCore());
  route('POST', '/api/logs/clear', () => (manager.clearLogs(), { ok: true }));

  const tokenBuf = Buffer.from(token);
  const authorized = (value: string | null | undefined) => {
    if (!value) return false;
    const b = Buffer.from(value);
    return b.length === tokenBuf.length && timingSafeEqual(b, tokenBuf);
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const origin = req.headers.origin;
    // CORS for the Vite dev server (the UI runs on another origin in development); the token still guards everything.
    if (origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    const auth = req.headers.authorization;
    if (!authorized(auth?.startsWith('Bearer ') ? auth.slice(7) : null)) return send(res, 401, { error: 'Unauthorized' });

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.pattern.exec(url.pathname);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      try {
        const body = req.method === 'GET' || req.method === 'DELETE' ? null : await readBody(req);
        const result = await r.handler({ body, params });
        return send(res, 200, result ?? { ok: true });
      } catch (e) {
        const status = e instanceof HttpFailure ? e.status : 400;
        return send(res, status, { error: errorMessage(e) });
      }
    }
    return send(res, 404, { error: 'Not found' });
  });

  // ---- WebSocket: one broadcast stream of EngineEvents
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws' || !authorized(url.searchParams.get('token'))) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      ws.on('close', () => clients.delete(ws));
      ws.on('error', () => clients.delete(ws));
    });
  });
  manager.on('event', (e: EngineEvent) => {
    const msg = JSON.stringify(e);
    for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(msg);
  });

  return server;
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) {
        reject(new HttpFailure(413, 'Request too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (size === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpFailure(400, 'Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}
