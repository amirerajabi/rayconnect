// Share links: vmess:// (base64 JSON, the v2rayN format), vless:// and trojan:// (URI with query parameters) and
// ss:// (SIP002 and the older all-base64 form). Parsing is forgiving, because subscriptions in the wild are not tidy;
// building goes the other way so a server can be copied back out as a link.
import type { Network, ServerConfig, TlsMode } from '../../../shared/protocol';

export interface ParsedLink {
  name: string;
  config: ServerConfig;
}

const NETWORKS: Network[] = ['tcp', 'ws', 'grpc', 'http', 'httpupgrade', 'xhttp', 'kcp', 'quic'];

/** Base64 or base64url, with or without padding and line breaks. Returns null for anything else. */
export function decodeBase64(s: string): string | null {
  const t = s.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!t || !/^[A-Za-z0-9+/]*={0,2}$/.test(t)) return null;
  try {
    return Buffer.from(t, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function encodeBase64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}

function network(v: unknown): Network {
  const n = String(v ?? '').toLowerCase();
  if (n === 'h2') return 'http';
  if (n === 'splithttp') return 'xhttp';
  if (n === 'raw' || n === '') return 'tcp';
  return (NETWORKS as string[]).includes(n) ? (n as Network) : 'tcp';
}

function port(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('Invalid port');
  return n;
}

function list(v: string | null | undefined): string[] | undefined {
  const items = (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

function opt(v: string | null | undefined): string | undefined {
  const t = (v ?? '').trim();
  return t ? t : undefined;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** "[2001:db8::1]" -> "2001:db8::1" */
function host(h: string): string {
  return h.replace(/^\[|\]$/g, '');
}

function hostForUri(h: string): string {
  return h.includes(':') ? `[${h}]` : h;
}

export function parseLink(raw: string): ParsedLink | null {
  const line = raw.trim();
  const scheme = /^([a-z0-9]+):\/\//i.exec(line)?.[1]?.toLowerCase();
  try {
    if (scheme === 'vmess') return parseVmess(line);
    if (scheme === 'vless' || scheme === 'trojan') return parseUriLink(line, scheme);
    if (scheme === 'ss') return parseShadowsocks(line);
  } catch {
    return null;
  }
  return null;
}

function parseVmess(line: string): ParsedLink | null {
  const body = line.slice('vmess://'.length).split('#')[0];
  const json = decodeBase64(body);
  if (!json) return null;
  const j = JSON.parse(json) as Record<string, unknown>;
  const address = String(j.add ?? '').trim();
  if (!address) return null;
  const tls = String(j.tls ?? '').toLowerCase();
  const net = network(j.net);
  const config: ServerConfig = {
    protocol: 'vmess',
    address,
    port: port(j.port),
    uuid: String(j.id ?? ''),
    alterId: Number(j.aid) || 0,
    cipher: opt(String(j.scy ?? '')) ?? 'auto',
    network: net,
    headerType: opt(String(j.type ?? '')),
    host: opt(String(j.host ?? '')),
    path: opt(String(j.path ?? '')),
    tls: tls === 'tls' ? 'tls' : tls === 'reality' ? 'reality' : 'none',
    sni: opt(String(j.sni ?? '')),
    alpn: list(String(j.alpn ?? '')),
    fingerprint: opt(String(j.fp ?? '')),
    allowInsecure: j.allowInsecure === true || j.allowInsecure === '1' || j.allowInsecure === 1,
  };
  // v2rayN stores the grpc service name in "path" and the grpc mode in "type".
  if (net === 'grpc') {
    config.serviceName = config.path;
    config.mode = config.headerType === 'multi' ? 'multi' : 'gun';
    config.path = undefined;
    config.headerType = undefined;
  }
  if (!config.uuid) return null;
  return { name: String(j.ps ?? '').trim() || address, config };
}

function parseUriLink(line: string, scheme: 'vless' | 'trojan'): ParsedLink | null {
  const u = new URL(line);
  const address = host(u.hostname);
  const secret = safeDecode(u.username);
  if (!address || !secret) return null;
  const q = u.searchParams;
  const net = network(q.get('type'));
  const security = (q.get('security') ?? (scheme === 'trojan' ? 'tls' : 'none')).toLowerCase();
  const tls: TlsMode = security === 'reality' ? 'reality' : security === 'tls' || security === 'xtls' ? 'tls' : 'none';
  const config: ServerConfig = {
    protocol: scheme,
    address,
    port: port(u.port || (scheme === 'trojan' ? 443 : NaN)),
    network: net,
    headerType: opt(q.get('headerType')),
    host: opt(q.get('host')),
    path: opt(q.get('path')),
    serviceName: opt(q.get('serviceName')) ?? (net === 'kcp' ? opt(q.get('seed')) : net === 'quic' ? opt(q.get('key')) : undefined),
    mode: opt(q.get('mode')),
    tls,
    sni: opt(q.get('sni')) ?? opt(q.get('peer')),
    alpn: list(q.get('alpn')),
    fingerprint: opt(q.get('fp')),
    allowInsecure: q.get('allowInsecure') === '1' || q.get('allowInsecure') === 'true' || q.get('insecure') === '1',
    publicKey: opt(q.get('pbk')),
    shortId: opt(q.get('sid')),
    spiderX: opt(q.get('spx')),
  };
  if (scheme === 'vless') {
    config.uuid = secret;
    config.flow = opt(q.get('flow'));
    config.encryption = opt(q.get('encryption')) ?? 'none';
  } else {
    config.password = secret;
  }
  return { name: safeDecode(u.hash.slice(1)).trim() || address, config };
}

function parseShadowsocks(line: string): ParsedLink | null {
  let rest = line.slice('ss://'.length);
  let name = '';
  const hash = rest.indexOf('#');
  if (hash >= 0) {
    name = safeDecode(rest.slice(hash + 1)).trim();
    rest = rest.slice(0, hash);
  }
  rest = rest.split('?')[0].replace(/\/$/, '');
  let userinfo: string;
  let hostPort: string;
  const at = rest.lastIndexOf('@');
  if (at >= 0) {
    // SIP002: ss://base64(method:password)@host:port, or a plain (URL-encoded) method:password.
    const user = rest.slice(0, at);
    userinfo = decodeBase64(safeDecode(user)) ?? safeDecode(user);
    if (!userinfo.includes(':')) userinfo = safeDecode(user);
    hostPort = rest.slice(at + 1);
  } else {
    // Legacy: ss://base64(method:password@host:port)
    const decoded = decodeBase64(rest);
    if (!decoded) return null;
    const i = decoded.lastIndexOf('@');
    if (i < 0) return null;
    userinfo = decoded.slice(0, i);
    hostPort = decoded.slice(i + 1);
  }
  const colon = userinfo.indexOf(':');
  if (colon < 0) return null;
  const m = /^\[?([^\]]+?)\]?:(\d+)$/.exec(hostPort);
  if (!m) return null;
  const config: ServerConfig = {
    protocol: 'shadowsocks',
    address: m[1],
    port: port(m[2]),
    method: userinfo.slice(0, colon),
    password: userinfo.slice(colon + 1),
    network: 'tcp',
    tls: 'none',
  };
  return { name: name || config.address, config };
}

/** Every share link in a block of text (one per line, or a base64 subscription body). */
export function parseLinks(text: string): { links: ParsedLink[]; skipped: number } {
  let body = text.trim();
  if (!/:\/\//.test(body)) {
    const decoded = decodeBase64(body);
    if (decoded && /:\/\//.test(decoded)) body = decoded;
  }
  const links: ParsedLink[] = [];
  let skipped = 0;
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const p = parseLink(t);
    if (p) links.push(p);
    else skipped++;
  }
  return { links, skipped };
}

/** The share link for a server, in the same formats parseLink reads. */
export function buildLink(name: string, c: ServerConfig): string {
  if (c.protocol === 'vmess') {
    const grpc = c.network === 'grpc';
    const j = {
      v: '2',
      ps: name,
      add: c.address,
      port: String(c.port),
      id: c.uuid ?? '',
      aid: String(c.alterId ?? 0),
      scy: c.cipher ?? 'auto',
      net: c.network,
      type: grpc ? (c.mode === 'multi' ? 'multi' : 'gun') : (c.headerType ?? 'none'),
      host: c.host ?? '',
      path: grpc ? (c.serviceName ?? '') : (c.path ?? ''),
      tls: c.tls === 'none' ? '' : c.tls,
      sni: c.sni ?? '',
      alpn: (c.alpn ?? []).join(','),
      fp: c.fingerprint ?? '',
    };
    return `vmess://${encodeBase64(JSON.stringify(j))}`;
  }
  if (c.protocol === 'shadowsocks') {
    const user = encodeBase64(`${c.method ?? ''}:${c.password ?? ''}`).replace(/=+$/, '');
    return `ss://${user}@${hostForUri(c.address)}:${c.port}#${encodeURIComponent(name)}`;
  }
  const q = new URLSearchParams();
  if (c.protocol === 'vless') {
    q.set('encryption', c.encryption ?? 'none');
    if (c.flow) q.set('flow', c.flow);
  }
  q.set('type', c.network);
  q.set('security', c.tls);
  const add = (k: string, v: string | undefined) => v && q.set(k, v);
  add('headerType', c.headerType);
  add('host', c.host);
  add('path', c.path);
  if (c.network === 'grpc') add('serviceName', c.serviceName);
  else if (c.network === 'kcp') add('seed', c.serviceName);
  else if (c.network === 'quic') add('key', c.serviceName);
  add('mode', c.mode);
  add('sni', c.sni);
  add('alpn', c.alpn?.join(','));
  add('fp', c.fingerprint);
  add('pbk', c.publicKey);
  add('sid', c.shortId);
  add('spx', c.spiderX);
  if (c.allowInsecure) q.set('allowInsecure', '1');
  const secret = encodeURIComponent((c.protocol === 'vless' ? c.uuid : c.password) ?? '');
  return `${c.protocol}://${secret}@${hostForUri(c.address)}:${c.port}?${q.toString()}#${encodeURIComponent(name)}`;
}
