import { AlertCircle, LoaderCircle, Pencil, Plus, RefreshCw, Rss, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Subscription } from '../../../shared/protocol';
import { api } from '../api/client';
import { attempt, runCommand } from '../app/commands';
import { useT } from '../i18n';
import { formatBytes, formatDate } from '../lib/format';
import { useServers } from '../store/servers';
import { useUi } from '../store/ui';

/** "12 days left", "expired" */
function expiry(ms: number | null | undefined, t: ReturnType<typeof useT>): string {
  if (!ms) return t('No expiry');
  const days = Math.ceil((ms - Date.now()) / 86_400_000);
  if (days < 0) return t('Expired');
  if (days === 0) return t('Expires today');
  return t('{n} days left', { n: days });
}

/** One card per subscription: what it holds, how much is used, when it last updated, and its actions. */
export function SubscriptionsPage() {
  const t = useT();
  const subs = useServers((s) => s.subscriptions);
  const servers = useServers((s) => s.servers);
  const [busy, setBusy] = useState<string | null>(null);

  const update = async (sub: Subscription) => {
    setBusy(sub.id);
    const r = await attempt(() => api.updateSubscription(sub.id), 'Could not update the subscription');
    setBusy(null);
    if (r) useUi.getState().toast({ level: 'success', text: t('"{name}" updated', { name: sub.name }), detail: t('{n} servers', { n: r.count }) });
  };
  const remove = async (sub: Subscription) => {
    const r = await useUi.getState().askConfirm({ title: t('Delete subscription'), message: t('Delete "{name}" and its servers?', { name: sub.name }), confirmLabel: t('Delete'), danger: true });
    if (r.ok) await attempt(() => api.deleteSubscription(sub.id), 'Could not delete the subscription');
  };
  const show = (sub: Subscription) => {
    useServers.getState().setFilter({ kind: 'group', id: sub.id });
    useUi.getState().go('servers');
  };

  return (
    <div className="page subs-page">
      <header className="page-head">
        <h1>{t('Subscriptions')}</h1>
        <div className="flex-1" />
        {subs.length > 1 && (
          <button className="btn" onClick={() => runCommand('sub.updateAll')}>
            <RefreshCw size={16} /> {t('Update all')}
          </button>
        )}
        <button className="btn btn-primary" onClick={() => useUi.getState().set({ subscriptionFor: { id: null } })}>
          <Plus size={16} /> {t('Add subscription')}
        </button>
      </header>

      {subs.length === 0 ? (
        <div className="empty-state">
          <h2>{t('No subscriptions yet')}</h2>
          <p className="muted">{t('A subscription is a link from your provider that keeps your server list up to date.')}</p>
          <div className="empty-actions">
            <button className="btn btn-primary" onClick={() => useUi.getState().set({ subscriptionFor: { id: null } })}>
              <Rss size={16} /> {t('Add subscription')}
            </button>
          </div>
        </div>
      ) : (
        <div className="sub-list">
          {subs.map((sub) => {
            const count = servers.filter((s) => s.groupId === sub.id).length;
            const used = sub.usage ? sub.usage.upload + sub.usage.download : 0;
            const pct = sub.usage?.total ? Math.min(100, (used / sub.usage.total) * 100) : null;
            return (
              <article key={sub.id} className="card sub-card">
                <div className="sub-card-head">
                  <span className="sub-icon">{busy === sub.id ? <LoaderCircle size={18} className="spin" /> : sub.lastError ? <AlertCircle size={18} className="text-warning" /> : <Rss size={18} />}</span>
                  <div className="sub-card-title">
                    <button type="button" className="link-plain" onClick={() => show(sub)} title={t('Show its servers')}>
                      {sub.name}
                    </button>
                    <span className="muted sub-url ellipsis" dir="ltr">
                      {sub.url}
                    </span>
                  </div>
                  <button className="btn btn-xs" disabled={busy === sub.id} onClick={() => void update(sub)}>
                    <RefreshCw size={14} /> {t('Update')}
                  </button>
                  <button className="icon-btn sm" aria-label={t('Edit')} title={t('Edit')} onClick={() => useUi.getState().set({ subscriptionFor: { id: sub.id } })}>
                    <Pencil size={14} />
                  </button>
                  <button className="icon-btn sm danger" aria-label={t('Delete')} title={t('Delete')} onClick={() => void remove(sub)}>
                    <Trash2 size={14} />
                  </button>
                </div>
                {sub.usage && (
                  <div className="sub-usage">
                    {pct !== null && (
                      <span className="usage-bar">
                        <span className={`usage-fill${pct > 90 ? ' high' : ''}`} style={{ width: `${pct}%` }} />
                      </span>
                    )}
                    <span className="sub-meta">
                      <span dir="ltr">
                        {formatBytes(used)}
                        {sub.usage.total ? ` / ${formatBytes(sub.usage.total)}` : ''}
                      </span>
                      <span>{expiry(sub.usage.expire, t)}</span>
                    </span>
                  </div>
                )}
                <div className="sub-meta">
                  <span>{t('{n} servers', { n: count })}</span>
                  <span>{t('Updated {when}', { when: sub.updatedAt ? formatDate(sub.updatedAt) : t('never') })}</span>
                  <span>{sub.autoUpdateHours ? t('Updates every {n} hours', { n: sub.autoUpdateHours }) : t('Updates by hand')}</span>
                </div>
                {sub.lastError && <div className="notice warning">{t('Last update failed: {error}', { error: sub.lastError })}</div>}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
