import { AlertCircle, Hand, Layers, LoaderCircle, MoreHorizontal, Pencil, Plus, RefreshCw, Rss, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Subscription } from '../../../../shared/protocol';
import { MANUAL_GROUP } from '../../../../shared/protocol';
import { api } from '../../api/client';
import { attempt } from '../../app/commands';
import { formatBytes, formatDate, formatExpiry, pluralize } from '../../lib/format';
import { useServers, type GroupFilter } from '../../store/servers';
import { useUi } from '../../store/ui';
import { showMenuBelow, useMenu, type MenuItem } from '../common/Menu';

function same(a: GroupFilter, b: GroupFilter): boolean {
  return a.kind === b.kind && (a.kind === 'all' || a.id === (b as { id: string }).id);
}

async function updateOne(sub: Subscription, setBusy: (id: string | null) => void): Promise<void> {
  setBusy(sub.id);
  const r = await attempt(() => api.updateSubscription(sub.id), `Could not update "${sub.name}"`);
  setBusy(null);
  if (r) useUi.getState().toast({ level: 'success', text: `"${sub.name}" updated`, detail: pluralize(r.count, 'server') });
}

async function removeSubscription(sub: Subscription): Promise<void> {
  const r = await useUi.getState().askConfirm({
    title: 'Delete subscription',
    message: `Delete "${sub.name}" and its servers?`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (r.ok) await attempt(() => api.deleteSubscription(sub.id), 'Could not delete the subscription');
}

function subscriptionMenu(sub: Subscription, setBusy: (id: string | null) => void): MenuItem[] {
  return [
    { label: 'Update now', icon: RefreshCw, run: () => updateOne(sub, setBusy) },
    { label: 'Edit…', icon: Pencil, run: () => useUi.getState().set({ subscriptionFor: { id: sub.id } }) },
    'separator',
    { label: 'Delete', icon: Trash2, danger: true, run: () => removeSubscription(sub) },
  ];
}

/** Groups: All servers, Manual, and one row per subscription with its usage, update and menu. */
export function GroupsPanel() {
  const servers = useServers((s) => s.servers);
  const subs = useServers((s) => s.subscriptions);
  const filter = useServers((s) => s.filter);
  const [busy, setBusy] = useState<string | null>(null);
  const count = (id: string) => servers.filter((s) => s.groupId === id).length;

  const row = (f: GroupFilter, label: string, Icon: typeof Layers, n: number) => (
    <div
      className={`tree-row${same(filter, f) ? ' selected' : ''}`}
      role="treeitem"
      aria-selected={same(filter, f)}
      tabIndex={0}
      onClick={() => useServers.getState().setFilter(f)}
      onKeyDown={(e) => e.key === 'Enter' && useServers.getState().setFilter(f)}
    >
      <span className="tree-twisty-slot" />
      <span className="tree-icon">
        <Icon size={16} />
      </span>
      <span className="tree-label">{label}</span>
      <span className="tree-count">{n}</span>
    </div>
  );

  return (
    <div className="dock-panel">
      <div className="tree" role="tree" aria-label="Server groups">
        {row({ kind: 'all' }, 'All servers', Layers, servers.length)}
        {row({ kind: 'group', id: MANUAL_GROUP }, 'Added by hand', Hand, count(MANUAL_GROUP))}
      </div>
      <div className="panel-header">
        <span className="panel-title">Subscriptions</span>
        <div className="panel-actions">
          <button className="icon-btn sm" title="Add subscription" aria-label="Add subscription" onClick={() => useUi.getState().set({ subscriptionFor: { id: null } })}>
            <Plus size={14} />
          </button>
        </div>
      </div>
      {subs.length === 0 ? (
        <p className="panel-note">
          A subscription is a link from your provider that keeps your server list up to date.{' '}
          <button className="link-btn" onClick={() => useUi.getState().set({ subscriptionFor: { id: null } })}>
            Add one
          </button>
        </p>
      ) : (
        <div className="tree" role="tree" aria-label="Subscriptions">
          {subs.map((sub) => {
            const f: GroupFilter = { kind: 'group', id: sub.id };
            const selected = same(filter, f);
            const used = sub.usage ? sub.usage.upload + sub.usage.download : 0;
            const pct = sub.usage?.total ? Math.min(100, (used / sub.usage.total) * 100) : null;
            return (
              <div key={sub.id} className="sub-item">
                <div
                  className={`tree-row${selected ? ' selected' : ''}`}
                  role="treeitem"
                  aria-selected={selected}
                  tabIndex={0}
                  title={sub.lastError ? `Last update failed: ${sub.lastError}` : `Updated ${formatDate(sub.updatedAt)}`}
                  onClick={() => useServers.getState().setFilter(f)}
                  onKeyDown={(e) => e.key === 'Enter' && useServers.getState().setFilter(f)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    useMenu.getState().show(e.clientX, e.clientY, subscriptionMenu(sub, setBusy));
                  }}
                >
                  <span className="tree-twisty-slot" />
                  <span className="tree-icon">{busy === sub.id ? <LoaderCircle size={16} className="spin" /> : sub.lastError ? <AlertCircle size={16} className="text-warning" /> : <Rss size={16} />}</span>
                  <span className="tree-label">{sub.name}</span>
                  <button className="icon-btn xs tree-action" title="Update now" aria-label={`Update ${sub.name}`} onClick={(e) => (e.stopPropagation(), void updateOne(sub, setBusy))}>
                    <RefreshCw size={12} />
                  </button>
                  <button className="icon-btn xs tree-action" title="More" aria-label={`More for ${sub.name}`} onClick={(e) => (e.stopPropagation(), showMenuBelow(e.currentTarget, subscriptionMenu(sub, setBusy)))}>
                    <MoreHorizontal size={12} />
                  </button>
                  <span className="tree-count">{count(sub.id)}</span>
                </div>
                {sub.usage && (
                  <div className="sub-usage" title={`${formatBytes(used)} of ${sub.usage.total ? formatBytes(sub.usage.total) : 'unlimited'} · ${formatExpiry(sub.usage.expire)}`}>
                    {pct !== null && (
                      <span className="sub-usage-bar">
                        <span className={`sub-usage-fill${pct > 90 ? ' high' : ''}`} style={{ width: `${pct}%` }} />
                      </span>
                    )}
                    <span className="sub-usage-text">
                      {formatBytes(used)}
                      {sub.usage.total ? ` / ${formatBytes(sub.usage.total)}` : ''} · {formatExpiry(sub.usage.expire)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
