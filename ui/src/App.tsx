import { RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { boot, reloadState } from './app/boot';
import { installKeyboard } from './app/commands';
import { CommandPalette } from './components/common/CommandPalette';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { MenuHost } from './components/common/Menu';
import { ShortcutSheet } from './components/common/ShortcutSheet';
import { Toasts } from './components/common/Toasts';
import { AddServersDialog } from './components/Dialogs/AddServersDialog';
import { EditServerDialog } from './components/Dialogs/EditServerDialog';
import { SubscriptionDialog } from './components/Dialogs/SubscriptionDialog';
import { Rail } from './components/layout/Rail';
import { TopBar } from './components/layout/TopBar';
import { TrayPanel } from './components/Tray/TrayPanel';
import { useT } from './i18n';
import { HomePage } from './pages/HomePage';
import { LogPage } from './pages/LogPage';
import { ServersPage } from './pages/ServersPage';
import { SettingsPage } from './pages/SettingsPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { isTrayPanel } from './platform';
import { useUi } from './store/ui';
import { useTheme } from './theme/theme';

const PAGES = { home: HomePage, servers: ServersPage, subscriptions: SubscriptionsPage, log: LogPage, settings: SettingsPage };

/** Shell: glass top bar (the title bar), icon rail | one page, overlays. The tray panel is the same app in a small window. */
export default function App() {
  const theme = useTheme();
  const tray = isTrayPanel();
  useEffect(() => {
    boot();
    return tray ? undefined : installKeyboard();
  }, [tray]);
  if (tray) {
    return (
      <>
        <TrayPanel />
        <Toasts />
        <SubscriptionDialog />
        <AddServersDialog />
      </>
    );
  }
  return (
    <div className="app">
      <TopBar theme={theme} />
      <EngineBanner />
      <div className="main">
        <Rail />
        <CurrentPage />
      </div>
      <MenuHost />
      <AddServersDialog />
      <SubscriptionDialog />
      <EditServerDialog />
      <CommandPalette />
      <ShortcutSheet />
      <ConfirmDialog />
      <Toasts />
    </div>
  );
}

function CurrentPage() {
  const page = useUi((s) => s.page);
  const Page = PAGES[page];
  return (
    <main className="workspace" key={page}>
      <Page />
    </main>
  );
}

function EngineBanner() {
  const t = useT();
  const err = useUi((s) => s.engineError);
  const ws = useUi((s) => s.wsStatus);
  if (!err && ws !== 'reconnecting') return null;
  return (
    <div className="engine-banner" role="alert">
      <span>{err ?? t('Lost the connection to the RayConnect engine. Reconnecting…')}</span>
      <button className="btn btn-xs" onClick={() => void reloadState()}>
        <RefreshCw size={12} /> {t('Retry')}
      </button>
    </div>
  );
}
