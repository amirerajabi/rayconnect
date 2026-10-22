import { Cpu, Download, FolderOpen, Info, LoaderCircle, Network, RefreshCw, Route, Settings, ShieldCheck, SlidersHorizontal, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { LogLevel, RoutingMode, Settings as SettingsT } from '../../../../shared/protocol';
import { api } from '../../api/client';
import { attempt, isConnected } from '../../app/commands';
import { getPlatform } from '../../platform';
import { useEngine } from '../../store/engine';
import { useUi, type SettingsSection } from '../../store/ui';
import { useUpdates } from '../../store/updates';
import { Dialog, Field } from '../common/Dialog';
import { BrandMark } from '../common/visuals';
import { ROUTING_LABEL } from '../Sidebar/QuickPanel';

const SECTIONS: { id: SettingsSection; label: string; Icon: typeof Settings }[] = [
  { id: 'general', label: 'General', Icon: SlidersHorizontal },
  { id: 'proxy', label: 'Proxy', Icon: Network },
  { id: 'routing', label: 'Routing & DNS', Icon: Route },
  { id: 'core', label: 'Xray core', Icon: Cpu },
  { id: 'updates', label: 'Updates', Icon: RefreshCw },
  { id: 'about', label: 'About', Icon: Info },
];

/** Settings laid out like Rowlit's: section nav on the left, each change saved immediately. */
export function SettingsDialog() {
  const section = useUi((s) => s.settingsOpen);
  const settings = useEngine((s) => s.settings);
  if (!section || !settings) return null;
  const close = () => useUi.getState().set({ settingsOpen: null });
  return (
    <Dialog
      title="Settings"
      icon={<Settings size={18} className="text-accent" />}
      width={760}
      className="settings-dialog"
      onClose={close}
      footer={
        <button className="btn btn-primary" onClick={close}>
          Done
        </button>
      }
    >
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Sections">
          {SECTIONS.map((s) => (
            <button key={s.id} className={`nav-item${section === s.id ? ' active' : ''}`} onClick={() => useUi.getState().set({ settingsOpen: s.id })}>
              <s.Icon size={16} />
              {s.label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          <Section id={section} s={settings} />
        </div>
      </div>
    </Dialog>
  );
}

function save(patch: Partial<SettingsT>): void {
  void attempt(() => useEngine.getState().updateSettings(patch), 'Could not save the setting');
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-row">
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="toggle-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
    </label>
  );
}

/** A number field that saves on blur / Enter. */
function NumberField({ label, hint, value, min, max, onSave }: { label: string; hint?: string; value: number; min: number; max: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(String(value));
  const commit = () => {
    const n = Number(v);
    if (Number.isFinite(n) && n !== value) onSave(Math.max(min, Math.min(max, Math.round(n))));
    else setV(String(value));
  };
  return (
    <Field label={label} hint={hint}>
      <input className="input narrow" type="number" min={min} max={max} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
    </Field>
  );
}

function TextField({ label, hint, value, onSave, mono, placeholder }: { label: string; hint?: ReactNode; value: string; onSave: (v: string) => void; mono?: boolean; placeholder?: string }) {
  const [v, setV] = useState(value);
  const commit = () => v.trim() !== value && onSave(v.trim());
  return (
    <Field label={label} hint={hint}>
      <input
        className={`input${mono ? ' mono-sm' : ''}`}
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        spellCheck={false}
      />
    </Field>
  );
}

function Section({ id, s }: { id: SettingsSection; s: SettingsT }) {
  const electron = getPlatform().kind === 'electron';
  switch (id) {
    case 'general':
      return (
        <div className="settings-section">
          <h3>General</h3>
          <Field label="Theme">
            <div className="segmented">
              {(['system', 'light', 'dark'] as const).map((t) => (
                <button key={t} className={s.theme === t ? 'on' : ''} aria-pressed={s.theme === t} onClick={() => save({ theme: t })}>
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </Field>
          <Toggle label="Connect when Raylit starts" hint="To the server you used last." checked={s.autoConnect} onChange={(v) => save({ autoConnect: v })} />
          {electron && <Toggle label="Start Raylit when I sign in" hint="It starts in the tray." checked={s.launchAtLogin} onChange={(v) => save({ launchAtLogin: v })} />}
          {electron && <Toggle label="Keep running in the tray when the window is closed" hint="The connection stays up in the background." checked={s.minimizeToTray} onChange={(v) => save({ minimizeToTray: v })} />}
        </div>
      );
    case 'proxy':
      return (
        <div className="settings-section">
          <h3>Proxy</h3>
          <Field label="Mode">
            <div className="segmented">
              <button className={s.proxyMode === 'system' ? 'on' : ''} onClick={() => save({ proxyMode: 'system' })}>
                System proxy
              </button>
              <button className={s.proxyMode === 'manual' ? 'on' : ''} onClick={() => save({ proxyMode: 'manual' })}>
                Proxy only
              </button>
            </div>
          </Field>
          <p className="muted settings-note">
            System proxy points your computer's proxy setting at Raylit while connected and puts your own setting back when you disconnect. With Proxy only, set apps (Telegram,
            a browser extension) to the ports below yourself.
          </p>
          <div className="form-row">
            <NumberField label="HTTP port" value={s.httpPort} min={1} max={65535} onSave={(n) => save({ httpPort: n })} />
            <NumberField label="SOCKS port" value={s.socksPort} min={1} max={65535} onSave={(n) => save({ socksPort: n })} />
          </div>
          <Toggle label="Allow other devices on my network" hint="Listen on all addresses, so phones and other computers can use this proxy." checked={s.allowLan} onChange={(v) => save({ allowLan: v })} />
          <TextField
            label="Go direct for"
            hint="Addresses that skip the system proxy, separated by semicolons. * matches anything."
            value={s.bypass.join('; ')}
            onSave={(v) => save({ bypass: v.split(/[;,\s]+/) })}
            mono
          />
        </div>
      );
    case 'routing':
      return (
        <div className="settings-section">
          <h3>Routing &amp; DNS</h3>
          <Field label="What goes through the server">
            <div className="choice-list" role="radiogroup">
              {(Object.keys(ROUTING_LABEL) as RoutingMode[]).map((r) => (
                <label key={r} className={`quick-choice${s.routing === r ? ' on' : ''}`}>
                  <input type="radio" name="routing-settings" checked={s.routing === r} onChange={() => save({ routing: r })} />
                  <span>
                    <span className="toggle-label">{ROUTING_LABEL[r].label}</span>
                    <span className="field-hint">{ROUTING_LABEL[r].hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
          <Toggle label="Block ads and trackers" hint="Uses the category-ads-all list in geosite.dat." checked={s.blockAds} onChange={(v) => save({ blockAds: v })} />
          <TextField
            label="DNS servers"
            hint="Separated by commas: IP addresses, DNS-over-HTTPS addresses (https://1.1.1.1/dns-query) or localhost."
            value={s.dns.join(', ')}
            onSave={(v) => save({ dns: v.split(/[,\s]+/) })}
            mono
          />
          <Toggle label="Sniff domains" hint="Route by the real domain name of a connection, not only its IP address. Recommended." checked={s.sniffing} onChange={(v) => save({ sniffing: v })} />
          <Toggle label="Multiplex connections (Mux)" hint="Fewer handshakes on slow links. Not used with XTLS Vision or XHTTP." checked={s.mux} onChange={(v) => save({ mux: v })} />
        </div>
      );
    case 'core':
      return <CoreSection s={s} />;
    case 'updates':
      return <UpdatesSection s={s} />;
    case 'about':
      return (
        <div className="settings-section about">
          <BrandMark size={48} />
          <h3>Raylit</h3>
          <p className="muted">
            {electron ? `Version ${getPlatform().appVersion} · ` : 'Browser build · '}engine {useEngine.getState().version}
          </p>
          <ul className="about-list">
            <li>
              <Zap size={14} /> One button to connect through VMess, VLESS (with REALITY and Vision), Trojan or Shadowsocks servers, powered by Xray.
            </li>
            <li>
              <ShieldCheck size={14} /> System proxy mode sets your computer's proxy while connected and restores your own setting afterwards, even after a crash.
            </li>
            <li>
              <RefreshCw size={14} /> Subscriptions update on their own; real delay tests show which servers actually work.
            </li>
          </ul>
        </div>
      );
  }
}

const LOG_LEVELS: { id: LogLevel; label: string }[] = [
  { id: 'warning', label: 'Warnings' },
  { id: 'info', label: 'Info (every connection)' },
  { id: 'debug', label: 'Debug' },
];

function CoreSection({ s }: { s: SettingsT }) {
  const core = useEngine((e) => e.core);
  const [path, setPath] = useState(s.corePath);
  const browse = async () => {
    const picked = await getPlatform().chooseFile(path || core.path || undefined);
    if (picked) {
      setPath(picked);
      save({ corePath: picked });
    }
  };
  return (
    <div className="settings-section">
      <h3>Xray core</h3>
      <div className="info-card">
        <Cpu size={18} className={core.path ? 'text-success' : 'text-warning'} />
        <div className="flex-1">
          <strong>{core.version ? `Xray ${core.version}` : core.path ? 'Unknown file' : 'Not installed'}</strong>
          <p className="muted selectable mono-sm">{core.path ?? 'Raylit needs Xray to connect. Download it, or choose an xray executable you already have (for example from v2rayN).'}</p>
          {core.error && <p className="text-danger">{core.error}</p>}
        </div>
      </div>
      <div className="input-with-btn">
        <button className="btn btn-primary" disabled={core.installing || isConnected()} title={isConnected() ? 'Disconnect first' : undefined} onClick={() => void attempt(() => api.installCore(), 'Could not download Xray')}>
          {core.installing ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
          {core.installing ? `Downloading… ${core.progress ?? 0}%` : core.path ? 'Download the latest Xray' : 'Download Xray'}
        </button>
        <span className="muted footer-note">From github.com/XTLS/Xray-core, checked against its SHA-256.</span>
      </div>
      <Field label="Use this Xray file instead" hint="Leave empty to use the downloaded copy.">
        <div className="input-with-btn">
          <input
            className="input mono-sm"
            value={path}
            placeholder={getPlatform().os === 'win32' ? 'C:\\…\\xray.exe' : '/usr/local/bin/xray'}
            onChange={(e) => setPath(e.target.value)}
            onBlur={() => path.trim() !== s.corePath && save({ corePath: path })}
            spellCheck={false}
          />
          {getPlatform().kind === 'electron' && (
            <button className="btn" onClick={() => void browse()}>
              <FolderOpen size={16} /> Browse
            </button>
          )}
        </div>
      </Field>
      <TextField label="Delay test address" hint="Fetched through each server to measure its delay. It should answer quickly and be reachable from everywhere." value={s.testUrl} onSave={(v) => save({ testUrl: v })} mono />
      <Field label="Log detail">
        <div className="segmented">
          {LOG_LEVELS.map((l) => (
            <button key={l.id} className={s.logLevel === l.id ? 'on' : ''} onClick={() => save({ logLevel: l.id })}>
              {l.label}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

const UPDATE_TEXT: Record<string, string> = {
  idle: 'Not checked yet.',
  checking: 'Checking for updates…',
  'up-to-date': 'Raylit is up to date.',
  error: 'The last check failed.',
};

function UpdatesSection({ s }: { s: SettingsT }) {
  const status = useUpdates((u) => u.status);
  const manual = useUpdates((u) => u.manual);
  const busy = manual || status?.state === 'checking';
  let text = status ? (UPDATE_TEXT[status.state] ?? '') : '';
  if (status?.state === 'downloading') text = `Downloading Raylit ${status.version}: ${status.percent ?? 0}%`;
  if (status?.state === 'ready') text = `Raylit ${status.version} is downloaded. Restart to install it, or it installs when you quit.`;
  if (status?.state === 'available') text = `Raylit ${status.version} is available. macOS only updates signed apps in place, so download it from the release page.`;
  if (status?.state === 'disabled') text = status.message ?? 'Updates are not available in this build.';
  return (
    <div className="settings-section">
      <h3>Updates</h3>
      {!status ? (
        <p className="muted">Updates are part of the desktop app.</p>
      ) : (
        <>
          <div className="info-card">
            <RefreshCw size={18} className="text-accent" />
            <div className="flex-1">
              <strong>Raylit {status.currentVersion}</strong>
              <p className={`muted${status.state === 'error' ? ' text-danger' : ''}`}>
                {text}
                {status.state === 'error' && status.message ? ` ${status.message}` : ''}
              </p>
            </div>
          </div>
          <div className="input-with-btn">
            {status.state === 'ready' || status.state === 'available' ? (
              <button className="btn btn-primary" onClick={() => void useUpdates.getState().install()}>
                {status.state === 'ready' ? 'Restart and update' : 'Open the release page'}
              </button>
            ) : (
              <button className="btn" disabled={busy || status.state === 'disabled' || status.state === 'downloading'} onClick={() => void useUpdates.getState().check()}>
                {busy ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />} Check for updates
              </button>
            )}
          </div>
          <Toggle label="Check for updates automatically" hint="At start and every 6 hours." checked={s.autoUpdate} onChange={(v) => save({ autoUpdate: v })} />
        </>
      )}
    </div>
  );
}
