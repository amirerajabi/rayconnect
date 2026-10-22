import { ArrowDown, ArrowDownCircle, ArrowUp, CircleAlert, Cpu, LoaderCircle, RefreshCw, Shield, ShieldOff, Wifi, WifiOff } from 'lucide-react';
import { runCommand } from '../../app/commands';
import { formatSpeed } from '../../lib/format';
import { useConnection } from '../../store/connection';
import { useEngine } from '../../store/engine';
import { useServers } from '../../store/servers';
import { useUi } from '../../store/ui';
import { updateChip, useUpdates } from '../../store/updates';
import { ROUTING_LABEL } from '../Sidebar/QuickPanel';

const WS_LABEL = { connecting: 'Engine: connecting…', open: 'Engine connected', reconnecting: 'Engine: reconnecting…', closed: 'Engine: disconnected' };

export function StatusBar() {
  const ws = useUi((s) => s.wsStatus);
  const connection = useConnection((s) => s.connection);
  const traffic = useConnection((s) => s.traffic);
  const testing = useConnection((s) => s.testing);
  const settings = useEngine((s) => s.settings);
  const core = useEngine((s) => s.core);
  const count = useServers((s) => s.servers.length);
  const on = connection.status === 'connected';

  return (
    <footer className="statusbar" aria-label="Status bar">
      <span className={`sb-item sb-ws ws-${ws}`} title={WS_LABEL[ws]} role="img" aria-label={WS_LABEL[ws]}>
        {ws === 'open' ? <Wifi size={12} /> : <WifiOff size={12} />}
      </span>
      <span className={`sb-item sb-conn sb-${connection.status}`}>{on ? 'Connected' : connection.status === 'connecting' ? 'Connecting…' : 'Not connected'}</span>
      {on && (
        <span className="sb-item tabular">
          <ArrowDown size={12} />
          {formatSpeed(traffic.down)}
          <ArrowUp size={12} />
          {formatSpeed(traffic.up)}
        </span>
      )}
      {testing && (
        <span className="sb-item muted">
          <LoaderCircle size={12} className="spin" /> Testing delays…
        </span>
      )}
      <div className="flex-1" />
      <span className="sb-item muted">{count} servers</span>
      {settings && (
        <>
          <button className="sb-item sb-button muted" title="Change routing in Quick settings" onClick={() => useUi.getState().setLayout({ sidebarVisible: true, dock: 'quick' })}>
            {ROUTING_LABEL[settings.routing].label}
          </button>
          <button
            className={`sb-item sb-button${on && connection.systemProxy ? ' sb-on' : settings.proxyMode === 'manual' ? ' muted' : ''}`}
            title={
              settings.proxyMode === 'system'
                ? on && connection.systemProxy
                  ? `System proxy is set to 127.0.0.1:${settings.httpPort}. Click for Proxy only.`
                  : 'System proxy is set while connected. Click for Proxy only.'
                : `Proxy only: apps use 127.0.0.1:${settings.httpPort} (HTTP) or ${settings.socksPort} (SOCKS). Click for System proxy.`
            }
            onClick={() => runCommand('proxy.toggle')}
          >
            {settings.proxyMode === 'system' ? <Shield size={12} /> : <ShieldOff size={12} />}
            {settings.proxyMode === 'system' ? 'System proxy' : 'Proxy only'}
          </button>
        </>
      )}
      <button className={`sb-item sb-button${core.path ? ' muted' : ' sb-warn'}`} title={core.path ?? 'Xray is not installed'} onClick={() => useUi.getState().set({ settingsOpen: 'core' })}>
        <Cpu size={12} />
        {core.installing ? `Xray ${core.progress ?? 0}%` : core.version ? `Xray ${core.version}` : 'No Xray'}
      </button>
      <UpdateChip />
    </footer>
  );
}

/** Grabbit's update chip: checking, download progress, "Restart to update", or a quiet mark after a failed check. */
function UpdateChip() {
  const status = useUpdates((s) => s.status);
  const chip = updateChip(status);
  if (!status || !chip) return null;
  const ready = status.state === 'ready';
  const error = status.state === 'error';
  const Icon = status.state === 'checking' ? LoaderCircle : ready ? RefreshCw : error ? CircleAlert : ArrowDownCircle;
  return (
    <button
      className={`sb-item sb-button sb-update tone-${chip.tone}`}
      title={ready ? `${chip.text}. Click to restart now.` : error ? `${chip.text}: ${status.message ?? ''}` : chip.text}
      aria-label={chip.text}
      onClick={() => (ready || status.state === 'available' ? void useUpdates.getState().install() : useUi.getState().set({ settingsOpen: 'updates' }))}
    >
      <Icon size={12} className={status.state === 'checking' ? 'spin' : undefined} />
      {!error && <span>{chip.text}</span>}
      {status.state === 'downloading' && (
        <span className="sb-update-bar" aria-hidden="true">
          <span className="sb-update-fill" style={{ width: `${status.percent ?? 0}%` }} />
        </span>
      )}
    </button>
  );
}
