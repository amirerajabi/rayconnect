import type { RoutingMode, Settings } from '../../../../shared/protocol';
import { attempt } from '../../app/commands';
import { useEngine } from '../../store/engine';
import { useUi } from '../../store/ui';

export const ROUTING_LABEL: Record<RoutingMode, { label: string; hint: string }> = {
  global: { label: 'Everything through the server', hint: 'Only local network addresses go direct.' },
  'iran-direct': { label: 'Iranian sites direct', hint: '.ir domains and Iranian IP addresses skip the server.' },
  'china-direct': { label: 'Chinese sites direct', hint: 'Chinese domains and IP addresses skip the server.' },
  'russia-direct': { label: 'Russian sites direct', hint: '.ru domains and Russian IP addresses skip the server.' },
};

function save(patch: Partial<Settings>): void {
  void attempt(() => useEngine.getState().updateSettings(patch), 'Could not save the setting');
}

/** The settings people change most, one click away: proxy mode, routing and ad blocking. */
export function QuickPanel() {
  const s = useEngine((e) => e.settings);
  if (!s) return null;
  return (
    <div className="dock-panel quick">
      <div className="panel-header">
        <span className="panel-title">Proxy mode</span>
      </div>
      <div className="quick-group" role="radiogroup" aria-label="Proxy mode">
        <Choice name="mode" checked={s.proxyMode === 'system'} label="System proxy" hint="Browsers and most apps use Raylit automatically." onChange={() => save({ proxyMode: 'system' })} />
        <Choice
          name="mode"
          checked={s.proxyMode === 'manual'}
          label="Proxy only"
          hint={`Apps that you point at 127.0.0.1:${s.httpPort} (HTTP) or ${s.socksPort} (SOCKS).`}
          onChange={() => save({ proxyMode: 'manual' })}
        />
      </div>
      <div className="panel-header">
        <span className="panel-title">Routing</span>
      </div>
      <div className="quick-group" role="radiogroup" aria-label="Routing">
        {(Object.keys(ROUTING_LABEL) as RoutingMode[]).map((r) => (
          <Choice key={r} name="routing" checked={s.routing === r} label={ROUTING_LABEL[r].label} hint={ROUTING_LABEL[r].hint} onChange={() => save({ routing: r })} />
        ))}
      </div>
      <div className="panel-header">
        <span className="panel-title">Extras</span>
      </div>
      <div className="quick-group">
        <label className="quick-choice">
          <input type="checkbox" className="switch" checked={s.blockAds} onChange={(e) => save({ blockAds: e.target.checked })} />
          <span>
            <span className="toggle-label">Block ads and trackers</span>
          </span>
        </label>
        <label className="quick-choice">
          <input type="checkbox" className="switch" checked={s.allowLan} onChange={(e) => save({ allowLan: e.target.checked })} />
          <span>
            <span className="toggle-label">Share with my network</span>
            <span className="field-hint">Other devices can use this computer's proxy.</span>
          </span>
        </label>
      </div>
      <p className="panel-note">
        <button className="link-btn" onClick={() => useUi.getState().set({ settingsOpen: 'proxy' })}>
          All settings
        </button>
      </p>
    </div>
  );
}

function Choice({ name, checked, label, hint, onChange }: { name: string; checked: boolean; label: string; hint?: string; onChange: () => void }) {
  return (
    <label className={`quick-choice${checked ? ' on' : ''}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span>
        <span className="toggle-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
    </label>
  );
}
