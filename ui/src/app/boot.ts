import type { EngineEvent } from '../../../shared/protocol';
import { api } from '../api/client';
import { connectEvents } from '../api/ws';
import { displayName } from '../components/common/visuals';
import { getPlatform } from '../platform';
import { useConnection } from '../store/connection';
import { useEngine } from '../store/engine';
import { useServers } from '../store/servers';
import { useUi } from '../store/ui';
import { useUpdates } from '../store/updates';

async function loadState(): Promise<void> {
  try {
    const state = await api.state();
    useEngine.getState().load(state);
    useServers.getState().setServers(state.servers, state.selectedId);
    useServers.getState().setSubscriptions(state.subscriptions);
    const c = useConnection.getState();
    c.setConnection(state.connection);
    c.setLogs(state.logs);
    c.setTesting(state.testing);
    useUi.getState().setEngineError(null);
    syncPreferences();
    syncTray();
  } catch (e) {
    useUi.getState().setEngineError(e instanceof Error ? e.message : String(e));
  }
}

function syncPreferences(): void {
  const s = useEngine.getState().settings;
  if (s) getPlatform().setPreferences({ minimizeToTray: s.minimizeToTray, autoUpdate: s.autoUpdate, launchAtLogin: s.launchAtLogin, language: s.language });
}

/** The tray icon and its Connect / Disconnect item follow the connection. */
function syncTray(): void {
  const { connection } = useConnection.getState();
  const server = useServers.getState().servers.find((s) => s.id === (connection.serverId ?? useServers.getState().selectedId));
  const status = connection.status === 'connected' ? 'connected' : connection.status === 'connecting' ? 'connecting' : 'disconnected';
  getPlatform().setTrayState({ status, server: server ? displayName(server.name) : '', systemProxy: useEngine.getState().settings?.proxyMode === 'system' });
}

function onEvent(e: EngineEvent): void {
  switch (e.type) {
    case 'settings':
      useEngine.getState().setSettings(e.settings);
      syncPreferences();
      syncTray();
      return;
    case 'servers':
      useServers.getState().setServers(e.servers, e.selectedId);
      syncTray();
      return;
    case 'subscriptions':
      useServers.getState().setSubscriptions(e.subscriptions);
      return;
    case 'connection': {
      const prev = useConnection.getState().connection;
      useConnection.getState().setConnection(e.connection);
      syncTray();
      const name = useServers.getState().servers.find((s) => s.id === e.connection.serverId)?.name ?? '';
      if (e.connection.status === 'connected' && prev.status !== 'connected') getPlatform().notify('Connected', name);
      return;
    }
    case 'traffic':
      useConnection.getState().setTraffic(e.traffic);
      return;
    case 'core':
      useEngine.getState().setCore(e.core);
      return;
    case 'log':
      useConnection.getState().addLogs(e.lines);
      return;
    case 'delay':
      useServers.getState().applyDelays(e.results);
      return;
    case 'testing':
      useConnection.getState().setTesting(e.testing);
      return;
    case 'notify':
      useUi.getState().toast({ level: e.level, text: e.text, detail: e.detail });
      if (e.level === 'error') getPlatform().notify(e.text, e.detail ?? '');
      return;
  }
}

let started = false;

export function boot(): void {
  if (started) return;
  started = true;
  connectEvents(onEvent, loadState);
  // In-app updates (desktop): the current state now, then every change the main process pushes.
  const platform = getPlatform();
  void platform.getUpdateStatus().then((s) => s && useUpdates.getState().setStatus(s));
  platform.onUpdateStatus((s) => useUpdates.getState().setStatus(s));
}

export const reloadState = loadState;
