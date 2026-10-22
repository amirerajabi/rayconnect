import { create } from 'zustand';
import type { WsStatus } from '../api/ws';

export type DockPanel = 'groups' | 'quick';
export type DetailsTab = 'server' | 'log';
export type SettingsSection = 'general' | 'proxy' | 'routing' | 'core' | 'updates' | 'about';

export interface Toast {
  id: number;
  level: 'info' | 'success' | 'warning' | 'error';
  text: string;
  detail?: string;
}

export interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  /** Optional checkbox under the message. */
  checkbox?: string;
  resolve(result: { ok: boolean; checked: boolean }): void;
}

export const DOCK_MIN = 180;
export const DOCK_MAX = 420;

interface UiState {
  wsStatus: WsStatus;
  engineError: string | null;
  sidebarVisible: boolean;
  sidebarWidth: number;
  dock: DockPanel;
  detailsVisible: boolean;
  detailsHeight: number;
  detailsTab: DetailsTab;
  /** Add servers dialog, with the text to start from. */
  addServers: { text: string } | null;
  /** Subscription dialog: a new one (id null, maybe with a pasted URL) or the one being edited. */
  subscriptionFor: { id: string | null; url?: string } | null;
  editServer: string | null;
  settingsOpen: SettingsSection | null;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  confirm: ConfirmState | null;
  toasts: Toast[];
  setWsStatus(s: WsStatus): void;
  setEngineError(e: string | null): void;
  setLayout(p: Partial<Layout>): void;
  set(p: Partial<Pick<UiState, 'addServers' | 'subscriptionFor' | 'editServer' | 'settingsOpen' | 'paletteOpen' | 'shortcutsOpen'>>): void;
  askConfirm(c: Omit<ConfirmState, 'resolve'>): Promise<{ ok: boolean; checked: boolean }>;
  resolveConfirm(ok: boolean, checked?: boolean): void;
  toast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
}

const LAYOUT_KEY = 'raylit.layout';
type Layout = Pick<UiState, 'sidebarVisible' | 'sidebarWidth' | 'detailsVisible' | 'detailsHeight' | 'dock' | 'detailsTab'>;

function loadLayout(): Partial<Layout> {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') as Partial<Layout>;
  } catch {
    return {};
  }
}

let toastId = 0;

export const useUi = create<UiState>((set, get) => ({
  wsStatus: 'connecting',
  engineError: null,
  sidebarVisible: true,
  sidebarWidth: 0,
  dock: 'groups',
  detailsVisible: true,
  detailsHeight: 0,
  detailsTab: 'server',
  ...loadLayout(),
  addServers: null,
  subscriptionFor: null,
  editServer: null,
  settingsOpen: null,
  paletteOpen: false,
  shortcutsOpen: false,
  confirm: null,
  toasts: [],

  setWsStatus: (wsStatus) => set({ wsStatus }),
  setEngineError: (engineError) => set({ engineError }),
  setLayout(p) {
    set(p);
    const s = get();
    const layout: Layout = { sidebarVisible: s.sidebarVisible, sidebarWidth: s.sidebarWidth, detailsVisible: s.detailsVisible, detailsHeight: s.detailsHeight, dock: s.dock, detailsTab: s.detailsTab };
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      /* private mode */
    }
  },
  set: (p) => set(p),
  askConfirm(c) {
    get().confirm?.resolve({ ok: false, checked: false });
    return new Promise((resolve) => set({ confirm: { ...c, resolve } }));
  },
  resolveConfirm(ok, checked = false) {
    const c = get().confirm;
    set({ confirm: null });
    c?.resolve({ ok, checked });
  },
  toast(t) {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => get().dismissToast(id), t.level === 'error' ? 9000 : 5000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
