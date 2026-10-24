import { Cpu, Download, FolderOpen, Info, LoaderCircle, Network, RefreshCw, Route, Settings, ShieldCheck, SlidersHorizontal, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { LogLevel, Settings as SettingsT } from '../../../shared/protocol';
import { api } from '../api/client';
import { attempt, isConnected } from '../app/commands';
import { Field } from '../components/common/Dialog';
import { BrandMark } from '../components/common/visuals';
import { useT } from '../i18n';
import { ROUTING_LABEL, ROUTING_MODES } from '../lib/routing';
import { getPlatform } from '../platform';
import { useEngine } from '../store/engine';
import { useUi, type SettingsSection } from '../store/ui';
import { useUpdates } from '../store/updates';

const SECTIONS: { id: SettingsSection; label: string; Icon: typeof Settings }[] = [
  { id: 'general', label: 'General', Icon: SlidersHorizontal },
  { id: 'proxy', label: 'Proxy', Icon: Network },
  { id: 'routing', label: 'Routing & DNS', Icon: Route },
  { id: 'core', label: 'Xray core', Icon: Cpu },
  { id: 'updates', label: 'Updates', Icon: RefreshCw },
  { id: 'about', label: 'About', Icon: Info },
];

/** Settings as a page: section list beside the section, every change saved at once. */
export function SettingsPage() {
  const t = useT();
  const section = useUi((s) => s.settingsSection);
  const settings = useEngine((s) => s.settings);
  if (!settings) return null;
  return (
    <div className="page settings-page">
      <header className="page-head">
        <h1>{t('Settings')}</h1>
      </header>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t('Sections')}>
          {SECTIONS.map((s) => (
            <button key={s.id} className={`nav-item${section === s.id ? ' active' : ''}`} aria-current={section === s.id ? 'page' : undefined} onClick={() => useUi.getState().go('settings', s.id)}>
              <s.Icon size={16} />
              {t(s.label)}
            </button>
          ))}
        </nav>
        <div className="settings-body card">
          <Section key={section} id={section} s={settings} />
        </div>
      </div>
    </div>
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
      <input className="input narrow" type="number" dir="ltr" min={min} max={max} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
    </Field>
  );
}

function TextField({ label, hint, value, onSave, mono, placeholder }: { label: string; hint?: ReactNode; value: string; onSave: (v: string) => void; mono?: boolean; placeholder?: string }) {
  const [v, setV] = useState(value);
  const commit = () => v.trim() !== value && onSave(v.trim());
  return (
    <Field label={label} hint={hint}>
      <input className={`input${mono ? ' mono-sm' : ''}`} dir={mono ? 'ltr' : undefined} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} spellCheck={false} />
    </Field>
  );
}

function Section({ id, s }: { id: SettingsSection; s: SettingsT }) {
  const t = useT();
  const electron = getPlatform().kind === 'electron';
  switch (id) {
    case 'general':
      return (
        <div className="settings-section">
          <h3>{t('General')}</h3>
          <Field label={t('Language')}>
            <div className="segmented">
              <button className={s.language === 'en' ? 'on' : ''} aria-pressed={s.language === 'en'} onClick={() => save({ language: 'en' })} lang="en">
                English
              </button>
              <button className={s.language === 'fa' ? 'on' : ''} aria-pressed={s.language === 'fa'} onClick={() => save({ language: 'fa' })} lang="fa">
                فارسی
              </button>
            </div>
          </Field>
          <Field label={t('Theme')}>
            <div className="segmented">
              {(['system', 'light', 'dark'] as const).map((th) => (
                <button key={th} className={s.theme === th ? 'on' : ''} aria-pressed={s.theme === th} onClick={() => save({ theme: th })}>
                  {t(th === 'system' ? 'System' : th === 'light' ? 'Light' : 'Dark')}
                </button>
              ))}
            </div>
          </Field>
          <Toggle label={t('Connect when Raylit starts')} hint={t('To the server you used last.')} checked={s.autoConnect} onChange={(v) => save({ autoConnect: v })} />
          {electron && <Toggle label={t('Start Raylit when I sign in')} hint={t('It starts in the tray.')} checked={s.launchAtLogin} onChange={(v) => save({ launchAtLogin: v })} />}
          {electron && <Toggle label={t('Keep running in the tray when the window is closed')} hint={t('The connection stays up in the background.')} checked={s.minimizeToTray} onChange={(v) => save({ minimizeToTray: v })} />}
        </div>
      );
    case 'proxy':
      return (
        <div className="settings-section">
          <h3>{t('Proxy')}</h3>
          <Field label={t('Mode')}>
            <div className="segmented">
              <button className={s.proxyMode === 'system' ? 'on' : ''} onClick={() => save({ proxyMode: 'system' })}>
                {t('System proxy')}
              </button>
              <button className={s.proxyMode === 'manual' ? 'on' : ''} onClick={() => save({ proxyMode: 'manual' })}>
                {t('Proxy only')}
              </button>
            </div>
          </Field>
          <p className="muted settings-note">
            {t("System proxy points your computer's proxy setting at Raylit while connected and puts your own setting back when you disconnect. With Proxy only, set apps (Telegram, a browser extension) to the ports below yourself.")}
          </p>
          <div className="form-row">
            <NumberField label={t('HTTP port')} value={s.httpPort} min={1} max={65535} onSave={(n) => save({ httpPort: n })} />
            <NumberField label={t('SOCKS port')} value={s.socksPort} min={1} max={65535} onSave={(n) => save({ socksPort: n })} />
          </div>
          <Toggle label={t('Allow other devices on my network')} hint={t('Listen on all addresses, so phones and other computers can use this proxy.')} checked={s.allowLan} onChange={(v) => save({ allowLan: v })} />
          <TextField
            label={t('Go direct for')}
            hint={t('Addresses that skip the system proxy, separated by semicolons. * matches anything.')}
            value={s.bypass.join('; ')}
            onSave={(v) => save({ bypass: v.split(/[;,\s]+/) })}
            mono
          />
        </div>
      );
    case 'routing':
      return (
        <div className="settings-section">
          <h3>{t('Routing & DNS')}</h3>
          <Field label={t('What goes through the server')}>
            <div className="choice-list" role="radiogroup">
              {ROUTING_MODES.map((r) => (
                <label key={r} className={`choice${s.routing === r ? ' on' : ''}`}>
                  <input type="radio" name="routing-settings" checked={s.routing === r} onChange={() => save({ routing: r })} />
                  <span>
                    <span className="toggle-label">{t(ROUTING_LABEL[r].label)}</span>
                    <span className="field-hint">{t(ROUTING_LABEL[r].hint)}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
          <Toggle label={t('Block ads and trackers')} hint={t('Uses the category-ads-all list in geosite.dat.')} checked={s.blockAds} onChange={(v) => save({ blockAds: v })} />
          <TextField
            label={t('DNS servers')}
            hint={t('Separated by commas: IP addresses, DNS-over-HTTPS addresses (https://1.1.1.1/dns-query) or localhost.')}
            value={s.dns.join(', ')}
            onSave={(v) => save({ dns: v.split(/[,\s]+/) })}
            mono
          />
          <Toggle label={t('Sniff domains')} hint={t('Route by the real domain name of a connection, not only its IP address. Recommended.')} checked={s.sniffing} onChange={(v) => save({ sniffing: v })} />
          <Toggle label={t('Multiplex connections (Mux)')} hint={t('Fewer handshakes on slow links. Not used with XTLS Vision or XHTTP.')} checked={s.mux} onChange={(v) => save({ mux: v })} />
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
          <p className="muted" dir="ltr">
            {electron ? `Version ${getPlatform().appVersion} · ` : 'Browser build · '}engine {useEngine.getState().version}
          </p>
          <ul className="about-list">
            <li>
              <Zap size={14} /> {t('One button to connect through VMess, VLESS (with REALITY and Vision), Trojan or Shadowsocks servers, powered by Xray.')}
            </li>
            <li>
              <ShieldCheck size={14} /> {t("System proxy mode sets your computer's proxy while connected and restores your own setting afterwards, even after a crash.")}
            </li>
            <li>
              <RefreshCw size={14} /> {t('Subscriptions update on their own; real delay tests show which servers actually work.')}
            </li>
          </ul>
          <a href="https://github.com/amirerajabi/raylit" target="_blank" rel="noreferrer">
            github.com/amirerajabi/raylit
          </a>
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
  const t = useT();
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
      <h3>{t('Xray core')}</h3>
      <div className="info-card">
        <Cpu size={18} className={core.path ? 'text-success' : 'text-warning'} />
        <div className="flex-1">
          <strong>{core.version ? `Xray ${core.version}` : core.path ? t('Unknown file') : t('Not installed')}</strong>
          <p className="muted selectable mono-sm" dir="ltr">
            {core.path ?? t('Raylit needs Xray to connect. Download it, or choose an xray executable you already have (for example from v2rayN).')}
          </p>
          {core.error && <p className="text-danger">{core.error}</p>}
        </div>
      </div>
      <div className="input-with-btn">
        <button className="btn btn-primary" disabled={core.installing || isConnected()} title={isConnected() ? t('Disconnect first') : undefined} onClick={() => void attempt(() => api.installCore(), 'Could not download Xray')}>
          {core.installing ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
          {core.installing ? t('Downloading… {percent}%', { percent: core.progress ?? 0 }) : core.path ? t('Download the latest Xray') : t('Download Xray')}
        </button>
        <span className="muted footer-note">{t('From github.com/XTLS/Xray-core, checked against its SHA-256.')}</span>
      </div>
      <Field label={t('Use this Xray file instead')} hint={t('Leave empty to use the downloaded copy.')}>
        <div className="input-with-btn">
          <input
            className="input mono-sm"
            dir="ltr"
            value={path}
            placeholder={getPlatform().os === 'win32' ? 'C:\\…\\xray.exe' : '/usr/local/bin/xray'}
            onChange={(e) => setPath(e.target.value)}
            onBlur={() => path.trim() !== s.corePath && save({ corePath: path })}
            spellCheck={false}
          />
          {getPlatform().kind === 'electron' && (
            <button className="btn" onClick={() => void browse()}>
              <FolderOpen size={16} /> {t('Browse')}
            </button>
          )}
        </div>
      </Field>
      <TextField label={t('Delay test address')} hint={t('Fetched through each server to measure its delay. It should answer quickly and be reachable from everywhere.')} value={s.testUrl} onSave={(v) => save({ testUrl: v })} mono />
      <Field label={t('Log detail')}>
        <div className="segmented">
          {LOG_LEVELS.map((l) => (
            <button key={l.id} className={s.logLevel === l.id ? 'on' : ''} onClick={() => save({ logLevel: l.id })}>
              {t(l.label)}
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
  const t = useT();
  const status = useUpdates((u) => u.status);
  const manual = useUpdates((u) => u.manual);
  const busy = manual || status?.state === 'checking';
  const version = status?.version ?? '';
  let text = status ? t(UPDATE_TEXT[status.state] ?? '') : '';
  if (status?.state === 'downloading') text = t('Downloading Raylit {version}: {percent}%', { version, percent: status.percent ?? 0 });
  if (status?.state === 'ready') text = t('Raylit {version} is downloaded. Restart to install it, or it installs when you quit.', { version });
  if (status?.state === 'available') text = t('Raylit {version} is available. macOS only updates signed apps in place, so download it from the release page.', { version });
  if (status?.state === 'disabled') text = status.message ?? t('Updates are not available in this build.');
  return (
    <div className="settings-section">
      <h3>{t('Updates')}</h3>
      {!status ? (
        <p className="muted">{t('Updates are part of the desktop app.')}</p>
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
                {status.state === 'ready' ? t('Restart and update') : t('Open the release page')}
              </button>
            ) : (
              <button className="btn" disabled={busy || status.state === 'disabled' || status.state === 'downloading'} onClick={() => void useUpdates.getState().check()}>
                {busy ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />} {t('Check for updates')}
              </button>
            )}
          </div>
          <Toggle label={t('Check for updates automatically')} hint={t('At start and every 6 hours.')} checked={s.autoUpdate} onChange={(v) => save({ autoUpdate: v })} />
        </>
      )}
    </div>
  );
}
