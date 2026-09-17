'use client';

/** PRD §8 keyboard shortcuts. Ignored while typing in a field. */
import { useEffect } from 'react';
import { useSelection } from '@/stores/selection';
import { useUiStore } from '@/stores/ui';

function inField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}

function focusPane(id: string, pane: 'map' | 'graph') {
  const ui = useUiStore.getState();
  if (ui.maximized && ui.maximized !== pane) ui.setMaximized(null);
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: 'nearest' });
  el.focus({ preventScroll: true });
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (inField(e.target)) return; // fields (search, analyst) own their own Esc
        const s = useSelection.getState();
        if (s.openReportId) s.closeReport();
        else { s.clearSelection(); s.clearHighlights('selection'); }
        return;
      }
      if (inField(e.target)) return;
      switch (e.key) {
        case '/': e.preventDefault(); document.getElementById('global-search')?.focus(); break;
        case 'a': case 'A': useUiStore.getState().setRightTab('analyst'); break;
        case 'g': case 'G': focusPane('graph-canvas', 'graph'); break;
        case 'm': case 'M': focusPane('map-canvas-wrap', 'map'); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
