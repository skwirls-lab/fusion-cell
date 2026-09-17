/**
 * Shared selection, highlight, and filter state. This is the contract that keeps
 * the map, link chart, feed, profile panel, and AI analyst in sync: every view
 * reads from here and writes here, never to each other.
 *
 * Highlights have a source so AI-driven highlights (pulsing) can be told apart
 * from selection-driven ones (steady), and so clearing one doesn't clear the other.
 */
import { create } from 'zustand';

export type SelectedKind = 'entity' | 'event';
export type HighlightSource = 'selection' | 'ai';

export interface Filters {
  from: string | null;        // ISO
  to: string | null;          // ISO
  factions: string[];         // faction ids; empty = all
  eventTypes: string[];       // empty = all
  reportTypes: string[];      // empty = all
  minConfidence: number;      // 0..1
}

export const DEFAULT_FILTERS: Filters = { from: null, to: null, factions: [], eventTypes: [], reportTypes: [], minConfidence: 0 };

export interface Highlights {
  entityIds: string[];
  eventIds: string[];
  edgeIds: string[];
}
const EMPTY: Highlights = { entityIds: [], eventIds: [], edgeIds: [] };

export interface SelectionState {
  // ---- selection --------------------------------------------------------------
  selectedKind: SelectedKind | null;
  selectedId: string | null;
  select: (kind: SelectedKind, id: string) => void;
  clearSelection: () => void;

  // ---- highlights (two independent layers) --------------------------------------
  selectionHighlights: Highlights;   // derived from the current selection (steady)
  aiHighlights: Highlights;          // set by the analyst's highlight_in_ui tool (pulsing)
  setHighlights: (h: Partial<Highlights>, source: HighlightSource) => void;
  clearHighlights: (source?: HighlightSource) => void;

  // ---- filters -----------------------------------------------------------------
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;

  // ---- report reader -----------------------------------------------------------
  openReportId: string | null;
  openReport: (reportNumber: string) => void;
  closeReport: () => void;

  // ---- analyst hand-off ---------------------------------------------------------
  analystPrefill: string | null;     // "Ask the analyst about this entity" sets this
  setAnalystPrefill: (text: string | null) => void;
}

export const useSelection = create<SelectionState>((set) => ({
  selectedKind: null,
  selectedId: null,
  select: (kind, id) => set({ selectedKind: kind, selectedId: id }),
  clearSelection: () => set({ selectedKind: null, selectedId: null, selectionHighlights: EMPTY }),

  selectionHighlights: EMPTY,
  aiHighlights: EMPTY,
  setHighlights: (h, source) => set((s) => {
    const key = source === 'ai' ? 'aiHighlights' : 'selectionHighlights';
    return { [key]: { ...s[key], ...h } } as Partial<SelectionState>;
  }),
  clearHighlights: (source) => set(source === 'ai' ? { aiHighlights: EMPTY } : source === 'selection' ? { selectionHighlights: EMPTY } : { aiHighlights: EMPTY, selectionHighlights: EMPTY }),

  filters: DEFAULT_FILTERS,
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),

  openReportId: null,
  openReport: (reportNumber) => set({ openReportId: reportNumber }),
  closeReport: () => set({ openReportId: null }),

  analystPrefill: null,
  setAnalystPrefill: (text) => set({ analystPrefill: text }),
}));

/** Union of both highlight layers, for views that don't care about the source. */
export function selectAllHighlighted(s: SelectionState): Highlights {
  return {
    entityIds: [...new Set([...s.selectionHighlights.entityIds, ...s.aiHighlights.entityIds])],
    eventIds: [...new Set([...s.selectionHighlights.eventIds, ...s.aiHighlights.eventIds])],
    edgeIds: [...new Set([...s.selectionHighlights.edgeIds, ...s.aiHighlights.edgeIds])],
  };
}

/** Filters → query-string params shared by the events and reports hooks. */
export function filtersToParams(f: Filters): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.from) p.from = f.from;
  if (f.to) p.to = f.to;
  if (f.factions.length) p.faction = f.factions.join(',');
  if (f.eventTypes.length) p.type = f.eventTypes.join(',');
  if (f.minConfidence > 0) p.minConfidence = String(f.minConfidence);
  return p;
}
