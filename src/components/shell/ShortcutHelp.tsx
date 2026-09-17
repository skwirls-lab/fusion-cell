'use client';

/**
 * `?` overlay: every keyboard shortcut, rendered from the one table in
 * src/lib/client/shortcuts.ts. Modal while open; Escape, `?`, the close
 * button or a click on the backdrop dismiss it and focus returns to where it was.
 */
import { useEffect, useRef } from 'react';
import { useUiStore } from '@/stores/ui';
import { useEscapeLayer } from '@/hooks/useEscapeLayer';
import { ESCAPE_PRIORITY, SCOPE_LABEL, SHORTCUTS, type ShortcutScope } from '@/lib/client/shortcuts';

const SCOPE_ORDER: ShortcutScope[] = ['global', 'workspace', 'timeline', 'search', 'analyst', 'briefs'];

export function ShortcutHelp() {
  const open = useUiStore((s) => s.helpOpen);
  const setOpen = useUiStore((s) => s.setHelpOpen);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscapeLayer(open, () => setOpen(false), ESCAPE_PRIORITY.help);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [open]);
  // A page change unmounts the overlay; the flag must not survive it and reopen on the next page.
  useEffect(() => () => setOpen(false), [setOpen]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-4"
      data-testid="shortcut-help-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
        tabIndex={-1}
        data-testid="shortcut-help"
        className="panel flex max-h-full w-[520px] max-w-full flex-col overflow-hidden shadow-xl shadow-black/60 outline-none"
      >
        <header className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-panel-2 px-3">
          <h2 id="shortcut-help-title" className="font-mono text-[10px] font-semibold tracking-[0.18em] text-muted">KEYBOARD SHORTCUTS</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close shortcut list" className="rounded px-1.5 font-mono text-[11px] text-muted hover:bg-border hover:text-text">ESC ×</button>
        </header>
        <div className="min-h-0 overflow-y-auto px-3 py-2">
          {SCOPE_ORDER.map((scope) => {
            const rows = SHORTCUTS.filter((s) => s.scope === scope);
            if (!rows.length) return null;
            return (
              <section key={scope} className="pb-2" data-scope={scope}>
                <h3 className="pb-0.5 pt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">{SCOPE_LABEL[scope]}</h3>
                <dl>
                  {rows.map((s) => (
                    <div key={s.id} className="grid grid-cols-[84px_1fr] items-baseline gap-x-2 border-t border-border/60 py-1" data-testid="shortcut-row" data-shortcut={s.id}>
                      <dt><kbd className="rounded-sm border border-border bg-panel-2 px-1.5 py-px font-mono text-[11px] text-text">{s.label}</kbd></dt>
                      <dd className="text-[12px] text-text">{s.description}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
          <p className="border-t border-border/60 pt-1.5 text-[11px] text-muted">
            Single-key shortcuts stand down while you type in a field, and whenever Ctrl, ⌘ or Alt is held.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ShortcutHelp;
