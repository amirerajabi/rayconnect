import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { t as tr } from '../../i18n';
import { useUi } from '../../store/ui';

const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle };

/** Bottom-right notifications. */
export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICONS[t.level];
        return (
          <div key={t.id} className={`toast toast-${t.level}`}>
            <Icon size={16} className="toast-icon" />
            <div className="toast-body">
              <div className="toast-text">{t.text}</div>
              {t.detail && <div className="toast-detail">{t.detail}</div>}
            </div>
            <button className="icon-btn xs" aria-label={tr('Dismiss')} onClick={() => useUi.getState().dismissToast(t.id)}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
