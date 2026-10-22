import {
  ArrowDownWideNarrow,
  ClipboardCopy,
  ClipboardPaste,
  Download,
  Gauge,
  Keyboard,
  Link2,
  PanelBottom,
  PanelLeft,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Rss,
  ScrollText,
  Search,
  Settings,
  Shield,
  SunMoon,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { Server } from '../../../shared/protocol';
import { api } from '../api/client';
import { pluralize } from '../lib/format';
import { getPlatform, readClipboardText } from '../platform';
import { useConnection } from '../store/connection';
import { useEngine } from '../store/engine';
import { useServers, visibleServers } from '../store/servers';
import { useUi } from '../store/ui';
import { useUpdates } from '../store/updates';
import { matches } from './keys';

export interface Command {
  id: string;
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  /** Shown in the palette; false hides it there. */
  palette?: boolean;
  /** Why it is unavailable right now, or null when it can run. */
  disabled?: () => string | null;
  run: () => unknown;
}

/** Run an engine call and surface its error as a toast. */
export async function attempt<T>(fn: () => Promise<T>, failure = 'Action failed'): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    useUi.getState().toast({ level: 'error', text: failure, detail: e instanceof Error ? e.message : String(e) });
    return undefined;
  }
}

export function markedServers(): Server[] {
  const { servers, marked } = useServers.getState();
  const set = new Set(marked);
  return servers.filter((s) => set.has(s.id));
}

const noServers = () => (useServers.getState().servers.length === 0 ? 'Add a server first' : null);
const noMarked = () => (useServers.getState().marked.length === 0 ? 'Select a server first' : null);

export function isConnected(): boolean {
  return useConnection.getState().connection.status === 'connected';
}

export async function connectTo(id?: string): Promise<void> {
  await attempt(() => api.connect(id), 'Could not connect');
}

export async function toggleConnection(): Promise<void> {
  const status = useConnection.getState().connection.status;
  if (status === 'connected' || status === 'connecting') await attempt(() => api.disconnect(), 'Could not disconnect');
  else await connectTo();
}

/** Text that holds share links is imported; a lone http(s) address is offered as a subscription. */
export async function importText(text: string): Promise<boolean> {
  const t = text.trim();
  if (/^https?:\/\/\S+$/i.test(t)) {
    useUi.getState().set({ subscriptionFor: { id: null, url: t } });
    return true;
  }
  if (!t) return false;
  try {
    const r = await api.importLinks(t);
    if (r.added === 0 && r.duplicates === 0) return false;
    const extra = [r.duplicates ? `${r.duplicates} already in the list` : '', r.skipped ? `${r.skipped} not understood` : ''].filter(Boolean).join(', ');
    useUi.getState().toast({ level: r.added ? 'success' : 'info', text: r.added ? `Added ${pluralize(r.added, 'server')}` : 'Nothing new to add', detail: extra || undefined });
    return true;
  } catch {
    return false;
  }
}

export async function pasteFromClipboard(): Promise<void> {
  const text = await readClipboardText();
  if (!(await importText(text))) useUi.getState().set({ addServers: { text: '' } });
}

export async function deleteServers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { servers } = useServers.getState();
  const name = ids.length === 1 ? `"${servers.find((s) => s.id === ids[0])?.name}"` : pluralize(ids.length, 'server');
  const fromSub = ids.some((id) => servers.find((s) => s.id === id)?.groupId !== 'manual');
  const r = await useUi.getState().askConfirm({
    title: ids.length === 1 ? 'Delete server' : 'Delete servers',
    message: `Delete ${name}?${fromSub ? ' Servers from a subscription come back when it updates.' : ''}`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (r.ok) await attempt(() => api.deleteServers(ids), 'Could not delete');
}

export async function updateAllSubscriptions(): Promise<void> {
  const subs = useServers.getState().subscriptions;
  let ok = 0;
  for (const s of subs) {
    try {
      await api.updateSubscription(s.id);
      ok++;
    } catch (e) {
      useUi.getState().toast({ level: 'error', text: `Could not update "${s.name}"`, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  if (ok) useUi.getState().toast({ level: 'success', text: ok === 1 ? 'Subscription updated' : `${ok} subscriptions updated` });
}

export async function copyShareLink(ids: string[]): Promise<void> {
  const links: string[] = [];
  for (const id of ids) {
    const r = await attempt(() => api.shareLink(id), 'Could not copy the link');
    if (r) links.push(r.link);
  }
  if (!links.length) return;
  getPlatform().writeClipboard(links.join('\n'));
  useUi.getState().toast({ level: 'info', text: links.length === 1 ? 'Share link copied' : `${links.length} share links copied` });
}

function toggleTheme(): void {
  const pref = useEngine.getState().settings?.theme ?? 'system';
  const next = pref === 'system' ? 'dark' : pref === 'dark' ? 'light' : 'system';
  void attempt(() => useEngine.getState().updateSettings({ theme: next }));
}

export const COMMANDS: Command[] = [
  {
    id: 'conn.toggle',
    label: 'Connect / Disconnect',
    icon: Power,
    shortcut: 'Mod+Enter',
    // While connecting it stays enabled: it cancels.
    disabled: () => (useConnection.getState().connection.status === 'disconnecting' ? 'Disconnecting…' : noServers()),
    run: toggleConnection,
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
    id: 'server.connect',
    label: 'Connect to this server',
    icon: Power,
    shortcut: 'Enter',
    disabled: () => noMarked(),
    run: () => connectTo(useServers.getState().marked[0]),
  },
  {
    id: 'server.test',
    label: 'Test delay',
    icon: Gauge,
    shortcut: 'Mod+T',
    disabled: () => (useConnection.getState().testing ? 'A test is running' : noServers()),
    run: () => {
      const { marked } = useServers.getState();
      // Several rows selected: test those; otherwise every server in view.
      const ids = marked.length > 1 ? marked : visibleServers(useServers.getState()).map((s) => s.id);
      return attempt(() => api.test(ids), 'Could not start the test');
    },
  },
  {
    id: 'server.sortDelay',
    label: 'Sort by delay',
    icon: ArrowDownWideNarrow,
    disabled: noServers,
    run: () => useServers.getState().setSort(useServers.getState().sort === 'delay' ? 'list' : 'delay'),
  },
  { id: 'server.edit', label: 'Edit server…', icon: Pencil, shortcut: 'Alt+Enter', disabled: noMarked, run: () => useUi.getState().set({ editServer: useServers.getState().marked[0] }) },
  { id: 'server.copyLink', label: 'Copy share link', icon: ClipboardCopy, shortcut: 'Mod+C', disabled: noMarked, run: () => copyShareLink(useServers.getState().marked) },
  { id: 'server.delete', label: 'Delete', icon: Trash2, shortcut: 'Delete', disabled: noMarked, run: () => deleteServers(useServers.getState().marked) },
  {
    id: 'server.selectAll',
    label: 'Select all',
    shortcut: 'Mod+A',
    palette: false,
    run: () => useServers.getState().mark(visibleServers(useServers.getState()).map((s) => s.id)),
  },
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
  { id: 'view.palette', label: 'Command palette', icon: Search, shortcut: 'Mod+K', palette: false, run: () => useUi.getState().set({ paletteOpen: true }) },
  { id: 'view.focusFilter', label: 'Filter servers', icon: Search, shortcut: 'Mod+F', run: () => document.getElementById('list-filter')?.focus() },
  { id: 'view.toggleSidebar', label: 'Toggle side panel', icon: PanelLeft, shortcut: 'Mod+B', run: () => useUi.getState().setLayout({ sidebarVisible: !useUi.getState().sidebarVisible }) },
  { id: 'view.toggleDetails', label: 'Toggle details pane', icon: PanelBottom, shortcut: 'Mod+J', run: () => useUi.getState().setLayout({ detailsVisible: !useUi.getState().detailsVisible }) },
  { id: 'view.logs', label: 'Show the log', icon: ScrollText, shortcut: 'Mod+L', run: () => useUi.getState().setLayout({ detailsVisible: true, detailsTab: 'log' }) },
  { id: 'view.toggleTheme', label: 'Switch theme (system / dark / light)', icon: SunMoon, run: toggleTheme },
  { id: 'view.settings', label: 'Settings…', icon: Settings, shortcut: 'Mod+,', run: () => useUi.getState().set({ settingsOpen: 'general' }) },
  { id: 'view.subscriptions', label: 'Subscriptions', icon: Link2, palette: false, run: () => useUi.getState().setLayout({ sidebarVisible: true, dock: 'groups' }) },
  {
    id: 'app.checkUpdates',
    label: 'Check for updates',
    icon: RefreshCw,
    disabled: () => (getPlatform().kind === 'electron' ? null : 'Updates are part of the desktop app'),
    run: () => {
      useUi.getState().set({ settingsOpen: 'updates' });
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
  return !!(u.addServers || u.subscriptionFor || u.editServer || u.settingsOpen || u.paletteOpen || u.shortcutsOpen || u.confirm);
}

/** Keys that act on the list only fire while focus is in the server list. */
const LIST_ONLY = new Set(['server.connect', 'server.delete', 'server.selectAll', 'server.edit', 'server.copyLink']);
/** Keys a text field needs for itself (paste). */
const NOT_WHILE_TYPING = new Set(['server.paste']);

export function installKeyboard(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const inList = !!(document.activeElement as HTMLElement | null)?.closest?.('.srv-list');
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '');
    for (const c of COMMANDS) {
      if (!c.shortcut || !matches(e, c.shortcut)) continue;
      if (LIST_ONLY.has(c.id) && (!inList || typing)) continue;
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
