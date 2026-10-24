import { ListFilter } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { RoutingRule, RuleOutbound } from '../../../../shared/protocol';
import { splitEntries } from '../../../../shared/routing';
import { useT } from '../../i18n';
import { newRuleId, OUTBOUND_LABEL } from '../../lib/routing';
import { Dialog, Field } from '../common/Dialog';

const OUTBOUNDS: RuleOutbound[] = ['proxy', 'direct', 'block'];

/** Add or edit one rule: a name, where it sends traffic, and its sites and addresses, one per line. */
export function RuleDialog({ rule, onClose, onSave }: { rule: RoutingRule | null; onClose: () => void; onSave: (r: RoutingRule) => void }) {
  const t = useT();
  const [name, setName] = useState(rule?.name ?? '');
  const [outbound, setOutbound] = useState<RuleOutbound>(rule?.outbound ?? 'proxy');
  const [text, setText] = useState((rule?.entries ?? []).join('\n'));
  const entries = useMemo(() => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean), [text]);
  const parsed = useMemo(() => splitEntries(entries), [entries]);
  const usable = parsed.domains.length + parsed.ips.length;

  const save = () => onSave({ id: rule?.id ?? newRuleId(), name: name.trim(), enabled: rule?.enabled ?? true, outbound, entries });

  return (
    <Dialog
      title={rule ? t('Edit rule') : t('Add rule')}
      icon={<ListFilter size={18} className="text-accent" />}
      width={600}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <span className="muted footer-note flex-1">{t('{d} sites · {i} addresses', { d: parsed.domains.length, i: parsed.ips.length })}</span>
          <button className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className="btn btn-primary" disabled={usable === 0} onClick={save}>
            {t('Save')}
          </button>
        </>
      }
    >
      <div className="form">
        <Field label={t('Name')}>
          <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Work sites')} />
        </Field>
        <Field label={t('Send these')}>
          <div className="segmented">
            {OUTBOUNDS.map((o) => (
              <button key={o} className={outbound === o ? 'on' : ''} aria-pressed={outbound === o} onClick={() => setOutbound(o)}>
                {t(OUTBOUND_LABEL[o])}
              </button>
            ))}
          </div>
        </Field>
        <Field
          label={t('Sites and addresses')}
          hint={t('One per line: a site (example.com covers its subdomains), a word (google), an IP or range (1.2.3.0/24), or Xray lists such as geosite:category-ir and geoip:ir. Lines starting with # are notes.')}
        >
          <textarea className="input textarea mono-sm" dir="ltr" rows={9} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder={'example.com\ngeosite:telegram\n91.108.0.0/16'} />
        </Field>
        {parsed.invalid.length > 0 && (
          <div className="notice warning">
            {t('Not understood, left out: {lines}', { lines: parsed.invalid.slice(0, 3).join(', ') + (parsed.invalid.length > 3 ? ' …' : '') })}
          </div>
        )}
      </div>
    </Dialog>
  );
}
