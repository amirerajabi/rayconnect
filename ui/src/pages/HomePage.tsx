import { ArrowDown, ArrowUp, ChevronRight, Clock, Download, Gauge, LoaderCircle, Power, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RoutingMode } from '../../../shared/protocol';
import { api } from '../api/client';
import { attempt, connectFastest, runCommand, toggleConnection } from '../app/commands';
import { Sparkline } from '../components/common/Sparkline';
import { CountryBadge, displayName, ProtocolBadge } from '../components/common/visuals';
import { useT } from '../i18n';
import { delayText, delayTone, formatBytes, formatDuration, formatSpeed, transportLabel } from '../lib/format';
import { ROUTING_LABEL, ROUTING_MODES } from '../lib/routing';
import { useConnection } from '../store/connection';
import { useEngine } from '../store/engine';
import { useServers } from '../store/servers';
import { useUi } from '../store/ui';

const TITLE = { disconnected: 'Not connected', connecting: 'Connecting…', connected: 'Connected', disconnecting: 'Disconnecting…' };

/** Re-render every second while `on`, for the connection timer. */
function useTick(on: boolean): void {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [on]);
}

/** The page most people only ever need: one button, the server it uses, how it is doing, and the two switches that matter. */
export function HomePage() {
  const t = useT();
  const connection = useConnection((s) => s.connection);
  const traffic = useConnection((s) => s.traffic);
  const history = useConnection((s) => s.history);
  const testing = useConnection((s) => s.testing);
  const servers = useServers((s) => s.servers);
  const selectedId = useServers((s) => s.selectedId);
  const settings = useEngine((s) => s.settings);
  const core = useEngine((s) => s.core);
  const status = connection.status;
  const on = status === 'connected';
  const busy = status === 'connecting' || status === 'disconnecting';
  useTick(on);

  const server = servers.find((s) => s.id === (connection.serverId ?? selectedId));
  const delay = server?.delay ?? connection.delay;

  return (
    <div className={`page home conn-${status}`}>
      <section className="home-hero" aria-label={t('Connection')}>
        <button
          type="button"
          className="power"
          onClick={() => void toggleConnection()}
          disabled={status === 'disconnecting' || (!server && !on)}
          aria-pressed={on}
          aria-label={on ? t('Disconnect') : t('Connect')}
          title={on ? t('Disconnect') : server ? t('Connect to {name}', { name: server.name }) : t('Add a server first')}
        >
          {busy ? <LoaderCircle size={44} className="spin" /> : <Power size={44} data-stroke />}
        </button>
        <div className="home-status">
          <span className="conn-dot" aria-hidden="true" />
          <h1>{t(TITLE[status])}</h1>
          {on && connection.since && <span className="conn-time tabular">{formatDuration(Date.now() - connection.since)}</span>}
        </div>

        {server ? (
          <button type="button" className="server-pick" onClick={() => useUi.getState().go('servers')} title={t('Choose another server')}>
            <CountryBadge name={server.name} />
            <span className="server-pick-text">
              <span className="server-pick-name ellipsis">{displayName(server.name)}</span>
              <span className="server-pick-kind">
                <ProtocolBadge protocol={server.protocol} /> {transportLabel(server)}
              </span>
            </span>
            <span className={`delay delay-${delayTone(server.delay)}`}>{delayText(server.delay, t)}</span>
            <ChevronRight size={16} className="muted flip-rtl" />
          </button>
        ) : (
          <div className="home-empty">
            <p className="muted">{t('Add a server to get started: paste a share link or add a subscription.')}</p>
            <div className="home-empty-actions">
              <button className="btn btn-primary" onClick={() => runCommand('server.paste')}>
                {t('Paste from clipboard')}
              </button>
              <button className="btn" onClick={() => useUi.getState().set({ subscriptionFor: { id: null } })}>
                {t('Add subscription')}
              </button>
            </div>
          </div>
        )}

        {servers.length > 1 && !on && (
          <button type="button" className="link-btn fastest-link" disabled={testing || busy} onClick={() => void connectFastest()}>
            {testing ? <LoaderCircle size={14} className="spin" /> : <Zap size={14} />}
            {t('Connect to the fastest server')}
          </button>
        )}
        {connection.error && status === 'disconnected' && <div className="conn-error">{connection.error}</div>}
        {!core.path && <CoreNotice />}
      </section>

      <section className="home-stats card" aria-label={t('Traffic')}>
        <Sparkline down={history.map((h) => h.down)} up={history.map((h) => h.up)} active={on} />
        <div className="figures">
          <Figure icon={ArrowDown} label={t('Download')} value={on ? formatSpeed(traffic.down) : '—'} sub={on ? formatBytes(traffic.totalDown) : ''} tone="down" />
          <Figure icon={ArrowUp} label={t('Upload')} value={on ? formatSpeed(traffic.up) : '—'} sub={on ? formatBytes(traffic.totalUp) : ''} tone="up" />
          <Figure
            icon={Gauge}
            label={t('Delay')}
            value={on ? (connection.delay === null ? t('Testing…') : delayText(delay, t)) : '—'}
            tone={on ? delayTone(delay) : undefined}
            onClick={on && connection.serverId ? () => void attempt(() => api.test([connection.serverId!])) : undefined}
            title={t('Test again')}
          />
          <Figure icon={Clock} label={t('Connected for')} value={on && connection.since ? formatDuration(Date.now() - connection.since) : '—'} />
        </div>
      </section>

      {settings && (
        <section className="home-switches" aria-label={t('Quick settings')}>
          <div className="switch-group">
            <span className="switch-label">{t('Proxy mode')}</span>
            <div className="segmented" role="radiogroup" aria-label={t('Proxy mode')}>
              <button role="radio" aria-checked={settings.proxyMode === 'system'} className={settings.proxyMode === 'system' ? 'on' : ''} title={t('Browsers and most apps use the connection automatically.')} onClick={() => void attempt(() => useEngine.getState().updateSettings({ proxyMode: 'system' }))}>
                {t('System proxy')}
              </button>
              <button role="radio" aria-checked={settings.proxyMode === 'manual'} className={settings.proxyMode === 'manual' ? 'on' : ''} title={t('Only apps you set up use the connection.')} onClick={() => void attempt(() => useEngine.getState().updateSettings({ proxyMode: 'manual' }))}>
                {t('Proxy only')}
              </button>
            </div>
            <span className="muted switch-note tabular" dir="ltr">
              HTTP {settings.httpPort} · SOCKS {settings.socksPort}
            </span>
          </div>
          <div className="switch-group">
            <span className="switch-label">{t('Routing')}</span>
            <div className="segmented" role="radiogroup" aria-label={t('Routing')}>
              {ROUTING_MODES.map((r: RoutingMode) => (
                <button key={r} role="radio" aria-checked={settings.routing === r} className={settings.routing === r ? 'on' : ''} title={t(ROUTING_LABEL[r].hint)} onClick={() => void attempt(() => useEngine.getState().updateSettings({ routing: r }))}>
                  {t(ROUTING_LABEL[r].short)}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Figure({ icon: Icon, label, value, sub, tone, onClick, title }: { icon: typeof Gauge; label: string; value: string; sub?: string; tone?: string; onClick?: () => void; title?: string }) {
  const body = (
    <>
      <span className="figure-label">
        <Icon size={12} />
        {label}
      </span>
      <span className="figure-value tabular">{value}</span>
      <span className="figure-sub tabular">{sub || ' '}</span>
    </>
  );
  const cls = `figure${tone ? ` figure-${tone}` : ''}`;
  return onClick ? (
    <button type="button" className={`${cls} figure-btn`} onClick={onClick} title={title}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Raylit needs Xray to connect: offer to download it right where the user would notice. */
function CoreNotice() {
  const t = useT();
  const core = useEngine((s) => s.core);
  return (
    <div className="notice warning core-notice">
      <Download size={16} />
      <span className="flex-1">
        {core.installing ? t('Downloading Xray… {percent}%', { percent: core.progress ?? 0 }) : core.error ? t('Xray download failed: {error}', { error: core.error }) : t('Xray (the core Raylit connects with) is not installed yet.')}
      </span>
      {!core.installing && (
        <>
          <button className="btn btn-xs btn-primary" onClick={() => runCommand('core.install')}>
            {t('Download Xray')}
          </button>
          <button className="btn btn-xs" onClick={() => useUi.getState().go('settings', 'core')}>
            {t('Choose file…')}
          </button>
        </>
      )}
    </div>
  );
}
