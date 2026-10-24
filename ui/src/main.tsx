import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/vazirmatn';
import App from './App';
import './i18n';
import { getPlatform, isTrayPanel } from './platform';
import { applyBootTheme } from './theme/theme';
import './theme/tokens.css';
import './theme/app.css';

applyBootTheme();
if (import.meta.env.DEV) {
  // Dev builds only: stores on window for inspection from DevTools.
  void Promise.all([import('./store/ui'), import('./store/servers'), import('./store/connection'), import('./store/engine')]).then(([ui, sv, cn, en]) => {
    Object.assign(window, { __raylit: { ui: ui.useUi, servers: sv.useServers, connection: cn.useConnection, engine: en.useEngine } });
  });
}
const platform = getPlatform();
document.documentElement.classList.add(`os-${platform.os}`);
// The tray panel is a frameless flyout: no title bar to make room for.
if (platform.titleBar && !isTrayPanel()) document.documentElement.classList.add(`titlebar-${platform.titleBar}`);
if (isTrayPanel()) document.documentElement.classList.add('tray-window');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
