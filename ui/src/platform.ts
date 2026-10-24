import type { UpdateStatus } from '../../shared/protocol';

/** What the desktop shell acts on itself: the window, the tray and the login item. */
export interface Preferences {
  minimizeToTray: boolean;
  autoUpdate: boolean;
  launchAtLogin: boolean;
  language: 'en' | 'fa';
}

/** The tray icon and menu follow the connection. */
export interface TrayState {
  status: 'disconnected' | 'connecting' | 'connected';
  server: string;
  /** Proxy mode is "System proxy". */
  systemProxy: boolean;
}

/**
 * What the UI needs from its host. In Electron the preload script exposes `window.rayconnect`; in a plain browser
 * (npm run dev) the fallbacks below talk to the dev engine and skip the native bits.
 */
export interface DesktopBridge {
  engineUrl: string;
  token: string;
  os: 'win32' | 'darwin' | 'linux';
  /** How the window draws its caption buttons over our top bar. */
  titleBar: 'overlay' | 'inset' | null;
  /** Pick the Xray executable. */
  chooseFile(defaultPath?: string): Promise<string | null>;
  notify(title: string, body: string): void;
  setTheme(theme: 'light' | 'dark', colors: { bg: string; fg: string }): void;
  setPreferences(p: Preferences): void;
  setTrayState(s: TrayState): void;
  /** The desktop app's version ('' in a browser). */
  appVersion: string;
  /** null: no updater (browser build). */
  getUpdateStatus(): Promise<UpdateStatus | null>;
  checkForUpdates(): Promise<UpdateStatus | null>;
  /** Restart into a downloaded update; false when there is none. */
  installUpdate(): Promise<boolean>;
  onUpdateStatus(cb: (status: UpdateStatus) => void): () => void;
  onCommand(cb: (command: string) => void): () => void;
  readClipboard(): string;
  writeClipboard(text: string): void;
  /** From the tray panel: bring up the main window, optionally running a command there (e.g. "nav.servers"). */
  showMainWindow(command?: string): void;
  hideTrayPanel(): void;
  quitApp(): void;
}

declare global {
  interface Window {
    rayconnect?: DesktopBridge;
  }
}

export interface Platform extends DesktopBridge {
  kind: 'electron' | 'browser';
}

const noop = () => undefined;

function browserPlatform(): Platform {
  const env = import.meta.env;
  return {
    kind: 'browser',
    engineUrl: (env.VITE_ENGINE_URL as string | undefined) ?? 'http://127.0.0.1:7330',
    token: (env.VITE_ENGINE_TOKEN as string | undefined) ?? 'dev',
    os: /Mac/.test(navigator.platform) ? 'darwin' : /Win/.test(navigator.platform) ? 'win32' : 'linux',
    titleBar: null,
    chooseFile: async () => null,
    notify: (title, body) => {
      if (document.hasFocus() || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      new Notification(title, { body });
    },
    setTheme: noop,
    setPreferences: noop,
    setTrayState: noop,
    appVersion: '',
    getUpdateStatus: async () => null,
    checkForUpdates: async () => null,
    installUpdate: async () => false,
    onUpdateStatus: () => noop,
    onCommand: () => noop,
    readClipboard: () => '',
    writeClipboard: (text) => void navigator.clipboard?.writeText(text).catch(noop),
    // In a browser the tray panel is just the #tray page: "open the window" goes to the full UI.
    showMainWindow: () => {
      window.location.hash = '';
    },
    hideTrayPanel: noop,
    quitApp: noop,
  };
}

/** This renderer is the small panel that opens from the tray icon (the desktop loads the UI with #tray). */
export function isTrayPanel(): boolean {
  return window.location.hash === '#tray';
}

let current: Platform | null = null;

export function getPlatform(): Platform {
  if (!current) current = window.rayconnect ? { ...window.rayconnect, kind: 'electron' } : browserPlatform();
  return current;
}

/** Clipboard text: native in Electron, the async API (may prompt) in a browser. */
export async function readClipboardText(): Promise<string> {
  const p = getPlatform();
  if (p.kind === 'electron') return p.readClipboard();
  try {
    return await navigator.clipboard.readText();
  } catch {
    return '';
  }
}
