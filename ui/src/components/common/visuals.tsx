import type { Server } from '../../../../shared/protocol';
import { displayShortcut, shortcutParts } from '../../app/keys';
import { t } from '../../i18n';
import { delayText, delayTone, protocolLabel } from '../../lib/format';

/** The Raylit mark: a navy tile, a dial and a lit ray from its centre (same artwork as the app icon). */
export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <svg className="brand-mark-svg" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="bm-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--brand-mark-tile-top)" />
          <stop offset="1" stopColor="var(--brand-mark-tile-bottom)" />
        </linearGradient>
        <linearGradient id="bm-lit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand-mark-lit-start)" />
          <stop offset="1" stopColor="var(--brand-mark-lit-end)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="url(#bm-tile)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--brand-mark-row)" strokeWidth="2.4" />
      <path d="M16 16 L23.5 8.5" stroke="url(#bm-lit)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="16" r="3.2" fill="url(#bm-lit)" />
    </svg>
  );
}

export function Kbd({ shortcut }: { shortcut?: string }) {
  if (!shortcut) return null;
  return (
    // Key combinations read left to right in every language ("Ctrl K", not "K Ctrl").
    <span className="kbd-group" dir="ltr" aria-label={displayShortcut(shortcut)}>
      {shortcutParts(shortcut).map((k, i) => (
        <kbd key={i}>{k}</kbd>
      ))}
    </span>
  );
}

/** Delay in ms, coloured: green fast, amber slower, red timeout; a dot marks a TCP-only measurement. */
export function DelayBadge({ server, testing }: { server: Pick<Server, 'delay' | 'delayKind'>; testing?: boolean }) {
  if (testing && server.delay === null) return <span className="delay delay-none">…</span>;
  const tone = delayTone(server.delay);
  return (
    <span className={`delay delay-${tone}`} title={t(server.delayKind === 'tcp' ? 'TCP connect time (install Xray for a real test)' : server.delay !== null ? 'Real delay through the server' : 'Not tested yet')}>
      {delayText(server.delay, t)}
      {server.delayKind === 'tcp' && server.delay !== null && server.delay >= 0 ? ' ·' : ''}
    </span>
  );
}

export function ProtocolBadge({ protocol }: { protocol: Server['protocol'] }) {
  return <span className={`proto proto-${protocol}`}>{protocolLabel(protocol)}</span>;
}

/**
 * Two letters for the server's country, read from the flag that most providers put in server names (two regional
 * indicator symbols, e.g. "🇳🇱 Amsterdam" → NL); otherwise the name's first letter. Shown as text, not as a flag:
 * Windows has no flag emoji.
 */
export function countryCode(name: string): string {
  const flag = /([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/u.exec(name);
  if (flag) return String.fromCharCode(flag[1].codePointAt(0)! - 0x1f1e6 + 65, flag[2].codePointAt(0)! - 0x1f1e6 + 65);
  const first = name.replace(/[\u{1F000}-\u{1FFFF}\s\W_]+/gu, '').charAt(0);
  return first ? first.toUpperCase() : '?';
}

/** Server names without the flag, which the badge already shows. */
export function displayName(name: string): string {
  return name.replace(/[\u{1F1E6}-\u{1F1FF}]{2}\s*/gu, '').trim() || name;
}

export function CountryBadge({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span className={`country country-${size}`} aria-hidden="true">
      {countryCode(name)}
    </span>
  );
}
