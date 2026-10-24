import { ClipboardCopy, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { attempt } from '../app/commands';
import { useT } from '../i18n';
import { getPlatform } from '../platform';
import { useConnection } from '../store/connection';
import { useEngine } from '../store/engine';
import { useUi } from '../store/ui';

/** The live log of the core and the app, following new lines unless the user scrolls up. Lines stay English and LTR. */
export function LogPage() {
  const t = useT();
  const logs = useConnection((s) => s.logs);
  const level = useEngine((s) => s.settings?.logLevel ?? 'warning');
  const ref = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs, follow]);
  return (
    <div className="page log-page">
      <header className="page-head">
        <h1>{t('Log')}</h1>
        <span className="muted">{t('{n} lines', { n: logs.length })}</span>
        <div className="flex-1" />
        <button className="link-btn" onClick={() => useUi.getState().go('settings', 'core')}>
          {t('Detail: {level}', { level: t(level === 'warning' ? 'Warnings' : level === 'info' ? 'Info' : 'Debug') })}
        </button>
        <button className="btn" onClick={() => getPlatform().writeClipboard(logs.map((l) => `${new Date(l.t).toLocaleTimeString()} ${l.text}`).join('\n'))}>
          <ClipboardCopy size={16} /> {t('Copy')}
        </button>
        <button
          className="btn"
          onClick={async () => {
            await attempt(() => api.clearLogs());
            useConnection.getState().setLogs([]);
          }}
        >
          <Trash2 size={16} /> {t('Clear')}
        </button>
      </header>
      <div
        ref={ref}
        className="log card selectable"
        dir="ltr"
        onScroll={(e) => {
          const el = e.currentTarget;
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
        }}
      >
        {logs.length === 0 && <div className="muted log-empty">{t('Nothing logged yet. Connect to see what the core does.')}</div>}
        {logs.map((l, i) => (
          <div key={i} className={`log-line log-${l.level}`}>
            <span className="log-time">{new Date(l.t).toLocaleTimeString()}</span>
            <span className="log-text">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
