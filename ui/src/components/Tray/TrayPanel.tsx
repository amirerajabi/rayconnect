import { ClipboardPaste, LoaderCircle, Power, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { attempt, connectFastest, connectTo, pasteFromClipboard, toggleConnection } from '../../app/commands';
import { useT } from '../../i18n';
import { formatSpeed } from '../../lib/format';
import { getPlatform } from '../../platform';
import { useConnection } from '../../store/connection';
import { useEngine } from '../../store/engine';
import { useServers } from '../../store/servers';
import { api } from '../../api/client';
import { CountryBadge, DelayBadge, displayName } from '../common/visuals';

/**
 * The panel that opens from the tray icon (its own small window, loaded with #tray): connect, pick a server, switch the
 * proxy mode. Everything else is one click away in the main window.
 */
export function TrayPanel() {
  const t = useT();
  const connection = useConnection((s) => s.connection);
  const traffic = useConnection((s) => s.traffic);
  const testing = useConnection((s) => s.testing);
  const servers = useServers((s) => s.servers);
  const selectedId = useServers((s) => s.selectedId);
  const settings = useEngine((s) => s.settings);
  const status = connection.status;
  const on = status === 'connected';
  const busy = status === 'connecting' || status === 'disconnecting';
  const current = servers.find((s) => s.id === (connection.serverId ?? selectedId));

  // Escape closes the panel, like any flyout.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && getPlatform().hideTrayPanel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`tray conn-${status}`}>
      <div className="tray-head">
        <button type="button" className="power power-sm" onClick={() => void toggleConnection()} disabled={status === 'disconnecting' || (!current && !on)} aria-pressed={on} aria-label={on ? t('Disconnect') : t('Connect')}>
          {busy ? <LoaderCircle size={24} className="spin" /> : <Power size={24} data-stroke />}
        </button>
        <div className="tray-status">
          <strong>{on && current ? t('Connected to {name}', { name: displayName(current.name) }) : status === 'connecting' ? t('Connecting…') : t('Not connected')}</strong>
          <span className="muted tabular">{on ? `↓ ${formatSpeed(traffic.down)} · ↑ ${formatSpeed(traffic.up)}` : current ? displayName(current.name) : t('Add a server first')}</span>
        </div>
      </div>

      <div className="tray-list" role="listbox" aria-label={t('Servers')}>
        {servers.map((s) => {
          const chosen = s.id === (connection.serverId ?? selectedId);
          return (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={chosen}
              className={`tray-row${chosen ? ' chosen' : ''}`}
              onClick={() => (on || busy ? void connectTo(s.id) : void attempt(() => api.select(s.id)))}
              title={on ? t('Switch to this server') : t('Use this server')}
            >
              <CountryBadge name={s.name} size="sm" />
              <span className="tray-row-name ellipsis">{displayName(s.name)}</span>
              <DelayBadge server={s} testing={testing} />
            </button>
          );
        })}
        {servers.length === 0 && <p className="muted tray-empty">{t('No servers yet.')}</p>}
      </div>

      {settings && (
        <div className="tray-mode">
          <div className="segmented full">
            <button className={settings.proxyMode === 'system' ? 'on' : ''} onClick={() => void attempt(() => useEngine.getState().updateSettings({ proxyMode: 'system' }))}>
              {t('System proxy')}
            </button>
            <button className={settings.proxyMode === 'manual' ? 'on' : ''} onClick={() => void attempt(() => useEngine.getState().updateSettings({ proxyMode: 'manual' }))}>
              {t('Proxy only')}
            </button>
          </div>
        </div>
      )}

      <div className="tray-foot">
        <button type="button" className="btn btn-xs" onClick={() => getPlatform().showMainWindow()}>
          {t('Open RayConnect')}
        </button>
        {servers.length > 1 && (
          <button type="button" className="icon-btn sm" disabled={testing || busy} title={t('Connect to the fastest server')} aria-label={t('Connect to the fastest server')} onClick={() => void connectFastest()}>
            <Zap size={16} />
          </button>
        )}
        <button type="button" className="icon-btn sm" title={t('Import from clipboard')} aria-label={t('Import from clipboard')} onClick={() => void pasteFromClipboard()}>
          <ClipboardPaste size={16} />
        </button>
        <div className="flex-1" />
        <button type="button" className="btn btn-xs btn-ghost" onClick={() => getPlatform().quitApp()}>
          {t('Quit')}
        </button>
      </div>
    </div>
  );
}
