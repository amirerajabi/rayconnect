import type { Server } from '../../../../shared/protocol';
import { displayShortcut, shortcutParts } from '../../app/keys';
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
    <span className="kbd-group" aria-label={displayShortcut(shortcut)}>
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
    <span className={`delay delay-${tone}`} title={server.delayKind === 'tcp' ? 'TCP connect time (install Xray for a real test)' : server.delay !== null ? 'Real delay through the server' : 'Not tested yet'}>
      {delayText(server.delay)}
      {server.delayKind === 'tcp' && server.delay !== null && server.delay >= 0 ? ' ·' : ''}
    </span>
  );
}

export function ProtocolBadge({ protocol }: { protocol: Server['protocol'] }) {
  return <span className={`proto proto-${protocol}`}>{protocolLabel(protocol)}</span>;
}
