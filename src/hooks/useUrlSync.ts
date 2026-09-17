'use client';

/**
 * Mirrors selection + filters into the query string (PRD §5.1: a view can be
 * bookmarked). Hydrates once on mount, then replaceState (debounced) on change.
 */
import { useEffect, useRef } from 'react';
import { DEFAULT_FILTERS, useSelection, type Filters, type SelectedKind } from '@/stores/selection';
import { useGraph } from '@/lib/client/api';
import { selectEntity, selectEvent } from '@/lib/client/select';

const DEBOUNCE_MS = 300;

export function filtersToUrl(sp: URLSearchParams, f: Filters, sel: { kind: SelectedKind | null; id: string | null }) {
  const set = (k: string, v: string | null | undefined) => { if (v) sp.set(k, v); else sp.delete(k); };
  set('sel', sel.kind && sel.id ? `${sel.kind}:${sel.id}` : null);
  set('from', f.from);
  set('to', f.to);
  set('factions', f.factions.join(','));
  set('eventTypes', f.eventTypes.join(','));
  set('reportTypes', f.reportTypes.join(','));
  set('minConf', f.minConfidence > 0 ? String(f.minConfidence) : null);
}

export function urlToState(sp: URLSearchParams): { filters: Partial<Filters>; sel: { kind: SelectedKind; id: string } | null } {
  const csv = (k: string) => (sp.get(k) ?? '').split(',').filter(Boolean);
  const filters: Partial<Filters> = {};
  if (sp.get('from')) filters.from = sp.get('from');
  if (sp.get('to')) filters.to = sp.get('to');
  if (csv('factions').length) filters.factions = csv('factions');
  if (csv('eventTypes').length) filters.eventTypes = csv('eventTypes');
  if (csv('reportTypes').length) filters.reportTypes = csv('reportTypes');
  const mc = Number(sp.get('minConf'));
  if (mc > 0 && mc <= 1) filters.minConfidence = mc;
  const [kind, id] = (sp.get('sel') ?? '').split(':');
  const sel: { kind: SelectedKind; id: string } | null = (kind === 'entity' || kind === 'event') && id ? { kind, id } : null;
  return { filters, sel };
}

export function useUrlSync() {
  // A bookmarked entity is selected through the same helper as a click. The graph is
  // not cached yet at mount, so the neighbourhood is re-derived once it arrives.
  const pendingEntityRef = useRef<string | null>(null);
  const graph = useGraph();
  useEffect(() => {
    const id = pendingEntityRef.current;
    if (!graph.data || id === null) return;
    pendingEntityRef.current = null;
    const s = useSelection.getState();
    if (s.selectedKind === 'entity' && s.selectedId === id) selectEntity(id);
  }, [graph.data]);

  useEffect(() => {
    const store = useSelection.getState();
    const { filters, sel } = urlToState(new URLSearchParams(window.location.search));
    if (Object.keys(filters).length) store.setFilters({ ...DEFAULT_FILTERS, ...filters });
    if (sel?.kind === 'entity') { pendingEntityRef.current = sel.id; selectEntity(sel.id); }
    else if (sel) selectEvent({ id: sel.id, entityIds: [] });

    let t: number | undefined;
    const unsub = useSelection.subscribe((s, prev) => {
      if (s.filters === prev.filters && s.selectedId === prev.selectedId && s.selectedKind === prev.selectedKind) return;
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const url = new URL(window.location.href);
        filtersToUrl(url.searchParams, s.filters, { kind: s.selectedKind, id: s.selectedId });
        window.history.replaceState(window.history.state, '', url);
      }, DEBOUNCE_MS);
    });
    return () => { unsub(); window.clearTimeout(t); };
  }, []);
}
