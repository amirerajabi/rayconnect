import { Power, Rss, ScrollText, Server as ServerIcon, Settings } from 'lucide-react';
import { withShortcut } from '../../app/keys';
import { getCommand } from '../../app/commands';
import { useT } from '../../i18n';
import { useConnection } from '../../store/connection';
import { useUi, type Page } from '../../store/ui';

const ITEMS: { page: Page; label: string; Icon: typeof Power; command: string }[] = [
  { page: 'home', label: 'Connection', Icon: Power, command: 'nav.home' },
  { page: 'servers', label: 'Servers', Icon: ServerIcon, command: 'nav.servers' },
  { page: 'subscriptions', label: 'Subscriptions', Icon: Rss, command: 'nav.subscriptions' },
  { page: 'log', label: 'Log', Icon: ScrollText, command: 'nav.log' },
];

/** The icon rail: one page per job. The connection dot on the first icon shows the state from every page. */
export function Rail() {
  const t = useT();
  const page = useUi((s) => s.page);
  const status = useConnection((s) => s.connection.status);
  const item = (i: (typeof ITEMS)[number] | { page: Page; label: string; Icon: typeof Power; command: string }) => (
    <button
      key={i.page}
      type="button"
      className={`rail-btn${page === i.page ? ' active' : ''}`}
      aria-current={page === i.page ? 'page' : undefined}
      title={withShortcut(t(i.label), getCommand(i.command)?.shortcut)}
      onClick={() => useUi.getState().go(i.page)}
    >
      <i.Icon size={20} />
      <span className="rail-label">{t(i.label)}</span>
      {i.page === 'home' && status !== 'disconnected' && <span className={`rail-dot rail-dot-${status}`} aria-hidden="true" />}
    </button>
  );
  return (
    <nav className="rail" aria-label={t('Pages')}>
      {ITEMS.map(item)}
      <div className="flex-1" />
      {item({ page: 'settings', label: 'Settings', Icon: Settings, command: 'nav.settings' })}
    </nav>
  );
}
