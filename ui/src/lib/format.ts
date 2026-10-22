import type { Server } from '../../../shared/protocol';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  let i = 0;
  let v = n;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : digits)} ${UNITS[i]}`;
}

export function formatSpeed(bps: number): string {
  if (!bps || bps < 1) return '0 B/s';
  return `${formatBytes(bps)}/s`;
}

/** "1:02:03" or "02:03" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatDate(ms: number | null | undefined): string {
  if (!ms) return 'never';
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `today ${time}` : `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`;
}

/** "in 12 days", "expired" */
export function formatExpiry(ms: number | null | undefined): string {
  if (!ms) return 'no expiry';
  const days = Math.ceil((ms - Date.now()) / 86_400_000);
  if (days < 0) return 'expired';
  if (days === 0) return 'expires today';
  return `${days} day${days === 1 ? '' : 's'} left`;
}

export function pluralize(n: number, word: string, plural = `${word}s`): string {
  return `${n} ${n === 1 ? word : plural}`;
}

const PROTOCOL_LABEL: Record<Server['protocol'], string> = { vmess: 'VMess', vless: 'VLESS', trojan: 'Trojan', shadowsocks: 'Shadowsocks' };

export function protocolLabel(p: Server['protocol']): string {
  return PROTOCOL_LABEL[p];
}

/** "WS · TLS", "TCP · REALITY" */
export function transportLabel(s: Pick<Server, 'network' | 'tls'>): string {
  const net = s.network === 'tcp' ? 'TCP' : s.network === 'ws' ? 'WS' : s.network === 'grpc' ? 'gRPC' : s.network === 'httpupgrade' ? 'HTTPUpgrade' : s.network.toUpperCase();
  return s.tls === 'none' ? net : `${net} · ${s.tls === 'reality' ? 'REALITY' : 'TLS'}`;
}

export type DelayTone = 'good' | 'ok' | 'slow' | 'fail' | 'none';

export function delayTone(delay: number | null | undefined): DelayTone {
  if (delay === null || delay === undefined) return 'none';
  if (delay < 0) return 'fail';
  if (delay < 300) return 'good';
  if (delay < 800) return 'ok';
  return 'slow';
}

export function delayText(delay: number | null | undefined): string {
  if (delay === null || delay === undefined) return '—';
  if (delay < 0) return 'Timeout';
  return `${delay} ms`;
}
