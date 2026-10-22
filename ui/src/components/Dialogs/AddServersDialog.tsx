import { ClipboardPaste, LoaderCircle, Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import { pluralize } from '../../lib/format';
import { readClipboardText } from '../../platform';
import { useUi } from '../../store/ui';
import { Dialog } from '../common/Dialog';

/** Paste one or more share links. A subscription address pasted here moves over to the subscription dialog. */
export function AddServersDialog() {
  const open = useUi((s) => s.addServers);
  if (!open) return null;
  return <AddServers initial={open.text} />;
}

function AddServers({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => useUi.getState().set({ addServers: null });
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    if (/^https?:\/\/\S+$/i.test(t)) {
      useUi.getState().set({ addServers: null, subscriptionFor: { id: null, url: t } });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.importLinks(t);
      if (r.added === 0) {
        setError(r.duplicates ? 'These servers are already in the list.' : 'No share links found. Raylit reads vmess://, vless://, trojan:// and ss:// links.');
        return;
      }
      const extra = [r.duplicates ? `${r.duplicates} already in the list` : '', r.skipped ? `${r.skipped} lines not understood` : ''].filter(Boolean).join(', ');
      useUi.getState().toast({ level: 'success', text: `Added ${pluralize(r.added, 'server')}`, detail: extra || undefined });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Add servers"
      icon={<Plus size={18} className="text-accent" />}
      width={600}
      onClose={close}
      footer={
        <>
          <span className="muted footer-note flex-1">{lines ? `${pluralize(lines, 'line')}` : 'One link per line'}</span>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void submit()}>
            {busy && <LoaderCircle size={16} className="spin" />} Add
          </button>
        </>
      }
    >
      <div className="form">
        <p className="muted dialog-lead">Paste the share links you got from your provider: vmess://, vless://, trojan:// or ss://. A base64 block of links works too.</p>
        <textarea
          className="input textarea mono-sm"
          rows={9}
          autoFocus
          spellCheck={false}
          value={text}
          placeholder="vless://…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="input-with-btn">
          <button className="btn btn-xs" onClick={async () => setText(await readClipboardText())}>
            <ClipboardPaste size={14} /> Paste from clipboard
          </button>
        </div>
        {error && <div className="notice warning">{error}</div>}
      </div>
    </Dialog>
  );
}
