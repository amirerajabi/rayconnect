// Preload (sandboxed): exposes `window.rayconnect`, the only bridge between the UI and Electron.
import { contextBridge, ipcRenderer } from 'electron';
import { ARG, CH, type Preferences, type TrayState } from '../shared/channels';

function arg(prefix: string): string {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : '';
}

const titleBar = arg(ARG.titleBar);

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: unknown, value: T) => cb(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('rayconnect', {
  engineUrl: arg(ARG.engine),
  token: arg(ARG.token),
  os: process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux',
  titleBar: titleBar === 'overlay' || titleBar === 'inset' ? titleBar : null,
  chooseFile: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke(CH.chooseFile, typeof defaultPath === 'string' ? defaultPath : undefined),
  notify: (title: string, body: string) => ipcRenderer.send(CH.notify, String(title), String(body)),
  setTheme: (theme: 'light' | 'dark', colors: { bg: string; fg: string }) => ipcRenderer.send(CH.setTheme, theme, { bg: String(colors.bg), fg: String(colors.fg) }),
  setPreferences: (p: Preferences) =>
    ipcRenderer.send(CH.setPreferences, { minimizeToTray: !!p.minimizeToTray, autoUpdate: p.autoUpdate !== false, launchAtLogin: !!p.launchAtLogin, language: p.language === 'fa' ? 'fa' : 'en' }),
  setTrayState: (s: TrayState) => ipcRenderer.send(CH.setTrayState, { status: String(s.status), server: String(s.server), systemProxy: !!s.systemProxy }),
  appVersion: ipcRenderer.sendSync(CH.appVersion) as string,
  getUpdateStatus: () => ipcRenderer.invoke(CH.updateGet),
  checkForUpdates: () => ipcRenderer.invoke(CH.updateCheck),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke(CH.updateInstall),
  onUpdateStatus: (cb: (status: unknown) => void) => subscribe<unknown>(CH.updateStatus, cb),
  readClipboard: (): string => ipcRenderer.sendSync(CH.readClipboard),
  writeClipboard: (text: string) => ipcRenderer.send(CH.writeClipboard, String(text)),
  onCommand: (cb: (command: string) => void) => subscribe<string>(CH.command, cb),
  showMainWindow: (command?: string) => ipcRenderer.send(CH.showMain, typeof command === 'string' ? command : ''),
  hideTrayPanel: () => ipcRenderer.send(CH.hidePanel),
  quitApp: () => ipcRenderer.send(CH.quitApp),
});
