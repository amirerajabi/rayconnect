/** IPC channel names shared by main and preload. */
export const CH = {
  chooseFile: 'raylit:choose-file',
  notify: 'raylit:notify',
  setTheme: 'raylit:set-theme',
  setPreferences: 'raylit:set-preferences',
  setTrayState: 'raylit:set-tray-state',
  readClipboard: 'raylit:read-clipboard',
  writeClipboard: 'raylit:write-clipboard',
  command: 'raylit:command',
  updateStatus: 'raylit:update-status',
  updateGet: 'raylit:update-get',
  updateCheck: 'raylit:update-check',
  updateInstall: 'raylit:update-install',
  appVersion: 'raylit:app-version',
} as const;

/** additionalArguments passed to the renderer: --raylit-engine=<url> --raylit-token=<token> --raylit-titlebar=<kind> */
export const ARG = {
  engine: '--raylit-engine=',
  token: '--raylit-token=',
  titleBar: '--raylit-titlebar=',
} as const;

export interface Preferences {
  minimizeToTray: boolean;
  autoUpdate: boolean;
  launchAtLogin: boolean;
}

export interface TrayState {
  status: 'disconnected' | 'connecting' | 'connected';
  server: string;
  /** Proxy mode is "System proxy". */
  systemProxy: boolean;
}
