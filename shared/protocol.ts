/**
 * Wire types shared by the engine, the UI and the desktop shell (types only, imported with `import type`).
 * The engine owns all state; the UI reads GET /api/state once and then follows the events on /ws.
 */

export type Protocol = 'vmess' | 'vless' | 'trojan' | 'shadowsocks';
export type Network = 'tcp' | 'ws' | 'grpc' | 'http' | 'httpupgrade' | 'xhttp' | 'kcp' | 'quic';
export type TlsMode = 'none' | 'tls' | 'reality';

/** Everything Xray needs to reach one server: what a share link (vmess://, vless://, …) describes. */
export interface ServerConfig {
  protocol: Protocol;
  address: string;
  port: number;
  /** vmess / vless user id. */
  uuid?: string;
  /** vmess: alterId (0 for AEAD) and cipher ("auto"). */
  alterId?: number;
  cipher?: string;
  /** vless: "xtls-rprx-vision" or empty; encryption is "none". */
  flow?: string;
  encryption?: string;
  /** trojan / shadowsocks password, shadowsocks method. */
  password?: string;
  method?: string;

  network: Network;
  /** tcp/kcp/quic header type ("none", "http", …). */
  headerType?: string;
  host?: string;
  path?: string;
  /** grpc service name, also kcp seed / quic key. */
  serviceName?: string;
  /** grpc "gun" | "multi", xhttp "auto" | "packet-up" | … */
  mode?: string;

  tls: TlsMode;
  sni?: string;
  alpn?: string[];
  fingerprint?: string;
  allowInsecure?: boolean;
  /** REALITY */
  publicKey?: string;
  shortId?: string;
  spiderX?: string;
}

export interface Server extends ServerConfig {
  id: string;
  name: string;
  /** 'manual' or a subscription id. */
  groupId: string;
  /** Last measured delay in ms, -1 for a failed test, null when never tested. */
  delay: number | null;
  /** How the last delay was measured: through the core ("real") or a plain TCP connect. */
  delayKind?: 'real' | 'tcp';
  addedAt: number;
}

export interface Subscription {
  id: string;
  name: string;
  url: string;
  /** Update automatically every `autoUpdateHours` (0 = only by hand). */
  autoUpdateHours: number;
  updatedAt: number | null;
  lastError?: string;
  /** From the subscription-userinfo header, when the provider sends one. */
  usage?: { upload: number; download: number; total: number; expire: number | null };
}

export const MANUAL_GROUP = 'manual';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';

export interface ConnectionState {
  status: ConnectionStatus;
  serverId: string | null;
  /** When the current connection came up (ms). */
  since: number | null;
  /** The OS proxy points at us right now. */
  systemProxy: boolean;
  /** Delay measured through the tunnel right after connecting (ms, -1 failed, null unknown). */
  delay: number | null;
  /** Why the last connect failed or the core stopped. */
  error?: string;
}

export interface Traffic {
  /** Bytes per second through the proxy outbound. */
  up: number;
  down: number;
  /** Bytes since connecting. */
  totalUp: number;
  totalDown: number;
}

export interface CoreInfo {
  /** The Xray executable in use, null when none was found. */
  path: string | null;
  version: string | null;
  /** Downloading Xray from GitHub. */
  installing: boolean;
  /** 0..100 while installing. */
  progress?: number;
  error?: string;
}

export type ProxyMode = 'system' | 'manual';
export type RoutingMode = 'global' | 'iran-direct' | 'china-direct' | 'russia-direct';
export type ThemePref = 'system' | 'light' | 'dark';
export type LogLevel = 'warning' | 'info' | 'debug';
export type Language = 'en' | 'fa';

export interface Settings {
  /** system: point the OS proxy at RayConnect while connected; manual: only open the local ports. */
  proxyMode: ProxyMode;
  socksPort: number;
  httpPort: number;
  /** Listen on 0.0.0.0 so other devices on the network can use the proxy. */
  allowLan: boolean;
  routing: RoutingMode;
  blockAds: boolean;
  /** DNS servers Xray resolves with (IP, DoH URL or "localhost"). */
  dns: string[];
  /** Hosts that skip the system proxy (Windows ProxyOverride syntax). */
  bypass: string[];
  /** URL fetched through the tunnel to measure real delay. */
  testUrl: string;
  sniffing: boolean;
  mux: boolean;
  logLevel: LogLevel;
  /** A user-chosen Xray executable; '' finds one automatically. */
  corePath: string;
  /** Connect to the last server when the app starts. */
  autoConnect: boolean;
  theme: ThemePref;
  /** UI language; Persian also turns the layout right-to-left. */
  language: Language;
  minimizeToTray: boolean;
  launchAtLogin: boolean;
  autoUpdate: boolean;
}

export interface LogLine {
  t: number;
  level: 'info' | 'warning' | 'error' | 'app';
  text: string;
}

export interface EngineState {
  version: string;
  settings: Settings;
  servers: Server[];
  subscriptions: Subscription[];
  /** The server Connect uses. */
  selectedId: string | null;
  connection: ConnectionState;
  traffic: Traffic;
  core: CoreInfo;
  logs: LogLine[];
  testing: boolean;
}

export type EngineEvent =
  | { type: 'servers'; servers: Server[]; selectedId: string | null }
  | { type: 'subscriptions'; subscriptions: Subscription[] }
  | { type: 'settings'; settings: Settings }
  | { type: 'connection'; connection: ConnectionState }
  | { type: 'traffic'; traffic: Traffic }
  | { type: 'core'; core: CoreInfo }
  | { type: 'log'; lines: LogLine[] }
  | { type: 'delay'; results: { id: string; delay: number; kind: 'real' | 'tcp' }[] }
  | { type: 'testing'; testing: boolean }
  | { type: 'notify'; level: 'info' | 'success' | 'warning' | 'error'; text: string; detail?: string };

export interface ImportResult {
  added: number;
  /** Already in the list. */
  duplicates: number;
  /** Lines that were not a share link we understand. */
  skipped: number;
}

/** In-app updates (desktop shell, electron-updater). */
export type UpdateMode = 'install' | 'notify' | 'disabled';
export type UpdateState = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error' | 'disabled';

export interface UpdateStatus {
  state: UpdateState;
  mode: UpdateMode;
  currentVersion: string;
  version?: string;
  percent?: number;
  releaseUrl?: string;
  message?: string;
}
