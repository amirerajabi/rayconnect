import { ArrowDown, ArrowUp, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { RoutingRule, Settings } from '../../../shared/protocol';
import { splitEntries } from '../../../shared/routing';
import { attempt } from '../app/commands';
import { showMenuBelow } from '../components/common/Menu';
import { RuleDialog } from '../components/Dialogs/RuleDialog';
import { useT } from '../i18n';
import { newRuleId, OUTBOUND_LABEL, RULE_TEMPLATES as TEMPLATES } from '../lib/routing';
import { useEngine } from '../store/engine';
import { useUi } from '../store/ui';

function saveRules(rules: RoutingRule[]): void {
  void attempt(() => useEngine.getState().updateSettings({ rules }), 'Could not save the rules');
}

/**
 * v2rayN's custom routing: the user's own lists of sites and addresses, each sent through the server, direct or
 * blocked, checked top to bottom; and what happens to everything no rule matches (whitelist or blacklist mode).
 */
export function RulesSection({ s }: { s: Settings }) {
  const t = useT();
  const [editing, setEditing] = useState<RoutingRule | 'new' | null>(null);
  const rules = s.rules;

  const move = (i: number, d: -1 | 1) => {
    const next = [...rules];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    saveRules(next);
  };
  const remove = async (r: RoutingRule) => {
    const ok = await useUi.getState().askConfirm({ title: t('Delete rule'), message: t('Delete "{name}"?', { name: r.name || t('Untitled rule') }), confirmLabel: t('Delete'), danger: true });
    if (ok.ok) saveRules(rules.filter((x) => x.id !== r.id));
  };
  const addTemplate = (tpl: Omit<RoutingRule, 'id'>) => saveRules([...rules, { ...tpl, name: t(tpl.name), id: newRuleId() }]);

  return (
    <div className="settings-section">
      <h3>{t('Routing rules')}</h3>
      <div className="choice-list" role="radiogroup" aria-label={t('Sites no rule matches')}>
        <span className="field-label">{t('Sites no rule matches')}</span>
        <label className={`choice${s.defaultRoute === 'proxy' ? ' on' : ''}`}>
          <input type="radio" name="default-route" checked={s.defaultRoute === 'proxy'} onChange={() => void attempt(() => useEngine.getState().updateSettings({ defaultRoute: 'proxy' }))} />
          <span>
            <span className="toggle-label">{t('Go through the server (whitelist)')}</span>
            <span className="field-hint">{t('Everything uses the server except what your rules send direct or block.')}</span>
          </span>
        </label>
        <label className={`choice${s.defaultRoute === 'direct' ? ' on' : ''}`}>
          <input type="radio" name="default-route" checked={s.defaultRoute === 'direct'} onChange={() => void attempt(() => useEngine.getState().updateSettings({ defaultRoute: 'direct' }))} />
          <span>
            <span className="toggle-label">{t('Go direct (blacklist)')}</span>
            <span className="field-hint">{t('Only what your rules send through the server uses it; everything else goes direct.')}</span>
          </span>
        </label>
      </div>

      <div className="rules-head">
        <span className="field-label flex-1">{t('Your rules')}</span>
        <button
          className="btn btn-xs"
          onClick={(e) => showMenuBelow(e.currentTarget, TEMPLATES.map((tpl) => ({ label: t(tpl.label), run: () => addTemplate(tpl.rule) })))}
        >
          {t('From a template')} <ChevronDown size={14} />
        </button>
        <button className="btn btn-xs btn-primary" onClick={() => setEditing('new')}>
          <Plus size={14} /> {t('Add rule')}
        </button>
      </div>

      {rules.length === 0 ? (
        <p className="muted settings-note">{t('No rules yet. A rule is a list of sites or addresses and where they go: through the server, direct or blocked.')}</p>
      ) : (
        <ol className="rule-list">
          {rules.map((r, i) => {
            const { domains, ips, invalid } = splitEntries(r.entries);
            return (
              <li key={r.id} className={`rule-row${r.enabled ? '' : ' off'}`}>
                <input
                  type="checkbox"
                  className="switch"
                  checked={r.enabled}
                  aria-label={t('Use this rule')}
                  title={t('Use this rule')}
                  onChange={(e) => saveRules(rules.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x)))}
                />
                <button type="button" className="rule-main" onClick={() => setEditing(r)}>
                  <span className="rule-name ellipsis">{r.name || t('Untitled rule')}</span>
                  <span className="rule-meta">
                    <span className={`route-tag route-${r.outbound}`}>{t(OUTBOUND_LABEL[r.outbound])}</span>
                    <span className="muted">
                      {t('{d} sites · {i} addresses', { d: domains.length, i: ips.length })}
                      {invalid.length ? ` · ${t('{n} not understood', { n: invalid.length })}` : ''}
                    </span>
                  </span>
                </button>
                <button className="icon-btn sm" aria-label={t('Move up')} title={t('Move up')} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={14} />
                </button>
                <button className="icon-btn sm" aria-label={t('Move down')} title={t('Move down')} disabled={i === rules.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown size={14} />
                </button>
                <button className="icon-btn sm" aria-label={t('Edit')} title={t('Edit')} onClick={() => setEditing(r)}>
                  <Pencil size={14} />
                </button>
                <button className="icon-btn sm danger" aria-label={t('Delete')} title={t('Delete')} onClick={() => void remove(r)}>
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <p className="muted settings-note">{t('Rules are checked from the top; the first one that matches decides. Changes apply at once, also while connected.')}</p>

      {editing && (
        <RuleDialog
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(rule) => {
            saveRules(editing === 'new' ? [...rules, rule] : rules.map((x) => (x.id === rule.id ? rule : x)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
