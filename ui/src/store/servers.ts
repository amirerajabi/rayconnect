import { create } from 'zustand';
import type { Server, Subscription } from '../../../shared/protocol';
import { MANUAL_GROUP } from '../../../shared/protocol';

/** Which servers the list shows: all of them, or one group (Manual or a subscription). */
export type GroupFilter = { kind: 'all' } | { kind: 'group'; id: string };
export type SortKey = 'list' | 'name' | 'delay';

interface ServersState {
  servers: Server[];
  subscriptions: Subscription[];
  /** The server Connect uses (engine state). */
  selectedId: string | null;
  /** Rows highlighted in the list (multi-select for delete and test). */
  marked: string[];
  filter: GroupFilter;
  query: string;
  sort: SortKey;
  setServers(servers: Server[], selectedId: string | null): void;
  setSubscriptions(subs: Subscription[]): void;
  applyDelays(results: { id: string; delay: number; kind: 'real' | 'tcp' }[]): void;
  mark(ids: string[]): void;
  setFilter(f: GroupFilter): void;
  setQuery(q: string): void;
  setSort(s: SortKey): void;
}

export const useServers = create<ServersState>((set, get) => ({
  servers: [],
  subscriptions: [],
  selectedId: null,
  marked: [],
  filter: { kind: 'all' },
  query: '',
  sort: 'list',
  setServers(servers, selectedId) {
    const ids = new Set(servers.map((s) => s.id));
    const marked = get().marked.filter((id) => ids.has(id));
    set({ servers, selectedId, marked: marked.length ? marked : selectedId ? [selectedId] : [] });
  },
  setSubscriptions(subscriptions) {
    const f = get().filter;
    const gone = f.kind === 'group' && f.id !== MANUAL_GROUP && !subscriptions.some((s) => s.id === f.id);
    set({ subscriptions, ...(gone ? { filter: { kind: 'all' as const } } : {}) });
  },
  applyDelays(results) {
    const byId = new Map(results.map((r) => [r.id, r]));
    set({ servers: get().servers.map((s) => (byId.has(s.id) ? { ...s, delay: byId.get(s.id)!.delay, delayKind: byId.get(s.id)!.kind } : s)) });
  },
  mark: (marked) => set({ marked }),
  setFilter: (filter) => set({ filter, marked: [] }),
  setQuery: (query) => set({ query }),
  setSort: (sort) => set({ sort }),
}));

/** The rows the list shows, in order. */
export function visibleServers(s: Pick<ServersState, 'servers' | 'filter' | 'query' | 'sort'>): Server[] {
  const q = s.query.trim().toLowerCase();
  let list = s.servers.filter((x) => s.filter.kind === 'all' || x.groupId === s.filter.id);
  if (q) list = list.filter((x) => x.name.toLowerCase().includes(q) || x.address.toLowerCase().includes(q) || x.protocol.includes(q));
  if (s.sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  else if (s.sort === 'delay') {
    // Working servers fastest first, then failed ones, then untested.
    const rank = (d: number | null) => (d === null ? Number.MAX_SAFE_INTEGER : d < 0 ? Number.MAX_SAFE_INTEGER - 1 : d);
    list = [...list].sort((a, b) => rank(a.delay) - rank(b.delay));
  }
  return list;
}

export function groupName(groupId: string, subs: Subscription[]): string {
  if (groupId === MANUAL_GROUP) return 'Manual';
  return subs.find((s) => s.id === groupId)?.name ?? 'Subscription';
}
