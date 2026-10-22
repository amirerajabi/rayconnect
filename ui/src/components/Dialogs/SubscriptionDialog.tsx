import { LoaderCircle, Rss } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import { pluralize } from '../../lib/format';
import { useServers } from '../../store/servers';
import { useUi } from '../../store/ui';
import { Dialog, Field } from '../common/Dialog';

const AUTO = [
  { hours: 0, label: 'Only by hand' },
  { hours: 6, label: 'Every 6 hours' },
  { hours: 12, label: 'Every 12 hours' },
  { hours: 24, label: 'Every day' },
];

/** Add a subscription (fetched right away, so a bad address shows here) or edit one. */
export function SubscriptionDialog() {
  const open = useUi((s) => s.subscriptionFor);
  if (!open) return null;
  return <SubscriptionForm key={open.id ?? 'new'} id={open.id} url={open.url} />;
}

function SubscriptionForm({ id, url: initialUrl }: { id: string | null; url?: string }) {
  const existing = useServers((s) => s.subscriptions.find((x) => x.id === id));
  const [name, setName] = useState(existing?.name ?? '');
  const [url, setUrl] = useState(existing?.url ?? initialUrl ?? '');
  const [hours, setHours] = useState(existing?.autoUpdateHours ?? 12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => useUi.getState().set({ subscriptionFor: null });
  const valid = /^https?:\/\/\S+$/i.test(url.trim());

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        await api.editSubscription(existing.id, { name, url, autoUpdateHours: hours });
        if (url.trim() !== existing.url) await api.updateSubscription(existing.id);
        close();
        return;
      }
      const sub = await api.addSubscription(name, url);
      if (hours !== sub.autoUpdateHours) await api.editSubscription(sub.id, { autoUpdateHours: hours });
      const n = useServers.getState().servers.filter((s) => s.groupId === sub.id).length;
      useUi.getState().toast({ level: 'success', text: `Added "${sub.name}"`, detail: pluralize(n, 'server') });
      useServers.getState().setFilter({ kind: 'group', id: sub.id });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={existing ? 'Edit subscription' : 'Add subscription'}
      icon={<Rss size={18} className="text-accent" />}
      width={560}
      onClose={close}
      onSubmit={() => void submit()}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!valid || busy} onClick={() => void submit()}>
            {busy && <LoaderCircle size={16} className="spin" />}
            {existing ? 'Save' : busy ? 'Fetching…' : 'Add'}
          </button>
        </>
      }
    >
      <div className="form">
        <Field label="Subscription address" hint="The link your provider gave you; it returns your list of servers.">
          <input className={`input mono-sm${url && !valid ? ' invalid' : ''}`} value={url} autoFocus onChange={(e) => setUrl(e.target.value)} placeholder="https://…" spellCheck={false} />
        </Field>
        <Field label="Name" hint={existing ? undefined : 'Leave empty to use the name the provider sends.'}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My VPN" />
        </Field>
        <Field label="Update automatically">
          <div className="segmented">
            {AUTO.map((a) => (
              <button key={a.hours} className={hours === a.hours ? 'on' : ''} aria-pressed={hours === a.hours} onClick={() => setHours(a.hours)}>
                {a.label}
              </button>
            ))}
          </div>
        </Field>
        {error && <div className="notice warning">{error}</div>}
      </div>
    </Dialog>
  );
}
