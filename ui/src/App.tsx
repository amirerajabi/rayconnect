import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { boot, reloadState } from './app/boot';
import { installKeyboard } from './app/commands';
import { CommandPalette } from './components/common/CommandPalette';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { MenuHost } from './components/common/Menu';
import { ShortcutSheet } from './components/common/ShortcutSheet';
import { Splitter } from './components/common/Splitter';
import { Toasts } from './components/common/Toasts';
import { ConnectionPanel } from './components/Connection/ConnectionPanel';
import { DetailsPane } from './components/DetailsPane/DetailsPane';
import { AddServersDialog } from './components/Dialogs/AddServersDialog';
import { EditServerDialog } from './components/Dialogs/EditServerDialog';
import { SubscriptionDialog } from './components/Dialogs/SubscriptionDialog';
import { Dock } from './components/layout/Dock';
import { TopBar } from './components/layout/TopBar';
import { ServerList } from './components/ServerList/ServerList';
import { SettingsDialog } from './components/Settings/SettingsDialog';
import { StatusBar } from './components/StatusBar/StatusBar';
import { Toolbar } from './components/Toolbar/Toolbar';
import { useUi } from './store/ui';
import { useTheme } from './theme/theme';

/** Shell (Rowlit / Grabbit layout): glass top bar, dock | workspace (connection, toolbar, list, details), status bar, overlays. */
export default function App() {
  const theme = useTheme();
  useEffect(() => {
    boot();
    return installKeyboard();
  }, []);

  return (
    <div className="app">
      <TopBar theme={theme} />
      <EngineBanner />
      <div className="main">
        <Dock />
        <section className="workspace" aria-label="Servers">
          <ConnectionPanel />
          <Toolbar />
          <Workspace />
        </section>
      </div>
      <StatusBar />
      <MenuHost />
      <AddServersDialog />
      <SubscriptionDialog />
      <EditServerDialog />
      <SettingsDialog />
      <CommandPalette />
      <ShortcutSheet />
      <ConfirmDialog />
      <Toasts />
    </div>
  );
}

/** List over details, with a draggable split; the details height is remembered. */
function Workspace() {
  const visible = useUi((s) => s.detailsVisible);
  const height = useUi((s) => s.detailsHeight);
  const ref = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState(0);
  return (
    <div className="workspace-body" ref={ref}>
      <ServerList />
      {visible && (
        <>
          <Splitter
            direction="horizontal"
            ariaLabel="Resize details pane"
            onDragStart={() => setStart((ref.current?.querySelector('.details') as HTMLElement | null)?.offsetHeight ?? 220)}
            onDrag={(d) => {
              const max = (ref.current?.clientHeight ?? 600) - 120;
              useUi.getState().setLayout({ detailsHeight: Math.max(130, Math.min(max, start - d)) });
            }}
            onDoubleClick={() => useUi.getState().setLayout({ detailsHeight: 0 })}
          />
          <div className="details-host" style={{ height: height > 0 ? height : undefined }}>
            <DetailsPane />
          </div>
        </>
      )}
    </div>
  );
}

function EngineBanner() {
  const err = useUi((s) => s.engineError);
  const ws = useUi((s) => s.wsStatus);
  if (!err && ws !== 'reconnecting') return null;
  return (
    <div className="engine-banner" role="alert">
      <span>{err ?? 'Lost the connection to the Raylit engine. Reconnecting…'}</span>
      <button className="btn btn-xs" onClick={() => void reloadState()}>
        <RefreshCw size={12} /> Retry
      </button>
    </div>
  );
}
