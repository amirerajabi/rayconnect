import type { ConnectionState, CoreInfo, EngineState, ImportResult, Server, Settings, Subscription } from '../../../shared/protocol';
import { getPlatform } from '../platform';

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { engineUrl, token } = getPlatform();
  let res: Response;
  try {
    res = await fetch(`${engineUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the RayConnect engine');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  state: () => call<EngineState>('GET', '/api/state'),
  updateSettings: (patch: Partial<Settings>) => call<Settings>('PUT', '/api/settings', patch),
  importLinks: (text: string) => call<ImportResult>('POST', '/api/servers/import', { text }),
  updateServer: (id: string, patch: { name?: string; link?: string }) => call<Server>('PATCH', `/api/servers/${id}`, patch),
  shareLink: (id: string) => call<{ link: string }>('GET', `/api/servers/${id}/link`),
  deleteServers: (ids: string[]) => call<{ ok: true }>('POST', '/api/servers/delete', { ids }),
  test: (ids: string[]) => call<{ ok: true }>('POST', '/api/servers/test', { ids }),
  select: (id: string) => call<{ ok: true }>('POST', `/api/servers/${id}/select`),
  connect: (id?: string) => call<ConnectionState>('POST', '/api/connect', { id }),
  disconnect: () => call<ConnectionState>('POST', '/api/disconnect'),
  connectFastest: (groupId?: string) => call<ConnectionState>('POST', '/api/connect-fastest', { groupId }),
  addSubscription: (name: string, url: string) => call<Subscription>('POST', '/api/subscriptions', { name, url }),
  editSubscription: (id: string, patch: Partial<Pick<Subscription, 'name' | 'url' | 'autoUpdateHours'>>) => call<Subscription>('PATCH', `/api/subscriptions/${id}`, patch),
  deleteSubscription: (id: string) => call<{ ok: true }>('DELETE', `/api/subscriptions/${id}`),
  updateSubscription: (id: string) => call<{ count: number }>('POST', `/api/subscriptions/${id}/update`),
  installCore: () => call<CoreInfo>('POST', '/api/core/install'),
  refreshCore: () => call<CoreInfo>('POST', '/api/core/refresh'),
  clearLogs: () => call<{ ok: true }>('POST', '/api/logs/clear'),
};
