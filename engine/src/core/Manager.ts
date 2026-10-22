// The engine's state and everything that changes it: the server list and subscriptions, the connection (an Xray
// process plus, in System proxy mode, the OS proxy setting), delay tests, live traffic and the log. The HTTP server
// is a thin layer over this class; every change is broadcast as an EngineEvent.
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ConnectionState,
  CoreInfo,
  EngineEvent,
  ImportResult,
  LogLine,
  Server,
  ServerConfig,
  Settings,
  Subscription,
  Traffic,
} from '../../../shared/protocol';
import { MANUAL_GROUP } from '../../../shared/protocol';
import { buildLink, parseLink, parseLinks, type ParsedLink } from './links';
import { fetchUrl, freePort, portProblem, tcpPing } from './net';
import { defaultSettings, mergeSettings, TUNNEL_KEYS } from './settings';
import { fetchSubscription } from './subscription';
import { systemProxy, type ProxySnapshot, type SystemProxy } from './sysproxy';
import { CoreProcess, coreVersion, findCore, installCore } from './xray';
import { delayTestConfig, tunnelConfig } from './xrayConfig';
import { atomicWrite, errorMessage, newId, readJson } from './util';

const LOCALHOST = '127.0.0.1';
const MAX_LOG = 600;
const TEST_BATCH = 24;
const TEST_TIMEOUT_MS = 8000;

interface ServersFile {
  servers: Server[];
  subscriptions: Subscription[];
  selectedId: string | null;
}

interface RuntimeFile {
  /** The OS proxy as it was before we changed it; present while (or if a crash left) it pointing at us. */
  proxyBackup?: ProxySnapshot | null;
  proxyOwned?: boolean;
  /** The proxy address we set, to recognise it after a crash. */
  proxyPort?: number;
}

const EMPTY_TRAFFIC: Traffic = { up: 0, down: 0, totalUp: 0, totalDown: 0 };

/** Identity of a server's connection details, ignoring its name: finds the same server in a refreshed subscription. */
export function serverKey(c: ServerConfig): string {
  const keys: (keyof ServerConfig)[] = ['protocol', 'address', 'port', 'uuid', 'password', 'method', 'network', 'host', 'path', 'serviceName', 'tls', 'sni', 'publicKey', 'shortId', 'flow'];
  return keys.map((k) => String(c[k] ?? '')).join('|');
}

function configOf(s: Server): ServerConfig {
  const { id: _id, name: _name, groupId: _g, delay: _d, delayKind: _k, addedAt: _a, ...config } = s;
  return config;
}

export class Manager extends EventEmitter {
  private settings: Settings = defaultSettings();
  private servers: Server[] = [];
  private subscriptions: Subscription[] = [];
  private selectedId: string | null = null;
  private connection: ConnectionState = { status: 'disconnected', serverId: null, since: null, systemProxy: false, delay: null };
  private traffic: Traffic = { ...EMPTY_TRAFFIC };
  private core: CoreInfo = { path: null, version: null, installing: false };
  private logs: LogLine[] = [];
  private pendingLogs: LogLine[] = [];
  private logTimer: NodeJS.Timeout | null = null;
  private runtime: RuntimeFile = {};
  private tunnel = new CoreProcess();
  private metricsPort = 0;
  private trafficTimer: NodeJS.Timeout | null = null;
  private subTimer: NodeJS.Timeout | null = null;
  private lastCounters: { up: number; down: number; at: number } | null = null;
  /** Connect / disconnect run one at a time. */
  private op: Promise<unknown> = Promise.resolve();
  private saving: Promise<void> = Promise.resolve();
  private testing = false;
  private readonly files: { servers: string; settings: string; runtime: string; tunnel: string; test: string };

  readonly dataDir: string;

  constructor(dataDir: string, private readonly sys: SystemProxy = systemProxy()) {
    super();
    // Absolute: Xray runs in its own folder, so a relative config path would point nowhere.
    this.dataDir = path.resolve(dataDir);
    dataDir = this.dataDir;
    this.files = {
      servers: path.join(dataDir, 'servers.json'),
      settings: path.join(dataDir, 'settings.json'),
      runtime: path.join(dataDir, 'runtime.json'),
      tunnel: path.join(dataDir, 'run', 'tunnel.json'),
      test: path.join(dataDir, 'run', 'test.json'),
    };
  }

  // ---------------------------------------------------------------- lifecycle

  async load(): Promise<void> {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const saved = readJson<Partial<Settings>>(this.files.settings);
    if (saved) {
      try {
        this.settings = mergeSettings(defaultSettings(), saved);
      } catch {
        this.settings = defaultSettings();
      }
    }
    const data = readJson<Partial<ServersFile>>(this.files.servers);
    this.servers = Array.isArray(data?.servers) ? data.servers : [];
    this.subscriptions = Array.isArray(data?.subscriptions) ? data.subscriptions : [];
    this.selectedId = data?.selectedId && this.servers.some((s) => s.id === data.selectedId) ? data.selectedId : (this.servers[0]?.id ?? null);
    this.runtime = readJson<RuntimeFile>(this.files.runtime) ?? {};
    // The last run ended without disconnecting (crash, power loss): give the user their own proxy setting back.
    if (this.runtime.proxyOwned) {
      this.log('app', 'Restoring the system proxy left over from the last run');
      await this.restoreProxy(this.runtime.proxyPort ?? this.settings.httpPort);
    }
    await this.refreshCore();
    this.subTimer = setInterval(() => void this.autoUpdateSubscriptions(), 10 * 60_000);
    this.subTimer.unref();
    // Subscriptions that went stale while the app was closed refresh soon after it starts.
    setTimeout(() => void this.autoUpdateSubscriptions(), 30_000).unref();
  }

  async shutdown(): Promise<void> {
    if (this.subTimer) clearInterval(this.subTimer);
    await this.disconnect().catch(() => undefined);
    await this.saving;
  }

  state() {
    return {
      settings: this.settings,
      servers: this.servers,
      subscriptions: this.subscriptions,
      selectedId: this.selectedId,
      connection: this.connection,
      traffic: this.traffic,
      core: this.core,
      logs: this.logs,
      testing: this.testing,
    };
  }

  getSettings(): Settings {
    return this.settings;
  }

  private emitEvent(e: EngineEvent): void {
    this.emit('event', e);
  }

  private notify(level: 'info' | 'success' | 'warning' | 'error', text: string, detail?: string): void {
    this.emitEvent({ type: 'notify', level, text, detail });
  }

  // --------------------------------------------------------------------- logs

  log(level: LogLine['level'], text: string): void {
    this.pushLog({ t: Date.now(), level, text });
  }

  private pushLog(line: LogLine): void {
    this.logs.push(line);
    if (this.logs.length > MAX_LOG) this.logs.splice(0, this.logs.length - MAX_LOG);
    this.pendingLogs.push(line);
    // Batched: a busy core at debug level writes hundreds of lines a second.
    if (!this.logTimer) {
      this.logTimer = setTimeout(() => {
        this.logTimer = null;
        const lines = this.pendingLogs.splice(0);
        if (lines.length) this.emitEvent({ type: 'log', lines });
      }, 250);
    }
  }

  clearLogs(): void {
    this.logs = [];
  }

  // -------------------------------------------------------------- persistence

  private saveServers(): void {
    const data: ServersFile = { servers: this.servers, subscriptions: this.subscriptions, selectedId: this.selectedId };
    const json = JSON.stringify(data, null, 1);
    this.saving = this.saving.then(() => atomicWrite(this.files.servers, json)).catch((e) => this.log('error', `Could not save the server list: ${errorMessage(e)}`));
  }

  private saveRuntime(): void {
    const json = JSON.stringify(this.runtime);
    this.saving = this.saving.then(() => atomicWrite(this.files.runtime, json)).catch(() => undefined);
  }

  private emitServers(): void {
    this.emitEvent({ type: 'servers', servers: this.servers, selectedId: this.selectedId });
  }

  private emitSubscriptions(): void {
    this.emitEvent({ type: 'subscriptions', subscriptions: this.subscriptions });
  }

  private setConnection(patch: Partial<ConnectionState>): void {
    this.connection = { ...this.connection, ...patch };
    this.emitEvent({ type: 'connection', connection: this.connection });
  }

  // ------------------------------------------------------------------ settings

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const prev = this.settings;
    const next = mergeSettings(prev, patch);
    this.settings = next;
    const json = JSON.stringify(next, null, 1);
    this.saving = this.saving.then(() => atomicWrite(this.files.settings, json)).catch(() => undefined);
    this.emitEvent({ type: 'settings', settings: next });
    if (prev.corePath !== next.corePath) await this.refreshCore();
    const live = this.connection.status === 'connected';
    if (live && TUNNEL_KEYS.some((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]))) {
      this.log('app', 'Settings changed: reconnecting');
      void this.connect(this.connection.serverId ?? undefined).catch(() => undefined);
    } else if (live && (prev.proxyMode !== next.proxyMode || JSON.stringify(prev.bypass) !== JSON.stringify(next.bypass))) {
      await this.queue(async () => {
        if (next.proxyMode === 'system') await this.applyProxy();
        else await this.restoreProxy(next.httpPort);
      });
    }
    return next;
  }

  // ------------------------------------------------------------------- servers

  private toServer(p: ParsedLink, groupId: string): Server {
    return { ...p.config, id: newId(), name: p.name.slice(0, 200), groupId, delay: null, addedAt: Date.now() };
  }

  /** Add the share links found in `text` (one per line, or a base64 block) to the manual group. */
  importText(text: string): ImportResult {
    const { links, skipped } = parseLinks(text);
    const existing = new Set(this.servers.filter((s) => s.groupId === MANUAL_GROUP).map((s) => serverKey(s)));
    let added = 0;
    let duplicates = 0;
    for (const l of links) {
      const key = serverKey(l.config);
      if (existing.has(key)) {
        duplicates++;
        continue;
      }
      existing.add(key);
      this.servers.push(this.toServer(l, MANUAL_GROUP));
      added++;
    }
    if (added) {
      if (!this.selectedId) this.selectedId = this.servers.find((s) => s.groupId === MANUAL_GROUP)?.id ?? null;
      this.saveServers();
      this.emitServers();
    }
    return { added, duplicates, skipped };
  }

  getServer(id: string): Server | undefined {
    return this.servers.find((s) => s.id === id);
  }

  shareLink(id: string): string {
    const s = this.getServer(id);
    if (!s) throw new Error('No such server');
    return buildLink(s.name, configOf(s));
  }

  /** Rename a server, or replace its details with a new share link. */
  updateServer(id: string, patch: { name?: string; link?: string }): Server {
    const i = this.servers.findIndex((s) => s.id === id);
    if (i < 0) throw new Error('No such server');
    let s = this.servers[i];
    if (typeof patch.link === 'string' && patch.link.trim() && patch.link.trim() !== buildLink(s.name, configOf(s))) {
      const p = parseLink(patch.link);
      if (!p) throw new Error('That is not a share link Raylit understands');
      s = { ...p.config, id: s.id, name: s.name, groupId: s.groupId, delay: null, addedAt: s.addedAt };
    }
    if (typeof patch.name === 'string' && patch.name.trim()) s = { ...s, name: patch.name.trim().slice(0, 200) };
    this.servers[i] = s;
    this.saveServers();
    this.emitServers();
    if (this.connection.serverId === id && this.connection.status === 'connected') void this.connect(id).catch(() => undefined);
    return s;
  }

  async deleteServers(ids: string[]): Promise<void> {
    const gone = new Set(ids);
    if (this.connection.serverId && gone.has(this.connection.serverId)) await this.disconnect();
    this.servers = this.servers.filter((s) => !gone.has(s.id));
    if (this.selectedId && gone.has(this.selectedId)) this.selectedId = this.servers[0]?.id ?? null;
    this.saveServers();
    this.emitServers();
  }

  select(id: string): void {
    if (!this.getServer(id)) throw new Error('No such server');
    this.selectedId = id;
    this.saveServers();
    this.emitServers();
  }

  // ------------------------------------------------------------- subscriptions

  async addSubscription(name: string, url: string): Promise<Subscription> {
    if (!/^https?:\/\/\S+$/i.test(url.trim())) throw new Error('Enter an http(s) address');
    if (this.subscriptions.some((s) => s.url === url.trim())) throw new Error('This subscription is already in the list');
    const sub: Subscription = { id: newId(), name: name.trim().slice(0, 100), url: url.trim(), autoUpdateHours: 12, updatedAt: null };
    const fetched = await fetchSubscription(sub.url, this.proxyPortForUpdates());
    if (!sub.name) sub.name = fetched.title ?? new URL(sub.url).hostname;
    this.subscriptions.push(sub);
    this.applySubscription(sub, fetched.links, fetched.usage);
    return sub;
  }

  editSubscription(id: string, patch: Partial<Pick<Subscription, 'name' | 'url' | 'autoUpdateHours'>>): Subscription {
    const sub = this.subscriptions.find((s) => s.id === id);
    if (!sub) throw new Error('No such subscription');
    if (typeof patch.name === 'string' && patch.name.trim()) sub.name = patch.name.trim().slice(0, 100);
    if (typeof patch.url === 'string' && /^https?:\/\/\S+$/i.test(patch.url.trim())) sub.url = patch.url.trim();
    if (typeof patch.autoUpdateHours === 'number' && Number.isFinite(patch.autoUpdateHours)) sub.autoUpdateHours = Math.max(0, Math.min(168, Math.round(patch.autoUpdateHours)));
    this.saveServers();
    this.emitSubscriptions();
    return sub;
  }

  async deleteSubscription(id: string): Promise<void> {
    await this.deleteServers(this.servers.filter((s) => s.groupId === id).map((s) => s.id));
    this.subscriptions = this.subscriptions.filter((s) => s.id !== id);
    this.saveServers();
    this.emitSubscriptions();
  }

  /** While connected, subscriptions are fetched through the tunnel: the provider is often blocked otherwise. */
  private proxyPortForUpdates(): number | undefined {
    return this.connection.status === 'connected' ? this.settings.httpPort : undefined;
  }

  async updateSubscription(id: string): Promise<{ count: number }> {
    const sub = this.subscriptions.find((s) => s.id === id);
    if (!sub) throw new Error('No such subscription');
    try {
      const fetched = await fetchSubscription(sub.url, this.proxyPortForUpdates());
      sub.lastError = undefined;
      return { count: this.applySubscription(sub, fetched.links, fetched.usage) };
    } catch (e) {
      sub.lastError = errorMessage(e);
      this.saveServers();
      this.emitSubscriptions();
      throw e;
    }
  }

  /** Replace a subscription's servers, keeping ids (and so the selection and delays) of servers that stayed. */
  private applySubscription(sub: Subscription, links: ParsedLink[], usage: Subscription['usage']): number {
    const old = new Map(this.servers.filter((s) => s.groupId === sub.id).map((s) => [serverKey(s), s]));
    const fresh: Server[] = [];
    const seen = new Set<string>();
    for (const l of links) {
      const key = serverKey(l.config);
      if (seen.has(key)) continue;
      seen.add(key);
      const prev = old.get(key);
      fresh.push(prev ? { ...prev, ...l.config, name: l.name.slice(0, 200) } : this.toServer(l, sub.id));
    }
    // Keep the group where it was in the list.
    const first = this.servers.findIndex((s) => s.groupId === sub.id);
    const rest = this.servers.filter((s) => s.groupId !== sub.id);
    rest.splice(first < 0 ? rest.length : Math.min(first, rest.length), 0, ...fresh);
    this.servers = rest;
    if (!this.selectedId || !this.getServer(this.selectedId)) this.selectedId = fresh[0]?.id ?? this.servers[0]?.id ?? null;
    sub.updatedAt = Date.now();
    sub.usage = usage;
    this.saveServers();
    this.emitServers();
    this.emitSubscriptions();
    return fresh.length;
  }

  private async autoUpdateSubscriptions(): Promise<void> {
    for (const sub of this.subscriptions) {
      if (!sub.autoUpdateHours) continue;
      if (sub.updatedAt && Date.now() - sub.updatedAt < sub.autoUpdateHours * 3600_000) continue;
      try {
        const r = await this.updateSubscription(sub.id);
        this.log('app', `Subscription "${sub.name}" updated: ${r.count} servers`);
      } catch (e) {
        this.log('warning', `Subscription "${sub.name}" could not be updated: ${errorMessage(e)}`);
      }
    }
  }

  // ---------------------------------------------------------------------- core

  async refreshCore(): Promise<CoreInfo> {
    const p = findCore(this.dataDir, this.settings.corePath);
    const version = p ? await coreVersion(p) : null;
    this.core = { path: p, version, installing: false, error: p && !version ? 'This file does not look like Xray' : undefined };
    this.emitEvent({ type: 'core', core: this.core });
    return this.core;
  }

  async installCore(): Promise<CoreInfo> {
    if (this.core.installing) return this.core;
    this.core = { ...this.core, installing: true, progress: 0, error: undefined };
    this.emitEvent({ type: 'core', core: this.core });
    let last = -1;
    try {
      if (this.tunnel.running) throw new Error('Disconnect first: the core is in use');
      await installCore(path.join(this.dataDir, 'core'), (percent) => {
        if (percent === last) return;
        last = percent;
        this.core = { ...this.core, progress: percent };
        this.emitEvent({ type: 'core', core: this.core });
      });
      // A chosen path would hide the freshly installed copy.
      if (this.settings.corePath) await this.updateSettings({ corePath: '' });
      const info = await this.refreshCore();
      this.notify('success', 'Xray is installed', info.version ? `Version ${info.version}` : undefined);
      return info;
    } catch (e) {
      this.core = { ...this.core, installing: false, progress: undefined, error: errorMessage(e) };
      this.emitEvent({ type: 'core', core: this.core });
      throw new Error(`Could not download Xray: ${errorMessage(e)}`);
    }
  }

  // ---------------------------------------------------------------- connection

  private queue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.op.then(fn, fn);
    this.op = run.catch(() => undefined);
    return run;
  }

  connect(id?: string): Promise<ConnectionState> {
    return this.queue(() => this.doConnect(id ?? this.selectedId ?? undefined));
  }

  disconnect(): Promise<ConnectionState> {
    return this.queue(() => this.doDisconnect());
  }

  private async doConnect(id: string | undefined): Promise<ConnectionState> {
    const server = id ? this.getServer(id) : undefined;
    if (!server) throw new Error('Choose a server first');
    if (this.tunnel.running) await this.doDisconnect(true);
    this.selectedId = server.id;
    this.saveServers();
    this.emitServers();
    this.setConnection({ status: 'connecting', serverId: server.id, since: null, delay: null, error: undefined });
    this.log('app', `Connecting to ${server.name} (${server.protocol}, ${server.address}:${server.port})`);
    try {
      const core = this.core.path ? this.core : await this.refreshCore();
      if (!core.path) throw new Error('Xray is not installed yet. Download it from Settings → Core, or choose its file there.');
      const s = this.settings;
      const host = s.allowLan ? '0.0.0.0' : LOCALHOST;
      for (const p of [s.socksPort, s.httpPort]) {
        const problem = await portProblem(p, host);
        if (problem === 'reserved') throw new Error(`Windows has reserved port ${p}. Choose other ports in Settings → Proxy.`);
        if (problem) throw new Error(`Port ${p} is used by another program. Choose other ports in Settings → Proxy.`);
      }
      this.metricsPort = await freePort();
      await this.tunnel.start({
        corePath: core.path,
        configFile: this.files.tunnel,
        config: tunnelConfig(configOf(server), s, this.metricsPort),
        readyPort: s.httpPort,
        onLog: (l) => this.pushLog(l),
        onExit: (code, lastError) => void this.onCoreExit(code, lastError),
      });
      if (s.proxyMode === 'system') await this.applyProxy();
      this.traffic = { ...EMPTY_TRAFFIC };
      this.lastCounters = null;
      this.setConnection({ status: 'connected', since: Date.now() });
      this.log('app', `Connected. SOCKS ${host}:${s.socksPort}, HTTP ${host}:${s.httpPort}`);
      this.startTraffic();
      void this.measureTunnelDelay(server.id);
      return this.connection;
    } catch (e) {
      const message = errorMessage(e);
      this.log('error', message);
      await this.tunnel.stop();
      await this.restoreProxy(this.settings.httpPort);
      this.setConnection({ status: 'disconnected', since: null, systemProxy: false, error: message });
      throw new Error(message);
    }
  }

  private async doDisconnect(switching = false): Promise<ConnectionState> {
    if (!this.tunnel.running && this.connection.status === 'disconnected' && !this.connection.systemProxy) return this.connection;
    if (!switching) this.setConnection({ status: 'disconnecting' });
    this.stopTraffic();
    // The proxy first: with the core gone but the proxy still set, every app on the machine would lose the network.
    await this.restoreProxy(this.settings.httpPort);
    await this.tunnel.stop();
    if (!switching) {
      this.log('app', 'Disconnected');
      this.setConnection({ status: 'disconnected', since: null, systemProxy: false, delay: null, error: undefined });
    }
    return this.connection;
  }

  private async onCoreExit(code: number | null, lastError: string | undefined): Promise<void> {
    this.stopTraffic();
    await this.restoreProxy(this.settings.httpPort);
    const message = lastError ? `Xray stopped: ${lastError}` : `Xray stopped unexpectedly (code ${code})`;
    this.log('error', message);
    this.setConnection({ status: 'disconnected', since: null, systemProxy: false, error: message });
    this.notify('error', 'Disconnected', message);
  }

  private async applyProxy(): Promise<void> {
    const s = this.settings;
    if (!this.sys.available) {
      this.log('warning', this.sys.reason ?? 'The system proxy is not available');
      return;
    }
    try {
      // Keep the user's own setting, unless what is there now is already ours (left over from an earlier run).
      if (!this.runtime.proxyOwned) this.runtime.proxyBackup = await this.sys.read();
      this.runtime.proxyOwned = true;
      this.runtime.proxyPort = s.httpPort;
      this.saveRuntime();
      await this.sys.set(LOCALHOST, s.httpPort, s.socksPort, s.bypass);
      this.setConnection({ systemProxy: true });
      this.log('app', `System proxy set to ${LOCALHOST}:${s.httpPort}`);
    } catch (e) {
      this.log('error', `Could not set the system proxy: ${errorMessage(e)}`);
      this.notify('warning', 'Could not set the system proxy', `Apps can still use ${LOCALHOST}:${s.httpPort} (HTTP) or ${s.socksPort} (SOCKS).`);
    }
  }

  private async restoreProxy(port: number): Promise<void> {
    if (!this.runtime.proxyOwned) return;
    try {
      // Someone changed it since (another VPN app, the user): leave their setting alone.
      if (await this.sys.isOurs(LOCALHOST, this.runtime.proxyPort ?? port)) {
        await this.sys.restore(this.runtime.proxyBackup ?? null);
        this.log('app', 'System proxy restored');
      }
    } catch (e) {
      this.log('error', `Could not restore the system proxy: ${errorMessage(e)}`);
    }
    this.runtime = {};
    this.saveRuntime();
    if (this.connection.systemProxy) this.setConnection({ systemProxy: false });
  }

  // ------------------------------------------------------------------- traffic

  private startTraffic(): void {
    this.stopTraffic();
    this.trafficTimer = setInterval(() => void this.pollTraffic(), 1000);
  }

  private stopTraffic(): void {
    if (this.trafficTimer) clearInterval(this.trafficTimer);
    this.trafficTimer = null;
    if (this.traffic.up || this.traffic.down) {
      this.traffic = { ...this.traffic, up: 0, down: 0 };
      this.emitEvent({ type: 'traffic', traffic: this.traffic });
    }
  }

  /** Xray's metrics endpoint (expvar) carries the outbound byte counters. */
  private async pollTraffic(): Promise<void> {
    try {
      const res = await fetchUrl(`http://${LOCALHOST}:${this.metricsPort}/debug/vars`, { timeoutMs: 900, maxBytes: 4 * 1024 * 1024 });
      const vars = JSON.parse(res.body.toString('utf8')) as { stats?: { outbound?: Record<string, { uplink?: number; downlink?: number }> } };
      const proxy = vars.stats?.outbound?.proxy;
      const up = Number(proxy?.uplink) || 0;
      const down = Number(proxy?.downlink) || 0;
      const now = Date.now();
      const prev = this.lastCounters;
      this.lastCounters = { up, down, at: now };
      if (!prev) return;
      const secs = Math.max(0.2, (now - prev.at) / 1000);
      this.traffic = { up: Math.max(0, up - prev.up) / secs, down: Math.max(0, down - prev.down) / secs, totalUp: up, totalDown: down };
      this.emitEvent({ type: 'traffic', traffic: this.traffic });
    } catch {
      /* the core is restarting or busy; next tick */
    }
  }

  private async measureTunnelDelay(serverId: string): Promise<void> {
    let delay = -1;
    try {
      const r = await fetchUrl(this.settings.testUrl, { proxyPort: this.settings.httpPort, headOnly: true, timeoutMs: TEST_TIMEOUT_MS });
      if (r.status > 0 && r.status < 500) delay = r.ms;
    } catch {
      /* failed */
    }
    if (this.connection.serverId !== serverId || this.connection.status !== 'connected') return;
    this.setConnection({ delay });
    this.recordDelays([{ id: serverId, delay, kind: 'real' }]);
    if (delay < 0) this.log('warning', `The test address (${this.settings.testUrl}) is not reachable through this server`);
  }

  // --------------------------------------------------------------- delay tests

  private recordDelays(results: { id: string; delay: number; kind: 'real' | 'tcp' }[]): void {
    for (const r of results) {
      const s = this.getServer(r.id);
      if (s) {
        s.delay = r.delay;
        s.delayKind = r.kind;
      }
    }
    this.emitEvent({ type: 'delay', results });
  }

  /**
   * Measure the delay of `ids` (all servers when empty): through Xray when it is installed (a real request to the test
   * address, so a server that accepts TCP but does not work shows as failed), else a TCP connect to the server.
   */
  async testDelays(ids: string[]): Promise<void> {
    if (this.testing) return;
    const targets = (ids.length ? ids.map((id) => this.getServer(id)) : this.servers).filter((s): s is Server => !!s);
    if (!targets.length) return;
    this.testing = true;
    this.emitEvent({ type: 'testing', testing: true });
    try {
      const core = this.core.path;
      for (let i = 0; i < targets.length; i += TEST_BATCH) {
        const batch = targets.slice(i, i + TEST_BATCH);
        if (core) await this.realDelayBatch(core, batch);
        else this.recordDelays(await Promise.all(batch.map(async (s) => ({ id: s.id, delay: await tcpPing(s.address, s.port), kind: 'tcp' as const }))));
      }
      this.saveServers();
    } finally {
      this.testing = false;
      this.emitEvent({ type: 'testing', testing: false });
    }
  }

  private async realDelayBatch(corePath: string, batch: Server[]): Promise<void> {
    const ports: number[] = [];
    for (let i = 0; i < batch.length; i++) ports.push(await freePort());
    const proc = new CoreProcess();
    try {
      await proc.start({
        corePath,
        configFile: this.files.test,
        config: delayTestConfig(batch.map(configOf), ports),
        readyPort: ports[0],
        onLog: () => undefined,
        onExit: () => undefined,
      });
    } catch (e) {
      // One server Xray cannot load takes the whole config down: halve the batch until the bad one is alone.
      if (batch.length > 1) {
        const mid = Math.ceil(batch.length / 2);
        await this.realDelayBatch(corePath, batch.slice(0, mid));
        await this.realDelayBatch(corePath, batch.slice(mid));
      } else {
        this.log('warning', `${batch[0].name}: ${errorMessage(e)}`);
        this.recordDelays([{ id: batch[0].id, delay: -1, kind: 'real' }]);
      }
      return;
    }
    try {
      const results = await Promise.all(
        batch.map(async (s, i) => {
          try {
            const r = await fetchUrl(this.settings.testUrl, { proxyPort: ports[i], headOnly: true, timeoutMs: TEST_TIMEOUT_MS });
            return { id: s.id, delay: r.status > 0 && r.status < 500 ? r.ms : -1, kind: 'real' as const };
          } catch {
            return { id: s.id, delay: -1, kind: 'real' as const };
          }
        }),
      );
      this.recordDelays(results);
    } finally {
      await proc.stop();
    }
  }
}
