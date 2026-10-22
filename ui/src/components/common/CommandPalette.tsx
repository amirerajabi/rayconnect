import { CornerDownLeft, Search, Server as ServerIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { COMMANDS, connectTo, runCommand } from '../../app/commands';
import { delayText, protocolLabel } from '../../lib/format';
import { useServers } from '../../store/servers';
import { useUi } from '../../store/ui';
import { Kbd } from './visuals';

type Entry = { kind: 'command'; id: string; label: string; score: number } | { kind: 'server'; id: string; label: string; detail: string; score: number };

/** Subsequence match: every query character in order; earlier and contiguous hits score higher. */
function score(text: string, q: string): number {
  if (!q) return 1;
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct >= 0) return 100 - direct;
  let ti = 0;
  let s = 0;
  for (const ch of q) {
    const i = t.indexOf(ch, ti);
    if (i < 0) return 0;
    s += i === ti ? 3 : 1;
    ti = i + 1;
  }
  return s;
}

/** Ctrl+K: run any command, or pick a server by name to connect to it. Type ">" to list commands only. */
export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  if (!open) return null;
  return <Palette />;
}

function Palette() {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const servers = useServers((s) => s.servers);
  const listRef = useRef<HTMLDivElement>(null);
  const close = () => useUi.getState().set({ paletteOpen: false });

  const entries = useMemo<Entry[]>(() => {
    const commandsOnly = q.startsWith('>');
    const query = (commandsOnly ? q.slice(1) : q).trim().toLowerCase();
    const cmds: Entry[] = COMMANDS.filter((c) => c.palette !== false && !c.disabled?.())
      .map((c) => ({ kind: 'command' as const, id: c.id, label: c.label, score: score(c.label, query) }))
      .filter((e) => e.score > 0);
    if (commandsOnly) return cmds.sort((a, b) => b.score - a.score);
    const found: Entry[] = query
      ? servers
          .map((s) => ({ kind: 'server' as const, id: s.id, label: s.name, detail: `${protocolLabel(s.protocol)} · ${delayText(s.delay)}`, score: score(s.name, query) + 5 }))
          .filter((e) => e.score > 5)
          .sort((a, b) => b.score - a.score)
          .slice(0, 30)
      : [];
    return [...found, ...cmds.sort((a, b) => b.score - a.score)];
  }, [q, servers]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (e: Entry | undefined) => {
    if (!e) return;
    close();
    if (e.kind === 'command') setTimeout(() => runCommand(e.id), 0);
    else void connectTo(e.id);
  };

  return (
    <div className="overlay top" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <div className="palette-input-row">
          <Search size={16} className="muted" />
          <input
            className="palette-input"
            autoFocus
            value={q}
            placeholder="Type a server name to connect, or > for commands"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(entries.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(entries[active]);
              }
            }}
          />
        </div>
        <div ref={listRef} className="palette-list" role="listbox">
          {entries.length === 0 && <div className="palette-empty muted">Nothing matches.</div>}
          {entries.map((e, i) => {
            const c = e.kind === 'command' ? COMMANDS.find((x) => x.id === e.id) : null;
            return (
              <div key={`${e.kind}-${e.id}`} role="option" aria-selected={i === active} className={`palette-item${i === active ? ' active' : ''}`} onMouseMove={() => setActive(i)} onClick={() => choose(e)}>
                <span className="palette-icon">{e.kind === 'server' ? <ServerIcon size={16} /> : c?.icon ? <c.icon size={16} /> : null}</span>
                <span className="palette-label ellipsis">{e.label}</span>
                {e.kind === 'server' && <span className="palette-detail muted">{e.detail}</span>}
                {c?.shortcut && <Kbd shortcut={c.shortcut} />}
                {i === active && <CornerDownLeft size={14} className="muted" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
