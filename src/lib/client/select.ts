/**
 * The one way any view selects something. Selection and its steady highlight
 * layer always change together, so the map, chart, feed, and profile stay in
 * step no matter which of them the click landed in.
 *
 * Highlights come from the cached full graph (useGraph's cache entry): the
 * selected entity, its direct neighbours, and the edges between them. Before
 * the graph has loaded only the entity itself is marked.
 */
import { useSelection } from '@/stores/selection';
import { getCachedGraph } from '@/lib/client/api';
import type { Event, Graph } from '@/lib/types';

interface Adjacency { nodeIds: string[]; edgeIds: string[] }

// Memoised on the graph object's identity: TanStack hands back the same object until a refetch replaces it.
let adjGraph: Graph | undefined;
let adjMap = new Map<string, Adjacency>();

function adjacencyOf(id: string): Adjacency | undefined {
  const g = getCachedGraph();
  if (!g) return undefined;
  if (g !== adjGraph) {
    const m = new Map<string, Adjacency>();
    const at = (k: string) => { let v = m.get(k); if (!v) { v = { nodeIds: [], edgeIds: [] }; m.set(k, v); } return v; };
    for (const e of g.edges) {
      at(e.sourceEntityId).nodeIds.push(e.targetEntityId); at(e.sourceEntityId).edgeIds.push(e.id);
      at(e.targetEntityId).nodeIds.push(e.sourceEntityId); at(e.targetEntityId).edgeIds.push(e.id);
    }
    adjGraph = g;
    adjMap = m;
  }
  return adjMap.get(id);
}

export function selectEntity(id: string, extra: { entityIds?: string[]; edgeIds?: string[] } = {}): void {
  const s = useSelection.getState();
  const adj = adjacencyOf(id);
  s.select('entity', id);
  s.setHighlights({
    entityIds: [...new Set([id, ...(adj?.nodeIds ?? []), ...(extra.entityIds ?? [])])],
    eventIds: [],
    edgeIds: [...new Set([...(adj?.edgeIds ?? []), ...(extra.edgeIds ?? [])])],
  }, 'selection');
}

export function selectEvent(ev: Pick<Event, 'id' | 'entityIds'>): void {
  const s = useSelection.getState();
  s.select('event', ev.id);
  s.setHighlights({ eventIds: [ev.id], entityIds: ev.entityIds, edgeIds: [] }, 'selection');
}

export function clearSelectionEverywhere(): void {
  const s = useSelection.getState();
  s.clearSelection();
  s.clearHighlights('selection');
}
