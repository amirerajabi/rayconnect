// RayConnect desktop: starts the engine sidecar, opens the window, and owns the native bits (tray with Connect /
// Disconnect, notifications, the file picker for the Xray executable, launch at login).
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, Notification, Tray } from 'electron';
import { writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { CH, type Preferences, type TrayState } from '../shared/channels';
import { startEngine, stopEngine, type EngineInfo } from './engine-process';
import { migrateUserData } from './migrate';
import { iconPath, trayIconPath } from './paths';
import { TrayPanel } from './tray-panel';
import { Updater } from './updater';
import { createMainWindow, DARK, LIGHT, titleBarKind } from './window';

const devUrl = process.env.RAYCONNECT_DEV_URL;
// Separate profile (tests, portable use): settings, servers and window state all live under it.
if (process.env.RAYCONNECT_USER_DATA) app.setPath('userData', process.env.RAYCONNECT_USER_DATA);
else migrateUserData(app.getPath('appData'), app.getPath('userData'));
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let engine: EngineInfo | null = null;
let quitting = false;
let prefs: Preferences = { minimizeToTray: true, autoUpdate: true, launchAtLogin: false, language: 'en' };
let trayState: TrayState = { status: 'disconnected', server: '', systemProxy: false };
let updater: Updater | null = null;
let lastTrayTip = '';
let trayMenu: Menu | null = null;
let panel: TrayPanel | null = null;
let loginItemSynced = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  void app.whenReady().then(start);
}

async function start(): Promise<void> {
  // Still the id from before the rename to RayConnect: Windows keys notifications, the taskbar and the launch-at-login
  // entry on it, and the installer its uninstall entry (appId in electron-builder.yml), so updates replace the old app.
  app.setAppUserModelId('com.raylit.app');
  try {
    engine = await startEngine();
  } catch (e) {
    dialog.showErrorBox('RayConnect', `Could not start the RayConnect engine.\n\n${e instanceof Error ? e.message : String(e)}`);
    app.exit(1);
    return;
  }
  // A smoke test stays offline unless it points the updater at a test feed.
  updater = await Updater.create((m) => console.log(m), !!process.env.RAYCONNECT_SMOKE_SHOT && !process.env.RAYCONNECT_UPDATE_FEED);
  installIpc();
  installMenu();
  openWindow();
  panel = new TrayPanel(engine, path.join(__dirname, 'preload.js'), devUrl);
  createTray();
}

function openWindow(): void {
  if (!engine) return;
  win = createMainWindow(engine, path.join(__dirname, 'preload.js'), devUrl);
  win.webContents.once('did-finish-load', () => {
    const shot = process.env.RAYCONNECT_SMOKE_SHOT;
    if (shot) smokeShot(shot);
  });
  win.on('close', (e) => {
    // Close = hide to the tray (the connection stays up); Quit from the tray disconnects and exits.
    if (!quitting && prefs.minimizeToTray && tray) {
      e.preventDefault();
      win?.hide();
    }
  });
  // Windows is logging off or shutting down: disconnect while we still can, or the system proxy would stay pointed at
  // a proxy that no longer runs until the next start.
  win.on('session-end', () => {
    quitting = true;
    void stopEngine();
  });
  win.on('closed', () => {
    win = null;
    // The hidden tray panel keeps a window alive, so 'window-all-closed' would never fire: quit here instead.
    if (!quitting && !(tray && prefs.minimizeToTray)) quit();
  });
}

function showWindow(): void {
  if (!win) openWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function sendCommand(command: string, show = true): void {
  if (show) showWindow();
  win?.webContents.send(CH.command, command);
}

/** The tray menu's words in Persian; the menu follows the UI language. */
const TRAY_FA: Record<string, string> = {
  'Connected to {server}': 'متصل به {server}',
  Connected: 'متصل',
  'Connecting…': 'در حال اتصال…',
  'Not connected': 'وصل نیست',
  Connect: 'اتصال',
  Disconnect: 'قطع اتصال',
  'Use as system proxy': 'استفاده به عنوان پروکسی سیستم',
  'Show RayConnect': 'نمایش RayConnect',
  'Import from clipboard': 'وارد کردن از کلیپ‌بورد',
  'Settings…': 'تنظیمات…',
  Quit: 'خروج',
};

function tr(text: string, server = ''): string {
  return (prefs.language === 'fa' ? (TRAY_FA[text] ?? text) : text).replace('{server}', server);
}

function createTray(): void {
  const image = nativeImage.createFromPath(trayIconPath(false));
  if (image.isEmpty()) return;
  tray = new Tray(image.resize({ width: 16, height: 16 }));
  // Left click opens the panel, right click the menu. No setContextMenu: on macOS it would take the left click too.
  tray.on('click', () => {
    if (panel && tray) panel.toggle(tray.getBounds());
    else showWindow();
  });
  tray.on('right-click', () => {
    panel?.hide();
    if (trayMenu) tray?.popUpContextMenu(trayMenu);
  });
  updateTray();
}

function updateTray(): void {
  if (!tray) return;
  const { status, server, systemProxy } = trayState;
  const on = status === 'connected';
  const image = nativeImage.createFromPath(trayIconPath(on));
  if (!image.isEmpty()) tray.setImage(image.resize({ width: 16, height: 16 }));
  const label = on ? (server ? tr('Connected to {server}', server) : tr('Connected')) : status === 'connecting' ? tr('Connecting…') : tr('Not connected');
  const tip = `RayConnect: ${label}`.slice(0, 127);
  // Logged so smoke tests (and bug reports) can see what the tray shows.
  if (tip !== lastTrayTip) console.log(`tray: ${tip}${on ? ' [green icon]' : ''}`);
  lastTrayTip = tip;
  tray.setToolTip(tip);
  trayMenu = Menu.buildFromTemplate([
    { label, enabled: false },
    { label: on || status === 'connecting' ? tr('Disconnect') : tr('Connect'), click: () => sendCommand('conn.toggle', false) },
    { label: tr('Use as system proxy'), type: 'checkbox', checked: systemProxy, click: () => sendCommand('proxy.toggle', false) },
    { type: 'separator' },
    { label: tr('Show RayConnect'), click: showWindow },
    { label: tr('Import from clipboard'), click: () => sendCommand('server.paste') },
    { label: tr('Settings…'), click: () => sendCommand('nav.settings') },
    { type: 'separator' },
    { label: tr('Quit'), click: quit },
  ]);
}

function installMenu(): void {
  if (process.platform !== 'darwin') {
    // The in-app menu button replaces the menu bar on Windows and Linux.
    Menu.setApplicationMenu(null);
    return;
  }
  const cmd = (label: string, command: string, accelerator?: string): Electron.MenuItemConstructorOptions => ({ label, accelerator, click: () => sendCommand(command) });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { label: 'Servers', submenu: [cmd('Add servers…', 'server.add', 'CmdOrCtrl+N'), cmd('Add subscription…', 'sub.add', 'CmdOrCtrl+Shift+N'), cmd('Update subscriptions', 'sub.updateAll')] },
      { role: 'editMenu' },
      { label: 'Connection', submenu: [cmd('Connect / Disconnect', 'conn.toggle', 'CmdOrCtrl+Return'), cmd('Test delay', 'server.test', 'CmdOrCtrl+T')] },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  );
}

function installIpc(): void {
  ipcMain.handle(CH.chooseFile, async (e, defaultPath?: string) => {
    const owner = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const opts: Electron.OpenDialogOptions = {
      title: 'Choose the Xray executable',
      properties: ['openFile'],
      defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
      filters: process.platform === 'win32' ? [{ name: 'Xray', extensions: ['exe'] }] : [],
    };
    const r = owner ? await dialog.showOpenDialog(owner, opts) : await dialog.showOpenDialog(opts);
    return r.canceled ? null : (r.filePaths[0] ?? null);
  });
  ipcMain.on(CH.notify, (_e, title: unknown, body: unknown) => {
    // A toast already shows it inside a focused window.
    if (win?.isFocused() || !Notification.isSupported()) return;
    const n = new Notification({ title: String(title).slice(0, 200), body: String(body).slice(0, 500), icon: iconPath() });
    n.on('click', showWindow);
    n.show();
  });
  ipcMain.on(CH.setTheme, (_e, theme: unknown, colors: { bg?: unknown; fg?: unknown }) => {
    nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light';
    if (titleBarKind() !== 'overlay' || !win) return;
    const fallback = theme === 'dark' ? DARK : LIGHT;
    const color = /^#[0-9a-f]{3,8}$/i.test(String(colors?.bg)) ? String(colors.bg) : fallback.bg;
    const symbolColor = /^#[0-9a-f]{3,8}$/i.test(String(colors?.fg)) ? String(colors.fg) : fallback.fg;
    win.setTitleBarOverlay({ color, symbolColor });
    win.setBackgroundColor(color);
  });
  ipcMain.on(CH.setPreferences, (_e, p: Preferences) => {
    const next: Preferences = { minimizeToTray: !!p?.minimizeToTray, autoUpdate: p?.autoUpdate !== false, launchAtLogin: !!p?.launchAtLogin, language: p?.language === 'fa' ? 'fa' : 'en' };
    // Once per start as well: the entry holds the executable's path, which an update can change (Raylit.exe became
    // RayConnect.exe), and a stale entry would start nothing at sign-in.
    if (app.isPackaged && (next.launchAtLogin !== prefs.launchAtLogin || !loginItemSynced)) {
      app.setLoginItemSettings({ openAtLogin: next.launchAtLogin, args: ['--hidden'] });
      loginItemSynced = true;
    }
    const relabel = next.language !== prefs.language;
    prefs = next;
    updater?.configure(prefs.autoUpdate);
    if (relabel) updateTray();
  });
  ipcMain.on(CH.showMain, (_e, command: unknown) => {
    panel?.hide();
    if (typeof command === 'string' && /^[a-z]+\.[A-Za-z]+$/.test(command)) sendCommand(command);
    else showWindow();
  });
  ipcMain.on(CH.hidePanel, () => panel?.hide());
  ipcMain.on(CH.quitApp, quit);
  ipcMain.on(CH.setTrayState, (_e, s: TrayState) => {
    const status = s?.status === 'connected' || s?.status === 'connecting' ? s.status : 'disconnected';
    trayState = { status, server: String(s?.server ?? '').slice(0, 80), systemProxy: !!s?.systemProxy };
    updateTray();
  });
  ipcMain.handle(CH.updateGet, () => updater?.current ?? null);
  ipcMain.handle(CH.updateCheck, () => updater?.check() ?? null);
  ipcMain.handle(CH.updateInstall, () => {
    if (!updater) return false;
    // quitAndInstall quits the app: let the close handler know it is a real quit, not "hide to tray".
    quitting = true;
    const ok = updater.quitAndInstall();
    if (!ok) quitting = false;
    return ok;
  });
  ipcMain.on(CH.appVersion, (e) => {
    e.returnValue = app.getVersion();
  });
  ipcMain.on(CH.readClipboard, (e) => {
    e.returnValue = clipboard.readText();
  });
  ipcMain.on(CH.writeClipboard, (_e, text: unknown) => {
    if (typeof text === 'string' && text.length < 1_000_000) clipboard.writeText(text);
  });
}

function quit(): void {
  quitting = true;
  app.quit();
}

/** Smoke test (RAYCONNECT_SMOKE_SHOT=<file.png>): let the UI connect to the engine, capture the window, quit. */
function smokeShot(file: string): void {
  const delay = Number(process.env.RAYCONNECT_SMOKE_DELAY_MS) || 3000;
  // RAYCONNECT_SMOKE_TRAY_SHOT=<file.png>: also open the tray panel and capture it.
  const trayShot = process.env.RAYCONNECT_SMOKE_TRAY_SHOT;
  if (trayShot) {
    setTimeout(() => {
      try {
        if (!tray || !panel) throw new Error('no tray icon');
        panel.toggle(tray.getBounds());
        console.log(`smoke: tray panel opened at ${JSON.stringify(tray.getBounds())}`);
      } catch (e) {
        console.error('smoke: tray panel failed', e);
      }
    }, Math.max(0, delay - 2500));
  }
  setTimeout(async () => {
    try {
      writeFileSync(file, (await win!.webContents.capturePage()).toPNG());
      console.log(`smoke: wrote ${file}`);
      const panelWin = BrowserWindow.getAllWindows().find((w) => w !== win);
      if (trayShot && !panelWin) console.error('smoke: no tray panel window to capture');
      if (trayShot && panelWin) {
        // The panel hides when it loses focus (the main window takes it during a smoke run), and a hidden window
        // never finishes a capture: show it without focus, and give up after a few seconds rather than hang.
        if (!panelWin.isVisible()) panelWin.showInactive();
        await new Promise((r) => setTimeout(r, 500));
        const image = await Promise.race([panelWin.webContents.capturePage(), new Promise<null>((r) => setTimeout(() => r(null), 5000))]);
        if (image) {
          writeFileSync(trayShot, image.toPNG());
          console.log(`smoke: wrote ${trayShot}`);
        } else console.error('smoke: tray panel capture timed out');
      }
    } catch (e) {
      console.error('smoke: capture failed', e);
      process.exitCode = 1;
    }
    quit();
  }, delay);
}

app.on('before-quit', (e) => {
  quitting = true;
  if (!engine) return;
  // Let the engine disconnect (restoring the system proxy) and save before the app exits.
  e.preventDefault();
  engine = null;
  panel?.destroy();
  void stopEngine().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (!tray || !prefs.minimizeToTray) quit();
});

app.on('activate', showWindow);
