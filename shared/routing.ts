/**
 * Reads routing-rule entries the way people type them, for the engine (Xray config) and the UI (live preview). Shared
 * code, unlike protocol.ts: both sides must agree on what an entry means.
 *
 *   example.com, *.example.com, https://example.com/page   that site and its subdomains   -> domain:example.com
 *   google                                                  any domain containing the word  -> keyword:google
 *   geosite:ir, domain:, full:, keyword:, regexp:, ext:     Xray's own syntax, kept as is
 *   1.2.3.4, 10.0.0.0/8, 2001:db8::/32, geoip:ir            addresses                       -> ip list
 *   # comment, empty line                                   ignored
 */
export type EntryKind = 'domain' | 'ip' | 'skip' | 'invalid';

export interface ParsedEntry {
  kind: EntryKind;
  /** What goes into Xray's rule. */
  value: string;
}

const DOMAIN_PREFIXES = ['geosite:', 'domain:', 'full:', 'keyword:', 'regexp:', 'ext:'];

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function isIp(s: string): boolean {
  const [addr, bits, extra] = s.split('/');
  if (extra !== undefined) return false;
  if (IPV4.test(addr)) return bits === undefined || (/^\d+$/.test(bits) && Number(bits) <= 32);
  // IPv6: hex groups and colons, at most one "::".
  if (/^[0-9a-f:]+$/i.test(addr) && addr.includes(':') && (addr.match(/::/g) ?? []).length <= 1 && addr.split(':').length <= 8) {
    return bits === undefined || (/^\d+$/.test(bits) && Number(bits) <= 128);
  }
  return false;
}

export function parseEntry(raw: string): ParsedEntry {
  let s = raw.trim();
  if (!s || s.startsWith('#') || s.startsWith('//')) return { kind: 'skip', value: '' };
  const lower = s.toLowerCase();
  if (lower.startsWith('geoip:')) return s.length > 6 ? { kind: 'ip', value: lower } : { kind: 'invalid', value: s };
  const prefix = DOMAIN_PREFIXES.find((p) => lower.startsWith(p));
  // regexp: keeps its case; the others are lower case like every domain.
  if (prefix) return s.length > prefix.length ? { kind: 'domain', value: prefix === 'regexp:' ? s : lower } : { kind: 'invalid', value: s };
  if (isIp(s)) return { kind: 'ip', value: s.toLowerCase() };
  // A pasted address: keep only its host.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    try {
      s = new URL(s).hostname;
    } catch {
      return { kind: 'invalid', value: raw.trim() };
    }
    if (isIp(s.replace(/^\[|\]$/g, ''))) return { kind: 'ip', value: s.replace(/^\[|\]$/g, '') };
  }
  const host = s.toLowerCase().replace(/^\*?\./, '').replace(/\.$/, '');
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) && !host.split('.').some((p) => !p || p.startsWith('-') || p.endsWith('-'))) {
    return { kind: 'domain', value: `domain:${host}` };
  }
  if (/^[a-z0-9-]+$/.test(host)) return { kind: 'domain', value: `keyword:${host}` };
  return { kind: 'invalid', value: raw.trim() };
}

/** The domain and IP lists of a rule's entries, and the entries that could not be read. */
export function splitEntries(entries: string[]): { domains: string[]; ips: string[]; invalid: string[] } {
  const domains = new Set<string>();
  const ips = new Set<string>();
  const invalid: string[] = [];
  for (const e of entries) {
    const p = parseEntry(e);
    if (p.kind === 'domain') domains.add(p.value);
    else if (p.kind === 'ip') ips.add(p.value);
    else if (p.kind === 'invalid') invalid.push(p.value);
  }
  return { domains: [...domains], ips: [...ips], invalid };
}
