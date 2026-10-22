import { Menu as MenuIcon, Moon, Search, Sun, SunMoon } from 'lucide-react';
import { getCommand, runCommand } from '../../app/commands';
import { withShortcut } from '../../app/keys';
import { useEngine } from '../../store/engine';
import { useUi } from '../../store/ui';
import type { EffectiveTheme } from '../../theme/theme';
import { CommandButton } from '../common/CommandButton';
import { showMenuBelow, type MenuItem } from '../common/Menu';
import { BrandMark, Kbd } from '../common/visuals';

const MENU: { label: string; ids: (string | '-')[] }[] = [
  { label: 'Servers', ids: ['server.paste', 'server.add', 'sub.add', 'sub.updateAll', '-', 'server.test', 'server.sortDelay', '-', 'server.edit', 'server.copyLink', 'server.delete'] },
  { label: 'Connection', ids: ['conn.toggle', 'proxy.toggle', '-', 'core.install', 'view.logs'] },
  { label: 'View', ids: ['view.toggleSidebar', 'view.toggleDetails', 'view.toggleTheme', '-', 'view.palette', 'view.shortcuts'] },
  { label: 'Help', ids: ['view.settings', 'app.checkUpdates'] },
];

function appMenu(): MenuItem[] {
  return MENU.map((m) => ({
    label: m.label,
    submenu: m.ids.map((id): MenuItem => {
      if (id === '-') return 'separator';
      const c = getCommand(id)!;
      return { label: c.label, icon: c.icon, shortcut: c.shortcut, disabled: c.disabled?.() ?? false, run: () => runCommand(id) };
    }),
  }));
}

/** Glass top bar (Rowlit style): brand, app menu, side panel toggle, import buttons, palette trigger, theme, settings. */
export function TopBar({ theme }: { theme: EffectiveTheme }) {
  const pref = useEngine((s) => s.settings?.theme ?? 'system');
  const sidebar = useUi((s) => s.sidebarVisible);
  const ThemeIcon = pref === 'system' ? SunMoon : theme === 'dark' ? Moon : Sun;
  const next = pref === 'system' ? 'dark' : pref === 'dark' ? 'light' : 'system';
  const paletteShortcut = getCommand('view.palette')?.shortcut;

  return (
    <header className="topbar" aria-label="Application">
      <div className="brand">
        <BrandMark size={18} />
        <span className="brand-name">Raylit</span>
      </div>
      <button className="icon-btn" title="Menu" aria-label="Application menu" aria-haspopup="menu" onClick={(e) => showMenuBelow(e.currentTarget, appMenu())}>
        <MenuIcon size={16} />
      </button>
      <CommandButton command="view.toggleSidebar" variant="icon" className={sidebar ? 'on' : ''} />
      <div className="topbar-sep" />
      <CommandButton command="server.paste" variant="ghost" label="Paste" className="topbar-text-btn" />
      <CommandButton command="sub.add" variant="ghost" label="Subscription" className="topbar-text-btn" />
      <div className="flex-1 topbar-drag" />
      <button
        type="button"
        className="palette-trigger"
        onClick={() => useUi.getState().set({ paletteOpen: true })}
        title={withShortcut('Search servers and commands', paletteShortcut)}
        aria-label="Search servers and commands"
      >
        <Search size={14} />
        <span className="palette-trigger-text">Search servers or run a command</span>
        <Kbd shortcut={paletteShortcut} />
      </button>
      <div className="flex-1 topbar-drag" />
      <button className="icon-btn" title={`Theme: ${pref} — click for ${next}`} aria-label={`Theme ${pref}, switch to ${next}`} onClick={() => runCommand('view.toggleTheme')}>
        <ThemeIcon size={16} />
      </button>
      <CommandButton command="view.shortcuts" variant="icon" />
      <CommandButton command="view.settings" variant="icon" />
    </header>
  );
}
