import { create } from 'zustand';
import type { ConnectionState, LogLine, Traffic } from '../../../shared/protocol';

const HISTORY = 60;
const MAX_LOG = 600;

/** The live side: the connection, traffic (with a minute of history for the graph), the log and delay tests. */
interface ConnectionStore {
  connection: ConnectionState;
  traffic: Traffic;
  /** Last 60 samples of down/up bytes per second. */
  history: { down: number; up: number }[];
  logs: LogLine[];
  testing: boolean;
  setConnection(c: ConnectionState): void;
  setTraffic(t: Traffic): void;
  setLogs(lines: LogLine[]): void;
  addLogs(lines: LogLine[]): void;
  setTesting(t: boolean): void;
}

export const useConnection = create<ConnectionStore>((set, get) => ({
  connection: { status: 'disconnected', serverId: null, since: null, systemProxy: false, delay: null },
  traffic: { up: 0, down: 0, totalUp: 0, totalDown: 0 },
  history: [],
  logs: [],
  testing: false,
  setConnection(connection) {
    const wasUp = get().connection.status === 'connected';
    set({ connection, ...(connection.status === 'connected' && !wasUp ? { history: [] } : {}) });
  },
  setTraffic(traffic) {
    set({ traffic, history: [...get().history, { down: traffic.down, up: traffic.up }].slice(-HISTORY) });
  },
  setLogs: (logs) => set({ logs: logs.slice(-MAX_LOG) }),
  addLogs: (lines) => set({ logs: [...get().logs, ...lines].slice(-MAX_LOG) }),
  setTesting: (testing) => set({ testing }),
}));
