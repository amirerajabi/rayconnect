import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { getPlatform } from './platform';
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
if (platform.titleBar) document.documentElement.classList.add(`titlebar-${platform.titleBar}`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
