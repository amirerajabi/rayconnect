// Subscriptions: a URL that returns share links (plain lines or base64), the format every V2Ray panel speaks.
import type { Subscription } from '../../../shared/protocol';
import { fetchUrl } from './net';
import { parseLinks, type ParsedLink } from './links';

// Panels (Marzban, 3x-ui, …) pick the response format by user agent; this one gets plain share links.
const USER_AGENT = 'v2rayN/7.0 RayConnect';

export interface FetchedSubscription {
  links: ParsedLink[];
  skipped: number;
  usage?: Subscription['usage'];
  /** A name the provider suggests (profile-title header). */
  title?: string;
}

/** "upload=1; download=2; total=3; expire=1700000000" */
export function parseUserInfo(header: string | undefined): Subscription['usage'] {
  if (!header) return undefined;
  const v: Record<string, number> = {};
  for (const part of header.split(';')) {
    const [k, n] = part.split('=').map((x) => x.trim());
    if (k && n && Number.isFinite(Number(n))) v[k.toLowerCase()] = Number(n);
  }
  if (v.total === undefined && v.download === undefined) return undefined;
  return { upload: v.upload ?? 0, download: v.download ?? 0, total: v.total ?? 0, expire: v.expire ? v.expire * 1000 : null };
}

function title(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const h = header.trim();
  // "base64:..." is how some panels send non-ASCII names.
  if (h.startsWith('base64:')) return Buffer.from(h.slice(7), 'base64').toString('utf8').trim() || undefined;
  return h || undefined;
}

export async function fetchSubscription(url: string, proxyPort?: number): Promise<FetchedSubscription> {
  const res = await fetchUrl(url, { proxyPort, timeoutMs: 30_000, maxBytes: 10 * 1024 * 1024, headers: { 'User-Agent': USER_AGENT } });
  if (res.status !== 200) throw new Error(`The subscription server answered ${res.status}`);
  const { links, skipped } = parseLinks(res.body.toString('utf8'));
  if (links.length === 0) throw new Error('The subscription contains no servers RayConnect can use');
  const header = (name: string) => {
    const h = res.headers[name];
    return Array.isArray(h) ? h[0] : h;
  };
  return { links, skipped, usage: parseUserInfo(header('subscription-userinfo')), title: title(header('profile-title')) };
}
