import { Search, X } from 'lucide-react';
import { getCommand } from '../../app/commands';
import { withShortcut } from '../../app/keys';
import { useServers } from '../../store/servers';
import { CommandButton } from '../common/CommandButton';

const GROUPS: string[][] = [
  ['server.paste', 'server.add', 'sub.updateAll'],
  ['server.test', 'server.sortDelay'],
  ['server.edit', 'server.copyLink', 'server.delete'],
];

const SHORT: Record<string, string> = {
  'server.paste': 'Paste',
  'server.add': 'Add',
  'sub.updateAll': 'Update',
  'server.test': 'Test',
  'server.sortDelay': 'Fastest',
  'server.edit': 'Edit',
  'server.copyLink': 'Share',
  'server.delete': 'Delete',
};

/** Big icon-over-label toolbar (Grabbit's), with the list's quick filter on the right. */
export function Toolbar() {
  const query = useServers((s) => s.query);
  const sort = useServers((s) => s.sort);
  const filterShortcut = getCommand('view.focusFilter')?.shortcut;
  return (
    <div className="toolbar" role="toolbar" aria-label="Servers">
      {GROUPS.map((g, i) => (
        <div key={i} className="tool-group">
          {g.map((id) => (
            <CommandButton key={id} command={id} label={SHORT[id]} className={id === 'server.sortDelay' && sort === 'delay' ? 'on' : ''} />
          ))}
        </div>
      ))}
      <div className="flex-1" />
      <div className="search-box" title={withShortcut('Filter servers', filterShortcut)}>
        <Search size={14} />
        <input
          id="list-filter"
          className="input borderless"
          placeholder="Filter by name or address"
          value={query}
          onChange={(e) => useServers.getState().setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              useServers.getState().setQuery('');
              (document.querySelector('.srv-list') as HTMLElement | null)?.focus();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              (document.querySelector('.srv-list') as HTMLElement | null)?.focus();
            }
          }}
        />
        {query && (
          <button className="icon-btn xs" aria-label="Clear filter" onClick={() => useServers.getState().setQuery('')}>
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
