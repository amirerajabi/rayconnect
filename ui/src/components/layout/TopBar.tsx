import { Moon, Search, Sun, SunMoon } from 'lucide-react';
import { getCommand, runCommand } from '../../app/commands';
import { withShortcut } from '../../app/keys';
import { useT } from '../../i18n';
import { useEngine } from '../../store/engine';
import { useUi } from '../../store/ui';
import type { EffectiveTheme } from '../../theme/theme';
import { UpdateChip } from '../common/UpdateChip';
import { BrandMark, Kbd } from '../common/visuals';

/** Slim glass top bar: it is the window's title bar (drag area, caption buttons), with search, updates and theme. */
export function TopBar({ theme }: { theme: EffectiveTheme }) {
  const t = useT();
  const pref = useEngine((s) => s.settings?.theme ?? 'system');
  const ThemeIcon = pref === 'system' ? SunMoon : theme === 'dark' ? Moon : Sun;
  const paletteShortcut = getCommand('view.palette')?.shortcut;
  return (
    <header className="topbar" aria-label={t('Application')}>
      <div className="brand">
        <BrandMark size={18} />
        <span className="brand-name">Raylit</span>
      </div>
      <div className="flex-1 topbar-drag" />
      <button type="button" className="palette-trigger" onClick={() => useUi.getState().set({ paletteOpen: true })} title={withShortcut(t('Search servers and commands'), paletteShortcut)}>
        <Search size={14} />
        <span className="palette-trigger-text">{t('Search servers or run a command')}</span>
        <Kbd shortcut={paletteShortcut} />
      </button>
      <div className="flex-1 topbar-drag" />
      <UpdateChip />
      <button className="icon-btn" title={t('Theme')} aria-label={t('Theme')} onClick={() => runCommand('view.toggleTheme')}>
        <ThemeIcon size={16} />
      </button>
    </header>
  );
}
