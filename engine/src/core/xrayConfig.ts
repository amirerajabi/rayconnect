// Turns a server and the settings into an Xray JSON config. Two shapes: the tunnel itself (SOCKS + HTTP inbounds,
// routing, DNS, traffic stats on a metrics endpoint) and the delay test (one HTTP inbound per server, each routed to
// that server's outbound, so one core process measures a whole batch).
import type { RoutingMode, RoutingRule, RuleOutbound, ServerConfig, Settings } from '../../../shared/protocol';
import { splitEntries } from '../../../shared/routing';

type Json = Record<string, unknown>;

export const TAG = { proxy: 'proxy', direct: 'direct', block: 'block', metricsIn: 'metrics_in', metricsOut: 'metrics_out' } as const;

function streamSettings(c: ServerConfig): Json {
  const s: Json = { network: c.network, security: c.tls };
  if (c.tls === 'tls') {
    s.tlsSettings = {
      serverName: c.sni || (c.host && !c.host.includes(',') ? c.host : c.address),
      ...(c.alpn?.length ? { alpn: c.alpn } : {}),
      ...(c.fingerprint ? { fingerprint: c.fingerprint } : {}),
      ...(c.allowInsecure ? { allowInsecure: true } : {}),
    };
  } else if (c.tls === 'reality') {
    s.realitySettings = {
      serverName: c.sni ?? '',
      fingerprint: c.fingerprint || 'chrome',
      publicKey: c.publicKey ?? '',
      shortId: c.shortId ?? '',
      spiderX: c.spiderX ?? '',
    };
  }
  const hosts = (c.host ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  switch (c.network) {
    case 'ws':
      s.wsSettings = { path: c.path || '/', ...(hosts[0] ? { host: hosts[0] } : {}) };
      break;
    case 'httpupgrade':
      s.httpupgradeSettings = { path: c.path || '/', ...(hosts[0] ? { host: hosts[0] } : {}) };
      break;
    case 'xhttp':
      s.xhttpSettings = { path: c.path || '/', ...(hosts[0] ? { host: hosts[0] } : {}), ...(c.mode ? { mode: c.mode } : {}) };
      break;
    case 'grpc':
      s.grpcSettings = { serviceName: c.serviceName ?? '', multiMode: c.mode === 'multi' };
      break;
    case 'http':
      s.httpSettings = { path: c.path || '/', ...(hosts.length ? { host: hosts } : {}) };
      break;
    case 'kcp':
      s.kcpSettings = { header: { type: c.headerType || 'none' }, ...(c.serviceName ? { seed: c.serviceName } : {}) };
      break;
    case 'quic':
      s.quicSettings = { security: 'none', key: c.serviceName ?? '', header: { type: c.headerType || 'none' } };
      break;
    default:
      if (c.headerType === 'http') {
        s.tcpSettings = {
          header: {
            type: 'http',
            request: { path: (c.path || '/').split(','), headers: hosts.length ? { Host: hosts } : {} },
          },
        };
      }
  }
  return s;
}

export function proxyOutbound(c: ServerConfig, tag: string = TAG.proxy, mux = false): Json {
  let settings: Json;
  switch (c.protocol) {
    case 'vmess':
      settings = { vnext: [{ address: c.address, port: c.port, users: [{ id: c.uuid, alterId: c.alterId ?? 0, security: c.cipher || 'auto' }] }] };
      break;
    case 'vless':
      settings = { vnext: [{ address: c.address, port: c.port, users: [{ id: c.uuid, encryption: c.encryption || 'none', ...(c.flow ? { flow: c.flow } : {}) }] }] };
      break;
    case 'trojan':
      settings = { servers: [{ address: c.address, port: c.port, password: c.password }] };
      break;
    case 'shadowsocks':
      settings = { servers: [{ address: c.address, port: c.port, method: c.method, password: c.password }] };
      break;
  }
  const out: Json = { tag, protocol: c.protocol, settings };
  if (c.protocol !== 'shadowsocks' || c.network !== 'tcp') out.streamSettings = streamSettings(c);
  // Mux does not work with XTLS Vision or XHTTP (which multiplexes on its own).
  if (mux && !c.flow && c.network !== 'xhttp') out.mux = { enabled: true, concurrency: 8 };
  return out;
}

/** Destinations that go straight out instead of through the server, per routing mode. */
function directRules(mode: RoutingMode): Json[] {
  switch (mode) {
    case 'iran-direct':
      return [
        { type: 'field', domain: ['domain:ir'], outboundTag: TAG.direct },
        { type: 'field', ip: ['geoip:ir'], outboundTag: TAG.direct },
      ];
    case 'china-direct':
      return [
        { type: 'field', domain: ['geosite:cn'], outboundTag: TAG.direct },
        { type: 'field', ip: ['geoip:cn'], outboundTag: TAG.direct },
      ];
    case 'russia-direct':
      return [
        { type: 'field', domain: ['domain:ru', 'domain:su', 'domain:xn--p1ai'], outboundTag: TAG.direct },
        { type: 'field', ip: ['geoip:ru'], outboundTag: TAG.direct },
      ];
    default:
      return [];
  }
}

const OUTBOUND_TAG: Record<RuleOutbound, string> = { proxy: TAG.proxy, direct: TAG.direct, block: TAG.block };

/**
 * The enabled user rules as Xray rules. Domains and IPs become separate Xray rules: fields within one Xray rule must
 * all match, so a rule with both would match nothing. Entries that cannot be read are left out.
 */
export function userRules(rules: RoutingRule[]): Json[] {
  const out: Json[] = [];
  for (const r of rules) {
    if (!r.enabled) continue;
    const { domains, ips } = splitEntries(r.entries);
    const outboundTag = OUTBOUND_TAG[r.outbound];
    if (domains.length) out.push({ type: 'field', domain: domains, outboundTag });
    if (ips.length) out.push({ type: 'field', ip: ips, outboundTag });
  }
  return out;
}

export function tunnelConfig(server: ServerConfig, s: Settings, metricsPort: number): Json {
  const listen = s.allowLan ? '0.0.0.0' : '127.0.0.1';
  const sniffing = s.sniffing ? { enabled: true, destOverride: ['http', 'tls', 'quic'], routeOnly: true } : { enabled: false };
  return {
    log: { loglevel: s.logLevel, access: s.logLevel === 'warning' ? 'none' : '' },
    dns: { servers: s.dns.length ? s.dns : ['1.1.1.1', '8.8.8.8'] },
    stats: {},
    metrics: { tag: TAG.metricsOut },
    policy: {
      levels: { '0': { statsUserUplink: false, statsUserDownlink: false } },
      system: { statsOutboundUplink: true, statsOutboundDownlink: true },
    },
    inbounds: [
      { tag: 'socks', listen, port: s.socksPort, protocol: 'socks', settings: { auth: 'noauth', udp: true }, sniffing },
      { tag: 'http', listen, port: s.httpPort, protocol: 'http', settings: {}, sniffing },
      { tag: TAG.metricsIn, listen: '127.0.0.1', port: metricsPort, protocol: 'dokodemo-door', settings: { address: '127.0.0.1' } },
    ],
    outbounds: [proxyOutbound(server, TAG.proxy, s.mux), { tag: TAG.direct, protocol: 'freedom', settings: {} }, { tag: TAG.block, protocol: 'blackhole', settings: {} }],
    routing: {
      domainStrategy: 'IPIfNonMatch',
      rules: [
        { type: 'field', inboundTag: [TAG.metricsIn], outboundTag: TAG.metricsOut },
        // The user's own rules first: they are the most specific, and the first rule that matches decides.
        ...userRules(s.rules),
        ...(s.blockAds ? [{ type: 'field', domain: ['geosite:category-ads-all'], outboundTag: TAG.block }] : []),
        { type: 'field', ip: ['geoip:private'], outboundTag: TAG.direct },
        { type: 'field', domain: ['localhost'], outboundTag: TAG.direct },
        ...directRules(s.routing),
        // Blacklist mode: whatever no rule sent through the server goes direct (without it, the first outbound,
        // the server, takes everything left).
        ...(s.defaultRoute === 'direct' ? [{ type: 'field', network: 'tcp,udp', outboundTag: TAG.direct }] : []),
      ],
    },
  };
}

/** One HTTP inbound per server (`ports[i]` for `servers[i]`), each routed to its own outbound. */
export function delayTestConfig(servers: ServerConfig[], ports: number[]): Json {
  return {
    log: { loglevel: 'warning', access: 'none' },
    inbounds: servers.map((_, i) => ({ tag: `in${i}`, listen: '127.0.0.1', port: ports[i], protocol: 'http', settings: {} })),
    outbounds: servers.map((c, i) => proxyOutbound(c, `out${i}`)),
    routing: { rules: servers.map((_, i) => ({ type: 'field', inboundTag: [`in${i}`], outboundTag: `out${i}` })) },
  };
}
