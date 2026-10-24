import { create } from 'zustand';
import type { UpdateStatus } from '../../../shared/protocol';
import { t } from '../i18n';
import { getPlatform } from '../platform';
import { useUi } from './ui';

interface UpdatesState {
  /** Latest status from the desktop app; null in a browser build. */
  status: UpdateStatus | null;
  /** A manual check is running: its outcome is announced (automatic checks stay quiet). */
  manual: boolean;
  setStatus(status: UpdateStatus | null): void;
  check(): Promise<void>;
  install(): Promise<void>;
}

export const useUpdates = create<UpdatesState>((set, get) => ({
  status: null,
  manual: false,
  setStatus(status) {
    const prev = get().status;
    set({ status });
    if (!status || prev?.state === status.state) return;
    const version = status.version ?? '';
    if (status.state === 'ready') {
      useUi.getState().toast({ level: 'success', text: t('Raylit {version} is ready', { version }), detail: t('Click “Restart to update” at the top, or it installs when you quit.') });
    } else if (status.state === 'available') {
      useUi.getState().toast({ level: 'info', text: t('Raylit {version} is available', { version }), detail: t('Click the update button at the top to download it.') });
    }
  },
  async check() {
    set({ manual: true });
    const s = await getPlatform().checkForUpdates();
    set({ manual: false });
    if (!s) return;
    get().setStatus(s);
    if (s.state === 'up-to-date') useUi.getState().toast({ level: 'success', text: t('Raylit is up to date'), detail: t('Version {version}', { version: s.currentVersion }) });
    else if (s.state === 'error') useUi.getState().toast({ level: 'error', text: t('Could not check for updates'), detail: s.message });
  },
  async install() {
    const s = get().status;
    if (s?.state === 'available' && s.releaseUrl) {
      window.open(s.releaseUrl, '_blank');
      return;
    }
    if (!(await getPlatform().installUpdate())) useUi.getState().toast({ level: 'warning', text: t('No update is ready to install yet') });
  },
}));

/** Label (English, with {version} / {percent} holes for t()) and tone of the update chip; null when there is nothing to show. */
export function updateChip(s: UpdateStatus | null): { text: string; tone: 'muted' | 'accent' | 'success' | 'error' } | null {
  if (!s) return null;
  switch (s.state) {
    case 'checking':
      return { text: 'Checking for updates…', tone: 'muted' };
    case 'downloading':
      return { text: 'Downloading {version} · {percent}%', tone: 'accent' };
    case 'ready':
      return { text: 'Restart to update to {version}', tone: 'success' };
    case 'available':
      return { text: 'Raylit {version} available', tone: 'accent' };
    case 'error':
      return { text: 'Update check failed', tone: 'error' };
    default:
      return null;
  }
}
