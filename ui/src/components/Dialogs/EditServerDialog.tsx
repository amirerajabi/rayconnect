import { LoaderCircle, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MANUAL_GROUP } from '../../../../shared/protocol';
import { api } from '../../api/client';
import { useT } from '../../i18n';
import { useServers } from '../../store/servers';
import { useUi } from '../../store/ui';
import { Dialog, Field } from '../common/Dialog';

/** Rename a server, or change its details by editing its share link. */
export function EditServerDialog() {
  const id = useUi((s) => s.editServer);
  if (!id) return null;
  return <EditServer key={id} id={id} />;
}

function EditServer({ id }: { id: string }) {
  const t = useT();
  const server = useServers((s) => s.servers.find((x) => x.id === id));
  const [name, setName] = useState(server?.name ?? '');
  const [link, setLink] = useState('');
  const [original, setOriginal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => useUi.getState().set({ editServer: null });

  useEffect(() => {
    void api.shareLink(id).then(
      (r) => {
        setLink(r.link);
        setOriginal(r.link);
      },
      () => undefined,
    );
  }, [id]);

  if (!server) return null;
  const fromSubscription = server.groupId !== MANUAL_GROUP;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.updateServer(id, { name, link: link !== original ? link : undefined });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t('Edit server')}
      icon={<Pencil size={18} className="text-accent" />}
      width={600}
      onClose={close}
      onSubmit={() => void submit()}
      footer={
        <>
          <button className="btn" onClick={close}>
            {t('Cancel')}
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => void submit()}>
            {busy && <LoaderCircle size={16} className="spin" />} {t('Save')}
          </button>
        </>
      }
    >
      <div className="form">
        <Field label={t('Name')}>
          <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('Share link')} hint={t('Edit or replace the link to change the address, port, transport or keys.')}>
          <textarea className="input textarea mono-sm" dir="ltr" rows={5} spellCheck={false} value={link} onChange={(e) => setLink(e.target.value)} />
        </Field>
        <p className="muted mono-sm selectable" dir="ltr">
          {server.address}:{server.port}
        </p>
        {fromSubscription && <div className="notice warning">{t('This server comes from a subscription: the next update replaces your changes.')}</div>}
        {error && <div className="notice warning">{error}</div>}
      </div>
    </Dialog>
  );
}
