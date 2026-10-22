import { ClipboardCopy, Info, Pencil, ScrollText, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Server } from '../../../../shared/protocol';
import { api } from '../../api/client';
import { attempt, copyShareLink } from '../../app/commands';
import { delayText, formatDate, protocolLabel, transportLabel } from '../../lib/format';
import { getPlatform } from '../../platform';
import { useConnection } from '../../store/connection';
import { groupName, useServers } from '../../store/servers';
import { useUi, type DetailsTab } from '../../store/ui';

const TABS: { id: DetailsTab; label: string; Icon: typeof Info }[] = [
  { id: 'server', label: 'Server', Icon: Info },
  { id: 'log', label: 'Log', Icon: ScrollText },
];

/** Bottom pane: the selected server's details, or the live log of the core. */
export function DetailsPane() {
  const tab = useUi((s) => s.detailsTab);
  return (
    <div className="details">
      <div className="details-header">
        <div className="details-tabs" role="tablist" aria-label="Details">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`dock-tab${tab === t.id ? ' active' : ''}`} onClick={() => useUi.getState().setLayout({ detailsTab: t.id })}>
              <t.Icon size={14} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      {tab === 'server' ? <ServerDetails /> : <LogView />}
    </div>
  );
}

function ServerDetails() {
  const marked = useServers((s) => s.marked);
  const servers = useServers((s) => s.servers);
  const subs = useServers((s) => s.subscriptions);
  const s = servers.find((x) => x.id === marked[marked.length - 1]);
  if (!s) return <div className="details-empty muted">Select a server to see its details.</div>;
  return (
    <div className="details-body">
      <div className="details-title">
        <strong>{s.name}</strong>
        <div className="flex-1" />
        <button className="btn btn-xs" onClick={() => useUi.getState().set({ editServer: s.id })}>
          <Pencil size={14} /> Edit
        </button>
        <button className="btn btn-xs" onClick={() => void copyShareLink([s.id])}>
          <ClipboardCopy size={14} /> Copy share link
        </button>
      </div>
      <dl className="kv">
        <dt>Protocol</dt>
        <dd>
          {protocolLabel(s.protocol)} · {transportLabel(s)}
        </dd>
        <dt>Address</dt>
        <dd className="selectable mono-sm">
          {s.address}:{s.port}
        </dd>
        {rows(s).map(([k, v]) => (
          <Row key={k} k={k} v={v} />
        ))}
        <dt>Group</dt>
        <dd>{groupName(s.groupId, subs)}</dd>
        <dt>Delay</dt>
        <dd>
          {delayText(s.delay)}
          {s.delay !== null && <span className="muted"> ({s.delayKind === 'tcp' ? 'TCP connect' : 'real request'})</span>}
        </dd>
        <dt>Added</dt>
        <dd>{formatDate(s.addedAt)}</dd>
      </dl>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd className="selectable mono-sm ellipsis" title={v}>
        {v}
      </dd>
    </>
  );
}

/** The transport and security details worth showing; secrets stay out of view. */
function rows(s: Server): [string, string][] {
  const out: [string, string][] = [];
  if (s.host) out.push(['Host', s.host]);
  if (s.path) out.push(['Path', s.path]);
  if (s.serviceName) out.push(['Service name', s.serviceName]);
  if (s.mode) out.push(['Mode', s.mode]);
  if (s.flow) out.push(['Flow', s.flow]);
  if (s.sni) out.push(['SNI', s.sni]);
  if (s.fingerprint) out.push(['Fingerprint', s.fingerprint]);
  if (s.alpn?.length) out.push(['ALPN', s.alpn.join(', ')]);
  if (s.method) out.push(['Cipher', s.method]);
  if (s.allowInsecure) out.push(['Certificate', 'not verified (allowInsecure)']);
  return out;
}

function LogView() {
  const logs = useConnection((s) => s.logs);
  const ref = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs, follow]);
  return (
    <div className="log-wrap">
      <div className="log-actions">
        <span className="muted">{logs.length} lines</span>
        <div className="flex-1" />
        <button className="btn btn-xs" onClick={() => getPlatform().writeClipboard(logs.map((l) => `${new Date(l.t).toLocaleTimeString()} ${l.text}`).join('\n'))}>
          <ClipboardCopy size={14} /> Copy
        </button>
        <button
          className="btn btn-xs"
          onClick={async () => {
            await attempt(() => api.clearLogs());
            useConnection.getState().setLogs([]);
          }}
        >
          <Trash2 size={14} /> Clear
        </button>
      </div>
      <div
        ref={ref}
        className="log selectable"
        onScroll={(e) => {
          const el = e.currentTarget;
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
        }}
      >
        {logs.length === 0 && <div className="muted log-empty">Nothing logged yet. Connect to see what the core does.</div>}
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
