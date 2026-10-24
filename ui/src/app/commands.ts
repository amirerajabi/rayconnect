import {
  ArrowDownWideNarrow,
  ClipboardCopy,
  ClipboardPaste,
  Download,
  Gauge,
  House,
  Keyboard,
  Languages,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Rss,
  ScrollText,
  Search,
  Server as ServerIcon,
  Settings,
  Shield,
  SunMoon,
  Trash2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../api/client';
import { t } from '../i18n';
import { getPlatform, readClipboardText } from '../platform';
import { useConnection } from '../store/connection';
import { useEngine } from '../store/engine';
import { filterGroupId, useServers, visibleServers } from '../store/servers';
import { useUi, type Page } from '../store/ui';
import { useUpdates } from '../store/updates';
import { matches } from './keys';

export interface Command {
  id: string;
  /** English; shown through t(). */
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  /** Shown in the palette; false hides it there. */
  palette?: boolean;
  /** Why it is unavailable right now (English, shown through t()), or null when it can run. */
  disabled?: () => string | null;
  run: () => unknown;
}

/** Run an engine call and surface its error as a toast. */
export async function attempt<T>(fn: () => Promise<T>, failure = 'Action failed'): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    useUi.getState().toast({ level: 'error', text: t(failure), detail: e instanceof Error ? e.message : String(e) });
    return undefined;
  }
}

const noServers = () => (useServers.getState().servers.length === 0 ? 'Add a server first' : null);
const noSelection = () => (useServers.getState().selectedId ? null : 'Choose a server first');

export function isConnected(): boolean {
  return useConnection.getState().connection.status === 'connected';
}

export async function connectTo(id?: string): Promise<void> {
  await attempt(() => api.connect(id), 'Could not connect');
}

export async function connectFastest(groupId?: string): Promise<void> {
  useUi.getState().toast({ level: 'info', text: t('Testing servers to find the fastest…') });
  await attempt(() => api.connectFastest(groupId), 'Could not connect');
}

export async function toggleConnection(): Promise<void> {
  const status = useConnection.getState().connection.status;
  if (status === 'connected' || status === 'connecting') await attempt(() => api.disconnect(), 'Could not disconnect');
  else await connectTo();
}

/** Text that holds share links is imported; a lone http(s) address is offered as a subscription. */
export async function importText(text: string): Promise<boolean> {
  const s = text.trim();
  if (/^https?:\/\/\S+$/i.test(s)) {
    useUi.getState().set({ subscriptionFor: { id: null, url: s } });
    return true;
  }
  if (!s) return false;
  try {
    const r = await api.importLinks(s);
    if (r.added === 0 && r.duplicates === 0) return false;
    const extra = [r.duplicates ? t('{n} already in the list', { n: r.duplicates }) : '', r.skipped ? t('{n} not understood', { n: r.skipped }) : '']
      .filter(Boolean)
      .join(' · ');
    useUi.getState().toast({ level: r.added ? 'success' : 'info', text: r.added ? t('Added {n} servers', { n: r.added }) : t('Nothing new to add'), detail: extra || undefined });
    return true;
  } catch {
    return false;
  }
}

export async function pasteFromClipboard(): Promise<void> {
  const text = await readClipboardText();
  if (!(await importText(text))) useUi.getState().set({ addServers: { text: '' } });
}

export async function deleteServer(id: string): Promise<void> {
  const s = useServers.getState().servers.find((x) => x.id === id);
  if (!s) return;
  const r = await useUi.getState().askConfirm({
    title: t('Delete server'),
    message: t('Delete "{name}"?', { name: s.name }) + (s.groupId !== 'manual' ? ` ${t('Servers from a subscription come back when it updates.')}` : ''),
    confirmLabel: t('Delete'),
    danger: true,
  });
  if (r.ok) await attempt(() => api.deleteServers([id]), 'Could not delete');
}

export async function updateAllSubscriptions(): Promise<void> {
  let ok = 0;
  for (const s of useServers.getState().subscriptions) {
    try {
      await api.updateSubscription(s.id);
      ok++;
    } catch (e) {
      useUi.getState().toast({ level: 'error', text: t('Could not update "{name}"', { name: s.name }), detail: e instanceof Error ? e.message : String(e) });
    }
  }
  if (ok) useUi.getState().toast({ level: 'success', text: t('Subscriptions updated') });
}

export async function copyShareLink(id: string): Promise<void> {
  const r = await attempt(() => api.shareLink(id), 'Could not copy the link');
  if (!r) return;
  getPlatform().writeClipboard(r.link);
  useUi.getState().toast({ level: 'info', text: t('Share link copied') });
}

function toggleTheme(): void {
  const pref = useEngine.getState().settings?.theme ?? 'system';
  const next = pref === 'system' ? 'dark' : pref === 'dark' ? 'light' : 'system';
  void attempt(() => useEngine.getState().updateSettings({ theme: next }));
}

const nav = (page: Page) => () => useUi.getState().go(page);

export const COMMANDS: Command[] = [
  {
    id: 'conn.toggle',
    label: 'Connect / Disconnect',
    icon: Power,
    shortcut: 'Mod+Enter',
    // While connecting it stays enabled: it disconnects once the connect is done.
    disabled: () => (useConnection.getState().connection.status === 'disconnecting' ? 'Disconnecting…' : noServers()),
    run: toggleConnection,
  },
  {
    id: 'conn.fastest',
    label: 'Connect to the fastest server',
    icon: Zap,
    shortcut: 'Mod+Shift+Enter',
    disabled: () => (useConnection.getState().testing ? 'A test is running' : noServers()),
    run: () => connectFastest(filterGroupId(useServers.getState().filter)),
  },
  { id: 'server.paste', label: 'Import from clipboard', icon: ClipboardPaste, shortcut: 'Mod+V', run: pasteFromClipboard },
  { id: 'server.add', label: 'Add servers…', icon: Plus, shortcut: 'Mod+N', run: () => useUi.getState().set({ addServers: { text: '' } }) },
  { id: 'sub.add', label: 'Add subscription…', icon: Rss, shortcut: 'Mod+Shift+N', run: () => useUi.getState().set({ subscriptionFor: { id: null } }) },
  {
    id: 'sub.updateAll',
    label: 'Update subscriptions',
    icon: RefreshCw,
    shortcut: 'Mod+U',
    disabled: () => (useServers.getState().subscriptions.length ? null : 'No subscriptions yet'),
    run: updateAllSubscriptions,
  },
  {
    id: 'server.test',
    label: 'Test delay',
    icon: Gauge,
    shortcut: 'Mod+T',
    disabled: () => (useConnection.getState().testing ? 'A test is running' : noServers()),
    run: () => attempt(() => api.test(visibleServers(useServers.getState()).map((s) => s.id)), 'Could not start the test'),
  },
  {
    id: 'server.sortDelay',
    label: 'Sort by delay',
    icon: ArrowDownWideNarrow,
    disabled: noServers,
    run: () => useServers.getState().setSort(useServers.getState().sort === 'delay' ? 'list' : 'delay'),
  },
  { id: 'server.edit', label: 'Edit server…', icon: Pencil, disabled: noSelection, run: () => useUi.getState().set({ editServer: useServers.getState().selectedId }) },
  { id: 'server.copyLink', label: 'Copy share link', icon: ClipboardCopy, disabled: noSelection, run: () => copyShareLink(useServers.getState().selectedId!) },
  { id: 'server.delete', label: 'Delete server', icon: Trash2, disabled: noSelection, run: () => deleteServer(useServers.getState().selectedId!) },
  {
    id: 'proxy.toggle',
    label: 'Switch System proxy / Proxy only',
    icon: Shield,
    run: () => {
      const s = useEngine.getState().settings;
      if (s) void attempt(() => useEngine.getState().updateSettings({ proxyMode: s.proxyMode === 'system' ? 'manual' : 'system' }));
    },
  },
  {
    id: 'core.install',
    label: 'Download Xray core',
    icon: Download,
    disabled: () => (useEngine.getState().core.installing ? 'Downloading…' : isConnected() ? 'Disconnect first' : null),
    run: () => attempt(() => api.installCore(), 'Could not download Xray'),
  },
  { id: 'nav.home', label: 'Go to Connection', icon: House, shortcut: 'Mod+1', run: nav('home') },
  { id: 'nav.servers', label: 'Go to Servers', icon: ServerIcon, shortcut: 'Mod+2', run: nav('servers') },
  { id: 'nav.subscriptions', label: 'Go to Subscriptions', icon: Rss, shortcut: 'Mod+3', run: nav('subscriptions') },
  { id: 'nav.log', label: 'Go to Log', icon: ScrollText, shortcut: 'Mod+4', run: nav('log') },
  { id: 'nav.settings', label: 'Settings', icon: Settings, shortcut: 'Mod+,', run: nav('settings') },
  {
    id: 'view.focusFilter',
    label: 'Search servers',
    icon: Search,
    shortcut: 'Mod+F',
    run: () => {
      useUi.getState().go('servers');
      setTimeout(() => document.getElementById('server-search')?.focus(), 0);
    },
  },
  { id: 'view.palette', label: 'Command palette', icon: Search, shortcut: 'Mod+K', palette: false, run: () => useUi.getState().set({ paletteOpen: true }) },
  { id: 'view.toggleTheme', label: 'Switch theme (system / dark / light)', icon: SunMoon, run: toggleTheme },
  {
    id: 'view.language',
    label: 'Switch language (English / فارسی)',
    icon: Languages,
    run: () => {
      const lang = useEngine.getState().settings?.language === 'fa' ? 'en' : 'fa';
      void attempt(() => useEngine.getState().updateSettings({ language: lang }));
    },
  },
  {
    id: 'app.checkUpdates',
    label: 'Check for updates',
    icon: RefreshCw,
    disabled: () => (getPlatform().kind === 'electron' ? null : 'Updates are part of the desktop app'),
    run: () => {
      useUi.getState().go('settings', 'updates');
      return useUpdates.getState().check();
    },
  },
  { id: 'view.shortcuts', label: 'Keyboard shortcuts', icon: Keyboard, shortcut: 'Mod+/', run: () => useUi.getState().set({ shortcutsOpen: true }) },
];

const byId = new Map(COMMANDS.map((c) => [c.id, c]));

export function getCommand(id: string): Command | undefined {
  return byId.get(id);
}

export function runCommand(id: string): void {
  const c = byId.get(id);
  if (!c || c.disabled?.()) return;
  void c.run();
}

function modalOpen(): boolean {
  const u = useUi.getState();
  return !!(u.addServers || u.subscriptionFor || u.editServer || u.paletteOpen || u.shortcutsOpen || u.confirm);
}

/** Keys a text field needs for itself (paste). */
const NOT_WHILE_TYPING = new Set(['server.paste']);

export function installKeyboard(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '');
    for (const c of COMMANDS) {
      if (!c.shortcut || !matches(e, c.shortcut)) continue;
      if (NOT_WHILE_TYPING.has(c.id) && typing) continue;
      if (modalOpen() && c.id !== 'view.palette') continue;
      if (typing && !c.shortcut.includes('Mod')) continue;
      e.preventDefault();
      runCommand(c.id);
      return;
    }
  };
  window.addEventListener('keydown', onKey);
  const offMenu = getPlatform().onCommand((id) => runCommand(id));
  return () => {
    window.removeEventListener('keydown', onKey);
    offMenu();
  };
}
