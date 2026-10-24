import { ArrowDownWideNarrow, ClipboardCopy, ClipboardPaste, Gauge, LoaderCircle, MoreHorizontal, Pencil, Plus, Power, Rss, Search, Trash2, X, Zap } from 'lucide-react';
import { useMemo, type MouseEvent } from 'react';
import type { Server } from '../../../shared/protocol';
import { MANUAL_GROUP } from '../../../shared/protocol';
import { api } from '../api/client';
import { attempt, connectFastest, connectTo, copyShareLink, deleteServer, runCommand } from '../app/commands';
import { showMenuBelow, useMenu, type MenuItem } from '../components/common/Menu';
import { CountryBadge, DelayBadge, displayName, ProtocolBadge } from '../components/common/visuals';
import { useT } from '../i18n';
import { transportLabel } from '../lib/format';
import { useConnection } from '../store/connection';
import { filterGroupId, useServers, visibleServers, type GroupFilter } from '../store/servers';
import { useUi } from '../store/ui';

function serverMenu(s: Server, t: (x: string) => string): MenuItem[] {
  return [
    { label: t('Connect'), icon: Power, run: () => connectTo(s.id) },
    { label: t('Test delay'), icon: Gauge, run: () => attempt(() => api.test([s.id])) },
    'separator',
    { label: t('Edit server…'), icon: Pencil, run: () => useUi.getState().set({ editServer: s.id }) },
    { label: t('Copy share link'), icon: ClipboardCopy, run: () => copyShareLink(s.id) },
    'separator',
    { label: t('Delete server'), icon: Trash2, danger: true, run: () => deleteServer(s.id) },
  ];
}

const same = (a: GroupFilter, b: GroupFilter) => a.kind === b.kind && (a.kind === 'all' || a.id === (b as { id: string }).id);

/** Every server as a card: click chooses the one Connect uses, double-click connects, ⋯ has the rest. */
export function ServersPage() {
  const t = useT();
  const servers = useServers((s) => s.servers);
  const subs = useServers((s) => s.subscriptions);
  const filter = useServers((s) => s.filter);
  const query = useServers((s) => s.query);
  const sort = useServers((s) => s.sort);
  const selectedId = useServers((s) => s.selectedId);
  const connection = useConnection((s) => s.connection);
  const testing = useConnection((s) => s.testing);
  const rows = useMemo(() => visibleServers({ servers, filter, query, sort }), [servers, filter, query, sort]);

  const groups: { f: GroupFilter; label: string; count: number }[] = [
    { f: { kind: 'all' }, label: t('All'), count: servers.length },
    ...(servers.some((s) => s.groupId === MANUAL_GROUP) ? [{ f: { kind: 'group', id: MANUAL_GROUP } as GroupFilter, label: t('Added by hand'), count: servers.filter((s) => s.groupId === MANUAL_GROUP).length }] : []),
    ...subs.map((sub) => ({ f: { kind: 'group', id: sub.id } as GroupFilter, label: sub.name, count: servers.filter((s) => s.groupId === sub.id).length })),
  ];

  const pick = (s: Server) => {
    if (useServers.getState().selectedId !== s.id) void attempt(() => api.select(s.id));
  };
  const menuAt = (e: MouseEvent, s: Server) => {
    e.preventDefault();
    pick(s);
    useMenu.getState().show(e.clientX, e.clientY, serverMenu(s, t));
  };

  return (
    <div className="page servers-page">
      <header className="page-head">
        <h1>{t('Servers')}</h1>
        <div className="flex-1" />
        <button className="btn" onClick={() => runCommand('server.paste')} title={t('Import from clipboard')}>
          <ClipboardPaste size={16} /> {t('Paste')}
        </button>
        <button className="btn" onClick={() => useUi.getState().set({ addServers: { text: '' } })}>
          <Plus size={16} /> {t('Add')}
        </button>
        <button className="btn" onClick={() => useUi.getState().set({ subscriptionFor: { id: null } })}>
          <Rss size={16} /> {t('Subscription')}
        </button>
      </header>

      {servers.length === 0 ? (
        <EmptyServers />
      ) : (
        <>
          <div className="servers-bar">
            <div className="chips" role="tablist" aria-label={t('Groups')}>
              {groups.map((g) => (
                <button key={g.f.kind === 'all' ? 'all' : g.f.id} role="tab" aria-selected={same(filter, g.f)} className={`chip${same(filter, g.f) ? ' on' : ''}`} onClick={() => useServers.getState().setFilter(g.f)}>
                  {g.label} <span className="chip-count">{g.count}</span>
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <label className="search-box">
              <Search size={14} />
              <span className="sr-only">{t('Search servers')}</span>
              <input id="server-search" className="input borderless" placeholder={t('Search servers')} value={query} onChange={(e) => useServers.getState().setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && useServers.getState().setQuery('')} />
              {query && (
                <button type="button" className="icon-btn xs" aria-label={t('Clear search')} onClick={() => useServers.getState().setQuery('')}>
                  <X size={14} />
                </button>
              )}
            </label>
            <button className="btn" disabled={testing} onClick={() => runCommand('server.test')}>
              {testing ? <LoaderCircle size={16} className="spin" /> : <Gauge size={16} />} {t('Test')}
            </button>
            <button className={`btn${sort === 'delay' ? ' on' : ''}`} aria-pressed={sort === 'delay'} onClick={() => runCommand('server.sortDelay')} title={t('Sort by delay')}>
              <ArrowDownWideNarrow size={16} /> {t('Fastest first')}
            </button>
          </div>

          <div className="cards">
            <button type="button" className="card server-card fastest-card" disabled={testing} onClick={() => void connectFastest(filterGroupId(filter))}>
              <span className="country country-md fastest-icon" aria-hidden="true">
                <Zap size={16} />
              </span>
              <span className="server-card-text">
                <span className="server-card-name">{t('Fastest server')}</span>
                <span className="server-card-kind">{t('Tests these servers and connects to the quickest')}</span>
              </span>
            </button>
            {rows.map((s) => {
              const live = connection.serverId === s.id && connection.status !== 'disconnected';
              const selected = s.id === selectedId;
              return (
                <div
                  key={s.id}
                  className={`card server-card${selected ? ' selected' : ''}${live ? ` live live-${connection.status}` : ''}`}
                  onContextMenu={(e) => menuAt(e, s)}
                >
                  <button type="button" className="server-card-main" onClick={() => pick(s)} onDoubleClick={() => void connectTo(s.id)} aria-pressed={selected} title={`${s.address}:${s.port}`}>
                    <CountryBadge name={s.name} />
                    <span className="server-card-text">
                      <span className="server-card-name ellipsis">{displayName(s.name)}</span>
                      <span className="server-card-kind">
                        <ProtocolBadge protocol={s.protocol} />
                        <span className="ellipsis">{transportLabel(s)}</span>
                      </span>
                    </span>
                    <DelayBadge server={s} testing={testing} />
                  </button>
                  <div className="server-card-actions">
                    {live ? (
                      <span className="live-tag">{connection.status === 'connected' ? t('Connected') : t('Connecting…')}</span>
                    ) : (
                      selected && (
                        <button type="button" className="btn btn-xs btn-primary" onClick={() => void connectTo(s.id)}>
                          <Power size={14} /> {t('Connect')}
                        </button>
                      )
                    )}
                    <button type="button" className="icon-btn sm" aria-label={t('More')} title={t('More')} onClick={(e) => (pick(s), showMenuBelow(e.currentTarget, serverMenu(s, t)))}>
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {rows.length === 0 && <p className="muted list-note">{t('No servers match “{query}”.', { query })}</p>}
        </>
      )}
    </div>
  );
}

function EmptyServers() {
  const t = useT();
  return (
    <div className="empty-state">
      <h2>{t('Add your first server')}</h2>
      <p className="muted">{t('Copy a share link (vmess://, vless://, trojan:// or ss://) or a subscription link from your provider, then paste it here.')}</p>
      <div className="empty-actions">
        <button className="btn btn-primary" onClick={() => runCommand('server.paste')}>
          <ClipboardPaste size={16} /> {t('Paste from clipboard')}
        </button>
        <button className="btn" onClick={() => useUi.getState().set({ subscriptionFor: { id: null } })}>
          <Rss size={16} /> {t('Add subscription')}
        </button>
      </div>
      <p className="muted empty-tip">{t('Ctrl+V anywhere in the window imports what you copied.')}</p>
    </div>
  );
}
