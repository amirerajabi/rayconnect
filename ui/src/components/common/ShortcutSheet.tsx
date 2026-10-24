import { Keyboard } from 'lucide-react';
import { COMMANDS } from '../../app/commands';
import { useT } from '../../i18n';
import { useUi } from '../../store/ui';
import { Dialog } from './Dialog';
import { Kbd } from './visuals';

export function ShortcutSheet() {
  const t = useT();
  const open = useUi((s) => s.shortcutsOpen);
  if (!open) return null;
  const rows = COMMANDS.filter((c) => c.shortcut).map((c) => ({ label: t(c.label).replace('…', ''), shortcut: c.shortcut! }));
  return (
    <Dialog title={t('Keyboard shortcuts')} icon={<Keyboard size={18} className="text-accent" />} width={520} onClose={() => useUi.getState().set({ shortcutsOpen: false })}>
      <div className="shortcut-list">
        {rows.map((r) => (
          <div key={r.label} className="shortcut-row">
            <span>{r.label}</span>
            <Kbd shortcut={r.shortcut} />
          </div>
        ))}
      </div>
    </Dialog>
  );
}
