import { ArrowDown, ArrowUp, Clock, Download, Gauge, LoaderCircle, Power, Server as ServerIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { attempt, runCommand, toggleConnection } from '../../app/commands';
import { delayText, delayTone, formatBytes, formatDuration, formatSpeed, transportLabel } from '../../lib/format';
import { useConnection } from '../../store/connection';
import { useEngine } from '../../store/engine';
import { useServers } from '../../store/servers';
import { useUi } from '../../store/ui';
import { ProtocolBadge } from '../common/visuals';

const TITLE = { disconnected: 'Not connected', connecting: 'Connecting…', connected: 'Connected', disconnecting: 'Disconnecting…' };

/** Re-render every second while `on`, for the connection timer. */
function useTick(on: boolean): void {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [on]);
}

/**
 * The top of the window: one big button to connect, what it is connected to, and how it is doing (speed graph,
 * totals, time, delay). Proxy mode sits right there because it is the one choice that matters to most people.
 */
export function ConnectionPanel() {
  const connection = useConnection((s) => s.connection);
  const traffic = useConnection((s) => s.traffic);
  const history = useConnection((s) => s.history);
  const servers = useServers((s) => s.servers);
  const selectedId = useServers((s) => s.selectedId);
  const settings = useEngine((s) => s.settings);
  const core = useEngine((s) => s.core);
  const status = connection.status;
  const on = status === 'connected';
  const busy = status === 'connecting' || status === 'disconnecting';
  useTick(on);

  const server = servers.find((s) => s.id === (connection.serverId ?? selectedId));
  const noCore = !core.path;

  return (
    <section className={`conn conn-${status}`} aria-label="Connection">
      <button
        type="button"
        className="power"
        onClick={() => void toggleConnection()}
        disabled={status === 'disconnecting' || (!server && !on)}
        aria-pressed={on}
        aria-label={on ? 'Disconnect' : 'Connect'}
        title={on ? 'Disconnect (Ctrl+Enter)' : server ? `Connect to ${server.name} (Ctrl+Enter)` : 'Add a server first'}
      >
        {busy ? <LoaderCircle size={30} className="spin" /> : <Power size={30} data-stroke />}
      </button>

      <div className="conn-main">
        <div className="conn-title">
          <span className="conn-dot" aria-hidden="true" />
          <h1>{TITLE[status]}</h1>
          {on && connection.since && <span className="conn-time tabular">{formatDuration(Date.now() - connection.since)}</span>}
        </div>
        {server ? (
          <div className="conn-server" title={`${server.address}:${server.port}`}>
            <ServerIcon size={14} className="muted" />
            <span className="ellipsis strong">{server.name}</span>
            <ProtocolBadge protocol={server.protocol} />
            <span className="muted conn-transport">{transportLabel(server)}</span>
          </div>
        ) : (
          <div className="conn-server muted">Add a server to get started: paste a share link or add a subscription.</div>
        )}
        {connection.error && status === 'disconnected' && <div className="conn-error">{connection.error}</div>}
        {noCore && <CoreNotice />}
        {settings && (
          <div className="conn-mode">
            <div className="segmented" role="radiogroup" aria-label="Proxy mode">
              <button
                role="radio"
                aria-checked={settings.proxyMode === 'system'}
                className={settings.proxyMode === 'system' ? 'on' : ''}
                title="Browsers and most apps use the connection automatically"
                onClick={() => void attempt(() => useEngine.getState().updateSettings({ proxyMode: 'system' }))}
              >
                System proxy
              </button>
              <button
                role="radio"
                aria-checked={settings.proxyMode === 'manual'}
                className={settings.proxyMode === 'manual' ? 'on' : ''}
                title="Only apps you configure use the connection"
                onClick={() => void attempt(() => useEngine.getState().updateSettings({ proxyMode: 'manual' }))}
              >
                Proxy only
              </button>
            </div>
            <span className="muted conn-ports tabular">
              HTTP {settings.httpPort} · SOCKS {settings.socksPort}
            </span>
          </div>
        )}
      </div>

      <div className="conn-stats" aria-label="Traffic">
        <Sparkline points={history.map((h) => h.down)} second={history.map((h) => h.up)} active={on} />
        <div className="conn-figures">
          <Figure icon={ArrowDown} label="Download" value={on ? formatSpeed(traffic.down) : '—'} sub={on ? formatBytes(traffic.totalDown) : ''} tone="down" />
          <Figure icon={ArrowUp} label="Upload" value={on ? formatSpeed(traffic.up) : '—'} sub={on ? formatBytes(traffic.totalUp) : ''} tone="up" />
          <Figure
            icon={Gauge}
            label="Delay"
            // The server's delay is the newest: the tunnel's own measurement, or a later test.
            value={on ? (connection.delay === null ? 'Testing…' : delayText(server?.delay ?? connection.delay)) : '—'}
            tone={on ? delayTone(server?.delay ?? connection.delay) : undefined}
            onClick={on && connection.serverId ? () => void attempt(() => api.test([connection.serverId!])) : undefined}
          />
          <Figure icon={Clock} label="Connected for" value={on && connection.since ? formatDuration(Date.now() - connection.since) : '—'} />
        </div>
      </div>
    </section>
  );
}

function Figure({ icon: Icon, label, value, sub, tone, onClick }: { icon: typeof Gauge; label: string; value: string; sub?: string; tone?: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="figure-label">
        <Icon size={12} />
        {label}
      </span>
      <span className="figure-value tabular">{value}</span>
      {sub ? <span className="figure-sub tabular">{sub}</span> : null}
    </>
  );
  const cls = `figure${tone ? ` figure-${tone}` : ''}`;
  return onClick ? (
    <button type="button" className={`${cls} figure-btn`} onClick={onClick} title="Test again">
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A minute of download (filled) and upload (line) speed. */
function Sparkline({ points, second, active }: { points: number[]; second: number[]; active: boolean }) {
  const W = 220;
  const H = 54;
  const n = 60;
  const max = Math.max(1024, ...points, ...second);
  const path = (vals: number[]) =>
    vals
      .map((v, i) => {
        const x = W - (vals.length - 1 - i) * (W / (n - 1));
        const y = H - 2 - (v / max) * (H - 6);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  const down = path(points);
  const firstX = points.length ? W - (points.length - 1) * (W / (n - 1)) : W;
  return (
    <svg className={`spark${active ? '' : ' idle'}`} viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <line x1="0" y1={H - 1} x2={W} y2={H - 1} className="spark-base" />
      {points.length > 1 && (
        <>
          <path d={`${down} L${W},${H - 1} L${firstX.toFixed(1)},${H - 1} Z`} className="spark-fill" />
          <path d={down} className="spark-down" />
          <path d={path(second)} className="spark-up" />
        </>
      )}
    </svg>
  );
}

/** Raylit needs Xray to connect: offer to download it right where the user would notice. */
function CoreNotice() {
  const core = useEngine((s) => s.core);
  return (
    <div className="notice warning core-notice">
      <Download size={16} />
      <span className="flex-1">
        {core.installing ? `Downloading Xray… ${core.progress ?? 0}%` : core.error ? `Xray download failed: ${core.error}` : 'Xray (the core Raylit connects with) is not installed yet.'}
      </span>
      {!core.installing && (
        <>
          <button className="btn btn-xs btn-primary" onClick={() => runCommand('core.install')}>
            Download Xray
          </button>
          <button className="btn btn-xs" onClick={() => useUi.getState().set({ settingsOpen: 'core' })}>
            Choose file…
          </button>
        </>
      )}
    </div>
  );
}
