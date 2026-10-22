import { getCommand, runCommand } from '../../app/commands';
import { withShortcut } from '../../app/keys';
import { useConnection } from '../../store/connection';
import { useEngine } from '../../store/engine';
import { useServers } from '../../store/servers';

interface Props {
  command: string;
  /** Show the label next to the icon (toolbar) or icon only (top bar). */
  label?: boolean | string;
  variant?: 'ghost' | 'icon' | 'tool';
  className?: string;
}

/**
 * A button bound to a command: icon, label, tooltip with shortcut and the disabled reason all come from the registry.
 * It re-renders on the state `disabled()` reads, so the reason stays current.
 */
export function CommandButton({ command, label, variant = 'tool', className = '' }: Props) {
  useServers((s) => s.marked);
  useServers((s) => s.servers.length);
  useServers((s) => s.subscriptions.length);
  useConnection((s) => s.connection.status);
  useConnection((s) => s.testing);
  useEngine((s) => s.core.installing);
  const c = getCommand(command);
  if (!c) return null;
  const reason = c.disabled?.() ?? null;
  const text = typeof label === 'string' ? label : c.label.replace('…', '');
  const Icon = c.icon;
  const cls = variant === 'icon' ? 'icon-btn' : variant === 'ghost' ? 'btn btn-ghost' : 'tool-btn';
  return (
    <button
      type="button"
      className={`${cls} ${className}`}
      title={reason ?? withShortcut(c.label.replace('…', ''), c.shortcut)}
      aria-label={c.label.replace('…', '')}
      aria-disabled={reason ? true : undefined}
      onClick={() => !reason && runCommand(command)}
    >
      {Icon && <Icon size={variant === 'tool' ? 20 : 16} />}
      {label !== undefined && label !== false && <span className="btn-text">{text}</span>}
    </button>
  );
}
