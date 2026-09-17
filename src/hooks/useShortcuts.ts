'use client';

/**
 * Global keyboard shortcuts (PRD §8). The bindings, their scopes and the
 * typing/modifier guards all live in src/lib/client/shortcuts.ts; this hook
 * only maps a matched shortcut id to its action.
 *
 * `workspace` turns on the map / chart / analyst keys, which have nothing to
 * act on in the list pages.
 */
import { useEffect } from 'react';
import { useSelection } from '@/stores/selection';
import { useUiStore } from '@/stores/ui';
import { closeTopEscapeLayer, findShortcut, isTypingTarget, type ShortcutScope } from '@/lib/client/shortcuts';

function focusPane(id: string, pane: 'map' | 'graph') {
  const ui = useUiStore.getState();
  if (ui.maximized && ui.maximized !== pane) ui.setMaximized(null);
  // The other pane may be `display: none` until the restore above has rendered.
  window.requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
    el.focus({ preventScroll: true });
  });
}

/** One Escape does one thing: the topmost overlay, else leave the field, else clear the selection. */
function onEscape(target: EventTarget | null, workspace: boolean): boolean {
  if (closeTopEscapeLayer()) return true;
  if (isTypingTarget(target)) { (target as HTMLElement).blur(); return false; } // not "handled": a search input keeps its native Esc-clears-text
  if (!workspace) return false;
  const s = useSelection.getState();
  if (s.selectedId === null) return false;
  s.clearSelection();
  s.clearHighlights('selection');
  return true;
}

export function useShortcuts({ workspace = false }: { workspace?: boolean } = {}) {
  useEffect(() => {
    const scopes: ShortcutScope[] = workspace ? ['global', 'workspace'] : ['global'];
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // a focused widget already used this key
      const hit = findShortcut(e, e.target, scopes);
      if (!hit) return;
      const ui = useUiStore.getState();
      // The help overlay is modal: under it only Escape and `?` do anything.
      if (ui.helpOpen && hit.id !== 'escape' && hit.id !== 'help') return;
      switch (hit.id) {
        case 'escape':
          if (onEscape(e.target, workspace)) e.preventDefault();
          break;
        case 'help':
          e.preventDefault();
          ui.setHelpOpen(!ui.helpOpen);
          break;
        case 'focus-search':
          e.preventDefault(); // otherwise the `/` lands in the box (and Firefox opens quick find)
          document.getElementById('global-search')?.focus();
          break;
        case 'open-analyst':
          e.preventDefault(); // otherwise the `a` lands in the input focused below
          ui.setRightTab('analyst');
          window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="analyst-input"]')?.focus());
          break;
        case 'focus-graph': e.preventDefault(); focusPane('graph-canvas', 'graph'); break;
        case 'focus-map': e.preventDefault(); focusPane('map-canvas-wrap', 'map'); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workspace]);
}
