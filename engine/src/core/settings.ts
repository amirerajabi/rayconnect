import type { LogLevel, RoutingMode, RoutingRule, RuleOutbound, Settings } from '../../../shared/protocol';
import { clamp, newId } from './util';

/** Hosts that never go through the system proxy: this machine and the private networks. */
export const DEFAULT_BYPASS = ['localhost', '127.*', '10.*', '172.16.*', '172.17.*', '172.18.*', '172.19.*', '172.2*', '172.30.*', '172.31.*', '192.168.*'];

const ROUTING: RoutingMode[] = ['global', 'iran-direct', 'china-direct', 'russia-direct'];
const LOG_LEVELS: LogLevel[] = ['warning', 'info', 'debug'];

export function defaultSettings(): Settings {
  return {
    proxyMode: 'system',
    // Not v2rayN's 10808/10809, so both can be installed side by side.
    socksPort: 10818,
    httpPort: 10819,
    allowLan: false,
    routing: 'global',
    rules: [],
    defaultRoute: 'proxy',
    blockAds: false,
    dns: ['1.1.1.1', '8.8.8.8'],
    bypass: DEFAULT_BYPASS,
    testUrl: 'https://www.gstatic.com/generate_204',
    sniffing: true,
    mux: false,
    logLevel: 'warning',
    corePath: '',
    autoConnect: false,
    theme: 'system',
    language: 'en',
    minimizeToTray: true,
    launchAtLogin: false,
    autoUpdate: true,
  };
}

function port(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), 1, 65535) : fallback;
}

function strings(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean))];
}

const OUTBOUNDS: RuleOutbound[] = ['proxy', 'direct', 'block'];
const MAX_RULES = 100;
const MAX_ENTRIES = 10_000;

/** Routing rules from the UI (or a hand-edited settings file), each field made valid; entries stay as typed. */
function rules(list: unknown[]): RoutingRule[] {
  const ids = new Set<string>();
  return list
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .slice(0, MAX_RULES)
    .map((r) => {
      let id = typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : newId();
      if (ids.has(id)) id = newId();
      ids.add(id);
      return {
        id,
        name: typeof r.name === 'string' ? r.name.trim().slice(0, 80) : '',
        enabled: r.enabled !== false,
        outbound: OUTBOUNDS.includes(r.outbound as RuleOutbound) ? (r.outbound as RuleOutbound) : 'proxy',
        entries: (strings(r.entries) ?? []).filter((e) => e.length <= 500).slice(0, MAX_ENTRIES),
      };
    });
}

/** Merge a partial update into the settings, coercing every field to a valid value. */
export function mergeSettings(base: Settings, patch: Partial<Settings>): Settings {
  const s: Settings = { ...base };
  const p = patch as Record<string, unknown>;
  if (p.proxyMode === 'system' || p.proxyMode === 'manual') s.proxyMode = p.proxyMode;
  s.socksPort = port(p.socksPort, s.socksPort);
  s.httpPort = port(p.httpPort, s.httpPort);
  if (s.socksPort === s.httpPort) throw new Error('The SOCKS and HTTP ports must differ');
  if (typeof p.allowLan === 'boolean') s.allowLan = p.allowLan;
  if (ROUTING.includes(p.routing as RoutingMode)) s.routing = p.routing as RoutingMode;
  if (Array.isArray(p.rules)) s.rules = rules(p.rules);
  if (p.defaultRoute === 'proxy' || p.defaultRoute === 'direct') s.defaultRoute = p.defaultRoute;
  if (typeof p.blockAds === 'boolean') s.blockAds = p.blockAds;
  const dns = strings(p.dns);
  if (dns && dns.length) s.dns = dns;
  const bypass = strings(p.bypass);
  if (bypass) s.bypass = bypass;
  if (typeof p.testUrl === 'string' && /^https?:\/\/\S+$/i.test(p.testUrl.trim())) s.testUrl = p.testUrl.trim();
  if (typeof p.sniffing === 'boolean') s.sniffing = p.sniffing;
  if (typeof p.mux === 'boolean') s.mux = p.mux;
  if (LOG_LEVELS.includes(p.logLevel as LogLevel)) s.logLevel = p.logLevel as LogLevel;
  if (typeof p.corePath === 'string') s.corePath = p.corePath.trim().replace(/^"|"$/g, '');
  if (typeof p.autoConnect === 'boolean') s.autoConnect = p.autoConnect;
  if (p.theme === 'system' || p.theme === 'light' || p.theme === 'dark') s.theme = p.theme;
  if (p.language === 'en' || p.language === 'fa') s.language = p.language;
  if (typeof p.minimizeToTray === 'boolean') s.minimizeToTray = p.minimizeToTray;
  if (typeof p.launchAtLogin === 'boolean') s.launchAtLogin = p.launchAtLogin;
  if (typeof p.autoUpdate === 'boolean') s.autoUpdate = p.autoUpdate;
  return s;
}

/** Settings that change the running tunnel: a change reconnects. */
export const TUNNEL_KEYS: (keyof Settings)[] = ['socksPort', 'httpPort', 'allowLan', 'routing', 'rules', 'defaultRoute', 'blockAds', 'dns', 'sniffing', 'mux', 'logLevel', 'corePath'];
