/** P4.1 gate: selection updates propagate through the shared store to any subscriber. */
import { describe, it, expect, beforeEach } from 'vitest';
import { useSelection, selectAllHighlighted, DEFAULT_FILTERS } from '@/stores/selection';
import { selectEntity, selectEvent, clearSelectionEverywhere } from '@/lib/client/select';
import { filtersToUrl, urlToState } from '@/hooks/useUrlSync';

beforeEach(() => {
  useSelection.setState({
    selectedKind: null, selectedId: null,
    selectionHighlights: { entityIds: [], eventIds: [], edgeIds: [] },
    aiHighlights: { entityIds: [], eventIds: [], edgeIds: [] },
    filters: DEFAULT_FILTERS, openReportId: null, analystPrefill: null,
  });
});

describe('selection store', () => {
  it('notifies subscribers when a view selects an entity', () => {
    const seen: (string | null)[] = [];
    const unsub = useSelection.subscribe((s) => seen.push(s.selectedId));
    selectEntity('per_ilsa_varro', { entityIds: ['loc_kestrel'], edgeIds: ['rel_1'] });
    unsub();
    expect(seen).toContain('per_ilsa_varro');
    const s = useSelection.getState();
    expect(s.selectedKind).toBe('entity');
    expect(s.selectionHighlights).toEqual({ entityIds: ['per_ilsa_varro', 'loc_kestrel'], eventIds: [], edgeIds: ['rel_1'] });
  });

  it('keeps AI highlights independent of selection highlights', () => {
    useSelection.getState().setHighlights({ entityIds: ['loc_tessaly_gate'], edgeIds: ['rel_9'] }, 'ai');
    selectEvent({ id: 'evt_1', entityIds: ['per_a'] });
    const all = selectAllHighlighted(useSelection.getState());
    expect(all.entityIds.sort()).toEqual(['loc_tessaly_gate', 'per_a']);
    expect(all.eventIds).toEqual(['evt_1']);
    expect(all.edgeIds).toEqual(['rel_9']);
    clearSelectionEverywhere();
    expect(useSelection.getState().selectedId).toBeNull();
    expect(useSelection.getState().aiHighlights.entityIds).toEqual(['loc_tessaly_gate']);
  });

  it('round-trips selection and filters through the URL', () => {
    const sp = new URLSearchParams();
    filtersToUrl(sp, { ...DEFAULT_FILTERS, factions: ['hegemony', 'cartel'], minConfidence: 0.5, from: '2026-08-02T00:00:00.000Z' }, { kind: 'entity', id: 'per_x' });
    const back = urlToState(sp);
    expect(back.sel).toEqual({ kind: 'entity', id: 'per_x' });
    expect(back.filters).toEqual({ factions: ['hegemony', 'cartel'], minConfidence: 0.5, from: '2026-08-02T00:00:00.000Z' });
    filtersToUrl(sp, DEFAULT_FILTERS, { kind: null, id: null });
    expect(sp.toString()).toBe('');
  });
});
