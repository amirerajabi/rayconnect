import { ArrowDown, ArrowUp, ClipboardPaste, Plus, Rss, Wifi } from 'lucide-react';
import { useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import type { Server } from '../../../../shared/protocol';
import { api } from '../../api/client';
import { attempt, connectTo, getCommand, runCommand } from '../../app/commands';
import { transportLabel } from '../../lib/format';
import { useConnection } from '../../store/connection';
import { groupName, useServers, visibleServers, type SortKey } from '../../store/servers';
import { useUi } from '../../store/ui';
import { useMenu, type MenuItem } from '../common/Menu';
import { DelayBadge, ProtocolBadge } from '../common/visuals';

function contextMenu(): MenuItem[] {
  const item = (id: string, label?: string): MenuItem => {
    const c = getCommand(id)!;
    const reason = c.disabled?.() ?? null;
    return { label: label ?? c.label, icon: c.icon, shortcut: c.shortcut, disabled: reason ?? false, danger: id === 'server.delete', run: () => runCommand(id) };
  };
  const many = useServers.getState().marked.length > 1;
  return [
    item('server.connect'),
    item('server.test', many ? 'Test delay of selected' : 'Test delay of all'),
    'separator',
    item('server.edit'),
    item('server.copyLink'),
    'separator',
    item('server.delete'),
  ];
}

const COLUMNS: { key: SortKey | null; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: null, label: 'Type' },
  { key: null, label: 'Address' },
  { key: null, label: 'Group' },
  { key: 'delay', label: 'Delay' },
];

/**
 * The servers: click selects the one Connect uses, double-click (or Enter) connects to it. Ctrl/Shift extend the
 * selection for Delete, Test and Share.
 */
export function ServerList() {
  const servers = useServers((s) => s.servers);
  const filter = useServers((s) => s.filter);
  const query = useServers((s) => s.query);
  const sort = useServers((s) => s.sort);
  const marked = useServers((s) => s.marked);
  const subs = useServers((s) => s.subscriptions);
  const connection = useConnection((s) => s.connection);
  const testing = useConnection((s) => s.testing);
  const rows = useMemo(() => visibleServers({ servers, filter, query, sort }), [servers, filter, query, sort]);
  const markedSet = useMemo(() => new Set(marked), [marked]);
  const anchor = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the focused row in view while moving with the keyboard.
  useEffect(() => {
    const last = marked[marked.length - 1];
    if (last) listRef.current?.querySelector(`[data-id="${last}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [marked]);

  if (servers.length === 0) return <EmptyState />;

  const pick = (s: Server) => {
    useServers.getState().mark([s.id]);
    anchor.current = s.id;
    // The highlighted server is the one Connect uses.
    if (useServers.getState().selectedId !== s.id) void attempt(() => api.select(s.id));
  };

  const onClick = (e: MouseEvent, s: Server) => {
    const st = useServers.getState();
    if (e.ctrlKey || e.metaKey) {
      st.mark(markedSet.has(s.id) ? marked.filter((id) => id !== s.id) : [...marked, s.id]);
      anchor.current = s.id;
    } else if (e.shiftKey && anchor.current) {
      const a = rows.findIndex((r) => r.id === anchor.current);
      const b = rows.findIndex((r) => r.id === s.id);
      st.mark(rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.id));
    } else {
      pick(s);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') {
      if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
        e.preventDefault();
        const r = listRef.current?.querySelector('.srv-row.marked')?.getBoundingClientRect();
        useMenu.getState().show(r ? r.left + 40 : 200, r ? r.bottom : 200, contextMenu());
      }
      return;
    }
    e.preventDefault();
    if (rows.length === 0) return;
    const cur = rows.findIndex((r) => r.id === marked[marked.length - 1]);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)));
    if (e.shiftKey && anchor.current) {
      const a = rows.findIndex((r) => r.id === anchor.current);
      useServers.getState().mark(rows.slice(Math.min(a, next), Math.max(a, next) + 1).map((r) => r.id));
    } else {
      pick(rows[next]);
    }
  };

  return (
    <div className="srv-table">
      <div className="srv-grid srv-header" role="row">
        <span className="srv-th" />
        {COLUMNS.map((c) => (
          <button
            key={c.label}
            className={`srv-th${c.key && sort === c.key ? ' sorted' : ''}`}
            disabled={!c.key}
            onClick={() => c.key && useServers.getState().setSort(sort === c.key ? 'list' : c.key)}
            title={c.key ? `Sort by ${c.label.toLowerCase()}` : undefined}
          >
            {c.label}
            {c.key && sort === c.key && (c.key === 'delay' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
          </button>
        ))}
      </div>
      <div ref={listRef} className="srv-list" role="listbox" aria-label="Servers" aria-multiselectable="true" tabIndex={0} onKeyDown={onKeyDown}>
        {rows.length === 0 && <p className="list-note muted">No servers match “{query}”.</p>}
        {rows.map((s, i) => {
          const live = connection.serverId === s.id && connection.status !== 'disconnected';
          return (
            <div
              key={s.id}
              data-id={s.id}
              role="option"
              aria-selected={markedSet.has(s.id)}
              className={`srv-grid srv-row${i % 2 ? ' alt' : ''}${markedSet.has(s.id) ? ' marked' : ''}${live ? ` live live-${connection.status}` : ''}`}
              onClick={(e) => onClick(e, s)}
              onDoubleClick={() => void connectTo(s.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!markedSet.has(s.id)) pick(s);
                useMenu.getState().show(e.clientX, e.clientY, contextMenu());
              }}
            >
              <span className="srv-cell srv-state" title={live ? 'Connected' : undefined}>
                {live ? <Wifi size={14} /> : null}
              </span>
              <span className="srv-cell srv-name" title={s.name}>
                <span className="ellipsis">{s.name}</span>
              </span>
              <span className="srv-cell">
                <ProtocolBadge protocol={s.protocol} />
                <span className="muted srv-transport">{transportLabel(s)}</span>
              </span>
              <span className="srv-cell muted mono-sm ellipsis" title={`${s.address}:${s.port}`}>
                {s.address}:{s.port}
              </span>
              <span className="srv-cell muted ellipsis">{groupName(s.groupId, subs)}</span>
              <span className="srv-cell right">
                <DelayBadge server={s} testing={testing} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-illustration">
        <Wifi size={40} />
      </div>
      <h2>Add your first server</h2>
      <p className="muted">Copy a share link (vmess://, vless://, trojan:// or ss://) or a subscription link from your provider, then paste it here.</p>
      <div className="empty-actions">
        <button className="btn btn-primary" onClick={() => runCommand('server.paste')}>
          <ClipboardPaste size={16} /> Paste from clipboard
        </button>
        <button className="btn" onClick={() => useUi.getState().set({ addServers: { text: '' } })}>
          <Plus size={16} /> Add servers
        </button>
        <button className="btn" onClick={() => useUi.getState().set({ subscriptionFor: { id: null } })}>
          <Rss size={16} /> Add subscription
        </button>
      </div>
      <ul className="empty-tips muted">
        <li>Ctrl+V anywhere in the window imports what you copied.</li>
        <li>Double-click a server to connect to it.</li>
      </ul>
    </div>
  );
}
