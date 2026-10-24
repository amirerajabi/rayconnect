import { create } from 'zustand';
import type { WsStatus } from '../api/ws';

export type Page = 'home' | 'servers' | 'subscriptions' | 'log' | 'settings';
export type SettingsSection = 'general' | 'proxy' | 'routing' | 'rules' | 'core' | 'updates' | 'about';

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

interface UiState {
  wsStatus: WsStatus;
  engineError: string | null;
  page: Page;
  settingsSection: SettingsSection;
  /** Add servers dialog, with the text to start from. */
  addServers: { text: string } | null;
  /** Subscription dialog: a new one (id null, maybe with a pasted URL) or the one being edited. */
  subscriptionFor: { id: string | null; url?: string } | null;
  editServer: string | null;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  confirm: ConfirmState | null;
  toasts: Toast[];
  setWsStatus(s: WsStatus): void;
  setEngineError(e: string | null): void;
  go(page: Page, section?: SettingsSection): void;
  set(p: Partial<Pick<UiState, 'addServers' | 'subscriptionFor' | 'editServer' | 'paletteOpen' | 'shortcutsOpen'>>): void;
  askConfirm(c: Omit<ConfirmState, 'resolve'>): Promise<{ ok: boolean; checked: boolean }>;
  resolveConfirm(ok: boolean, checked?: boolean): void;
  toast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
}

let toastId = 0;

export const useUi = create<UiState>((set, get) => ({
  wsStatus: 'connecting',
  engineError: null,
  page: 'home',
  settingsSection: 'general',
  addServers: null,
  subscriptionFor: null,
  editServer: null,
  paletteOpen: false,
  shortcutsOpen: false,
  confirm: null,
  toasts: [],

  setWsStatus: (wsStatus) => set({ wsStatus }),
  setEngineError: (engineError) => set({ engineError }),
  go: (page, section) => set(section ? { page, settingsSection: section } : { page }),
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
