// The tray panel: a small frameless window that opens next to the tray icon (like the Wi-Fi or volume flyouts) and
// closes when it loses focus. It loads the same UI with #tray, which renders only the panel.
import { BrowserWindow, nativeTheme, screen, shell, type Rectangle } from 'electron';
import { ARG } from '../shared/channels';
import type { EngineInfo } from './engine-process';
import { uiIndex } from './paths';
import { DARK, LIGHT } from './window';

const WIDTH = 340;
const HEIGHT = 480;
const MARGIN = 8;

export class TrayPanel {
  private win: BrowserWindow | null = null;
  /** When the panel last hid because it lost focus: a click on the tray icon right after must not reopen it. */
  private hiddenAt = 0;

  constructor(private readonly engine: EngineInfo, private readonly preloadPath: string, private readonly devUrl?: string) {}

  /** Open next to the tray icon, or close when it is open. */
  toggle(trayBounds: Rectangle): void {
    if (this.win?.isVisible()) {
      this.hide();
      return;
    }
    if (Date.now() - this.hiddenAt < 300) return;
    const win = this.win ?? this.create();
    win.setBounds(this.place(trayBounds));
    win.show();
    win.focus();
  }

  hide(): void {
    if (this.win?.isVisible()) this.win.hide();
  }

  destroy(): void {
    this.win?.destroy();
    this.win = null;
  }

  private create(): BrowserWindow {
    const colors = nativeTheme.shouldUseDarkColors ? DARK : LIGHT;
    const win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: colors.bg,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        additionalArguments: [`${ARG.engine}${this.engine.url}`, `${ARG.token}${this.engine.token}`, `${ARG.titleBar}`],
      },
    });
    win.on('blur', () => {
      if (!win.isVisible()) return;
      this.hiddenAt = Date.now();
      win.hide();
    });
    win.on('closed', () => {
      if (this.win === win) this.win = null;
    });
    // Same lock as the main window: never navigate away; links open in the browser.
    win.webContents.on('will-navigate', (e, url) => {
      e.preventDefault();
      if (/^https?:/.test(url) && !url.startsWith(this.devUrl ?? '\u0000')) void shell.openExternal(url);
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    if (this.devUrl) void win.loadURL(`${this.devUrl}#tray`);
    else void win.loadFile(uiIndex(), { hash: 'tray' });
    this.win = win;
    return win;
  }

  /** Above the icon when the taskbar is at the bottom (Windows), below it when at the top (macOS menu bar, some Linux). */
  private place(icon: Rectangle): Rectangle {
    const known = icon.width > 0 && icon.height > 0;
    const display = known ? screen.getDisplayNearestPoint({ x: icon.x, y: icon.y }) : screen.getPrimaryDisplay();
    const area = display.workArea;
    if (!known) return { x: area.x + area.width - WIDTH - MARGIN, y: area.y + area.height - HEIGHT - MARGIN, width: WIDTH, height: HEIGHT };
    const x = Math.round(Math.min(Math.max(icon.x + icon.width / 2 - WIDTH / 2, area.x + MARGIN), area.x + area.width - WIDTH - MARGIN));
    const below = icon.y < area.y + area.height / 2;
    const y = below ? area.y + MARGIN : area.y + area.height - HEIGHT - MARGIN;
    return { x, y, width: WIDTH, height: HEIGHT };
  }
}
