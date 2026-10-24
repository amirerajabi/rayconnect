/** IPC channel names shared by main and preload. */
export const CH = {
  chooseFile: 'rayconnect:choose-file',
  notify: 'rayconnect:notify',
  setTheme: 'rayconnect:set-theme',
  setPreferences: 'rayconnect:set-preferences',
  setTrayState: 'rayconnect:set-tray-state',
  readClipboard: 'rayconnect:read-clipboard',
  writeClipboard: 'rayconnect:write-clipboard',
  command: 'rayconnect:command',
  updateStatus: 'rayconnect:update-status',
  updateGet: 'rayconnect:update-get',
  updateCheck: 'rayconnect:update-check',
  updateInstall: 'rayconnect:update-install',
  appVersion: 'rayconnect:app-version',
  showMain: 'rayconnect:show-main',
  hidePanel: 'rayconnect:hide-panel',
  quitApp: 'rayconnect:quit-app',
} as const;

/** additionalArguments passed to the renderer: --rayconnect-engine=<url> --rayconnect-token=<token> --rayconnect-titlebar=<kind> */
export const ARG = {
  engine: '--rayconnect-engine=',
  token: '--rayconnect-token=',
  titleBar: '--rayconnect-titlebar=',
} as const;

export interface Preferences {
  minimizeToTray: boolean;
  autoUpdate: boolean;
  launchAtLogin: boolean;
  /** The tray menu follows the UI language. */
  language: 'en' | 'fa';
}

export interface TrayState {
  status: 'disconnected' | 'connecting' | 'connected';
  server: string;
  /** Proxy mode is "System proxy". */
  systemProxy: boolean;
}
