import { ArrowDownCircle, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
import { useT } from '../../i18n';
import { useUi } from '../../store/ui';
import { updateChip, useUpdates } from '../../store/updates';

/**
 * Grabbit's update chip, now in the top bar: checking, download progress, "Restart to update", or a quiet mark after a
 * failed check. Nothing when there is nothing to say.
 */
export function UpdateChip() {
  const t = useT();
  const status = useUpdates((s) => s.status);
  const chip = updateChip(status);
  if (!status || !chip) return null;
  const ready = status.state === 'ready';
  const error = status.state === 'error';
  const Icon = status.state === 'checking' ? LoaderCircle : ready ? RefreshCw : error ? CircleAlert : ArrowDownCircle;
  const text = t(chip.text, { version: status.version ?? '', percent: status.percent ?? 0 });
  return (
    <button
      type="button"
      className={`update-chip tone-${chip.tone}`}
      title={error ? `${text}: ${status.message ?? ''}` : text}
      aria-label={text}
      onClick={() => (ready || status.state === 'available' ? void useUpdates.getState().install() : useUi.getState().go('settings', 'updates'))}
    >
      <Icon size={14} className={status.state === 'checking' ? 'spin' : undefined} />
      {/* a failed check is a quiet mark only: an offline machine should not carry a red label all day */}
      {!error && <span>{text}</span>}
    </button>
  );
}
