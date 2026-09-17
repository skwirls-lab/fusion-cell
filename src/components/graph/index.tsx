'use client';

/**
 * Link chart (PRD §5.3). Cytoscape over the whole graph from /api/graph,
 * driven entirely by the shared selection store: taps write to it, and
 * every visual state (.selected / .highlighted / .ai-pulse / .dimmed) is
 * derived from it, so the chart never needs to know what the map did.
 *
 * Locations are hidden by default: every entity is `located_at` Kestrel, so
 * the hubs turn 116 evidence nodes into a hairball. A location still appears
 * when it is selected, highlighted, or revealed by a double-tap expansion.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Core, ElementDefinition, EventObject, NodeCollection, NodeSingular, StylesheetJson } from 'cytoscape';
import { useSelection, selectAllHighlighted } from '@/stores/selection';
import { fetchNeighbors, useFactions, useGraph } from '@/lib/client/api';
import { prefersReducedMotion, usePrefersReducedMotion } from '@/lib/client/motion';
import { clearSelectionEverywhere, selectEntity } from '@/lib/client/select';
import { EmptyState, ErrorState, Skeleton } from '@/lib/client/chips';
import type { Entity, Relationship } from '@/lib/types';

const SHAPE: Record<Entity['type'], string> = {
  person: 'ellipse', organization: 'round-rectangle', vessel: 'diamond', location: 'hexagon',
  account: 'rectangle', equipment: 'triangle', other: 'ellipse',
};
const SIZE: Record<Entity['type'], number> = {
  person: 20, organization: 24, vessel: 20, location: 26, account: 18, equipment: 18, other: 18,
};
const GREY = '#9ca3af';

const STYLE: StylesheetJson = [
  { selector: 'node', style: {
    width: 'data(size)', height: 'data(size)', shape: 'data(shape)' as 'ellipse',
    'background-color': 'data(color)', 'background-opacity': 0.9,
    label: 'data(label)', 'font-size': 9, 'font-family': 'ui-monospace, Menlo, Consolas, monospace',
    color: '#d6dde8', 'text-outline-color': '#070b14', 'text-outline-width': 2, 'min-zoomed-font-size': 8,
    'text-valign': 'bottom', 'text-margin-y': 3,
    'border-width': 1, 'border-color': '#1f2a3d', 'overlay-opacity': 0,
    'transition-property': 'border-width, border-color, opacity', 'transition-duration': 180,
  } },
  { selector: 'node[type = "location"]', style: { 'background-opacity': 0.55, 'border-color': '#3a4a63' } },
  { selector: 'edge', style: {
    width: 'data(width)', 'line-color': '#34445e', 'curve-style': 'bezier', opacity: 0.75, 'overlay-opacity': 0,
    'transition-property': 'line-color, width, opacity', 'transition-duration': 180,
  } },
  { selector: 'edge[type = "pays"]', style: { 'line-color': '#f59e0b' } },
  { selector: 'edge[type = "communicates_with"]', style: { 'line-style': 'dashed', 'line-dash-pattern': [5, 3] } },
  { selector: 'edge[type = "meets_with"]', style: { 'line-style': 'dotted' } },
  { selector: 'edge[type = "located_at"], edge[type = "travels_to"]', style: { 'line-color': '#1f2a3d', opacity: 0.45 } },
  { selector: 'edge[type = "associated_with"]', style: { 'line-color': '#2b3a52' } },

  { selector: '.dimmed', style: { opacity: 0.22 } },
  { selector: 'node.selected', style: { 'border-width': 2.5, 'border-color': '#e6f0ff', 'z-index': 20 } },
  { selector: 'node.highlighted', style: { 'border-width': 3, 'border-color': '#22d3ee', 'z-index': 10, opacity: 1 } },
  { selector: 'edge.highlighted', style: { 'line-color': '#22d3ee', width: 3, opacity: 1, 'z-index': 10 } },
  { selector: 'node.ai-pulse', style: { 'border-color': '#22d3ee', 'border-width': 4, 'transition-duration': 520 } },
  { selector: 'node.ai-pulse.ai-pulse-on', style: { 'border-width': 9, 'border-opacity': 0.55 } },
  { selector: 'edge.ai-path', style: { 'line-color': '#22d3ee', width: 4 } },
];

function toNode(n: Entity, color: string): ElementDefinition {
  return { group: 'nodes', data: { id: n.id, label: n.name, type: n.type, faction: n.factionId, color, shape: SHAPE[n.type], size: SIZE[n.type] } };
}
function toEdge(e: Relationship): ElementDefinition {
  return { group: 'edges', data: { id: e.id, source: e.sourceEntityId, target: e.targetEntityId, type: e.type, confidence: e.confidence, width: 1 + 3 * e.confidence } };
}

const EXPAND_ERROR_MS = 5000;
const COSE = { name: 'cose', animate: false, fit: true, padding: 24, nodeRepulsion: () => 12_000, idealEdgeLength: () => 55, edgeElasticity: () => 60, gravity: 0.6, numIter: 700, randomize: true, nodeOverlap: 8 } as const;

export function GraphView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [cyReady, setCyReady] = useState(false);
  const [hideLocations, setHideLocations] = useState(true);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [counts, setCounts] = useState({ nodes: 0, highlighted: 0 });
  const [expandError, setExpandError] = useState<string | null>(null);
  const lastTapRef = useRef<string | null>(null);
  const initialisedRef = useRef(false);
  const relayoutRef = useRef(false);
  const reduced = usePrefersReducedMotion();

  const graph = useGraph();
  const factions = useFactions();
  const selectedKind = useSelection((s) => s.selectedKind);
  const selectedId = useSelection((s) => s.selectedId);
  const selectionHl = useSelection((s) => s.selectionHighlights);
  const aiHl = useSelection((s) => s.aiHighlights);
  // Union of both layers. Memoised: the store helper builds a new object per call, which a selector must not do.
  const allHl = useMemo(() => selectAllHighlighted({ selectionHighlights: selectionHl, aiHighlights: aiHl } as Parameters<typeof selectAllHighlighted>[0]), [selectionHl, aiHl]);

  // ---- boot cytoscape (client only) -------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let cy: Core | null = null;
    void import('cytoscape').then(({ default: cytoscape }) => {
      if (cancelled || !hostRef.current) return;
      cy = cytoscape({ container: hostRef.current, style: STYLE, minZoom: 0.15, maxZoom: 4, boxSelectionEnabled: false, autounselectify: true });
      cyRef.current = cy;
      if (process.env.NODE_ENV !== 'production') (window as unknown as { __fusionCy?: Core }).__fusionCy = cy;
      setCyReady(true);
    });
    return () => {
      cancelled = true;
      cy?.destroy();
      cyRef.current = null;
      if (process.env.NODE_ENV !== 'production') delete (window as unknown as { __fusionCy?: Core }).__fusionCy;
    };
  }, []);

  // ---- desired element set ----------------------------------------------------
  const colorOf = useMemo(() => {
    const m = new Map((factions.data ?? []).map((f) => [f.id, f.color]));
    return (id: string | null) => (id && m.get(id)) || GREY;
  }, [factions.data]);

  const desired = useMemo(() => {
    if (!graph.data) return null;
    // Shown even while hidden: the selected location, AI-highlighted ones, and any revealed by a double-tap.
    // Neighbour highlights deliberately do not qualify: every tap would drag Kestrel's ~100 edges in.
    const keep = new Set<string>([...aiHl.entityIds, ...revealed]);
    if (selectedKind === 'entity' && selectedId) keep.add(selectedId);
    const nodes = graph.data.nodes.filter((n) => {
      if (n.type !== 'location') return true;
      if (n.locationKind === 'lane') return false;      // lanes are map-only
      return !hideLocations || keep.has(n.id);
    });
    const ids = new Set(nodes.map((n) => n.id));
    const edges = graph.data.edges.filter((e) => ids.has(e.sourceEntityId) && ids.has(e.targetEntityId));
    return { nodes, edges };
  }, [graph.data, hideLocations, aiHl.entityIds, revealed, selectedKind, selectedId]);

  /** Diff the chart against `desired`. First build lays out and fits; later diffs place new nodes near their neighbours. */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady || !desired) return;
    const wantNodes = new Map(desired.nodes.map((n) => [n.id, n]));
    const wantEdges = new Map(desired.edges.map((e) => [e.id, e]));

    cy.batch(() => {
      cy.nodes().filter((n) => !wantNodes.has(n.id())).remove();
      cy.edges().filter((e) => !wantEdges.has(e.id())).remove();
    });
    const newNodes = desired.nodes.filter((n) => cy.getElementById(n.id).empty()).map((n) => toNode(n, colorOf(n.factionId)));
    const newEdges = desired.edges.filter((e) => cy.getElementById(e.id).empty()).map(toEdge);

    if (!initialisedRef.current || relayoutRef.current) {
      cy.add([...newNodes, ...newEdges]);
      cy.layout(COSE).run();
      initialisedRef.current = true;
      relayoutRef.current = false;
    } else if (newNodes.length || newEdges.length) {
      const added = cy.add([...newNodes, ...newEdges]);
      placeNearNeighbours(cy, added.nodes(), reduced);
    }
    // Colours may arrive after the first build; keep node fills in step with /api/factions.
    cy.nodes().forEach((n) => { const c = colorOf(n.data('faction') ?? null); if (n.data('color') !== c) n.data('color', c); });
    setCounts((c) => ({ ...c, nodes: cy.nodes().length }));
  }, [cyReady, desired, colorOf, reduced]);

  // ---- interactions -----------------------------------------------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady) return;
    const onTapNode = (e: EventObject) => {
      const n = e.target as NodeSingular;
      lastTapRef.current = n.id();
      // Neighbours (hidden locations included) come from the cached full graph inside selectEntity.
      selectEntity(n.id());
    };
    const onTapBg = (e: EventObject) => { if (e.target === cy) clearSelectionEverywhere(); };
    const onDblTap = (e: EventObject) => { void expand((e.target as NodeSingular).id()); };
    const onEdgeOver = (e: EventObject) => {
      const conf = Number(e.target.data('confidence'));
      setTip({ x: e.renderedPosition.x, y: e.renderedPosition.y, text: `${String(e.target.data('type')).replace(/_/g, ' ')} · ${Math.round(conf * 100)}%` });
    };
    const onEdgeOut = () => setTip(null);
    cy.on('tap', 'node', onTapNode);
    cy.on('tap', onTapBg);
    cy.on('dbltap', 'node', onDblTap);
    cy.on('mouseover', 'edge', onEdgeOver);
    cy.on('mouseout', 'edge', onEdgeOut);
    return () => {
      cy.removeListener('tap', 'node', onTapNode);
      cy.removeListener('tap', onTapBg);
      cy.removeListener('dbltap', 'node', onDblTap);
      cy.removeListener('mouseover', 'edge', onEdgeOver);
      cy.removeListener('mouseout', 'edge', onEdgeOut);
    };
    // expand is stable (refs only)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cyReady]);

  /** GR-3: pull the 1-hop neighbourhood from the API and reveal anything the chart lacks (including hidden locations). */
  const expand = useCallback(async (id: string) => {
    const cy = cyRef.current;
    if (!cy) return;
    try {
      const nh = await fetchNeighbors(id, 1);
      const ids = nh.nodes.filter((n) => n.locationKind !== 'lane').map((n) => n.id);
      setRevealed((prev) => {
        const next = new Set(prev);
        for (const i of ids) next.add(i);
        return next.size === prev.size ? prev : next;
      });
      lastTapRef.current = id;
      selectEntity(id, { entityIds: ids, edgeIds: nh.edges.map((e) => e.id) });
    } catch (err) {
      console.error('[graph] expand failed', err);
      setExpandError(err instanceof Error ? err.message : String(err));
    }
  }, []);
  useEffect(() => {
    if (expandError === null) return;
    const t = window.setTimeout(() => setExpandError(null), EXPAND_ERROR_MS);
    return () => window.clearTimeout(t);
  }, [expandError]);

  // ---- store → chart: selection ------------------------------------------------
  // The view re-centres once per selection change (armed here), not every time the
  // node set shifts under an AI highlight or the hide-locations toggle.
  const centrePendingRef = useRef(false);
  useEffect(() => { centrePendingRef.current = selectedKind === 'entity' && selectedId !== null; }, [selectedKind, selectedId]);
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady) return;
    cy.nodes('.selected').removeClass('selected');
    if (selectedKind !== 'entity' || !selectedId) return;
    const n = cy.getElementById(selectedId);
    if (n.empty()) return;
    n.addClass('selected');
    if (!centrePendingRef.current) return;
    centrePendingRef.current = false;
    if (lastTapRef.current === selectedId) { lastTapRef.current = null; return; } // came from this chart; don't yank the view
    cy.animate({ center: { eles: n } }, { duration: reduced ? 0 : 300 });
  }, [cyReady, selectedKind, selectedId, desired, reduced]);

  // ---- store → chart: highlights ------------------------------------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady) return;
    const ents = new Set(allHl.entityIds);
    const edges = new Set(allHl.edgeIds);
    cy.batch(() => {
      cy.elements().removeClass('highlighted dimmed');
      const any = ents.size > 0 || edges.size > 0;
      cy.nodes().forEach((n) => { if (ents.has(n.id())) n.addClass('highlighted'); else if (any) n.addClass('dimmed'); });
      cy.edges().forEach((e) => {
        if (edges.has(e.id())) e.addClass('highlighted');
        else if (any && !(ents.has(e.source().id()) && ents.has(e.target().id()))) e.addClass('dimmed');
      });
    });
    setCounts((c) => ({ ...c, highlighted: cy.nodes('.highlighted').length + cy.edges('.highlighted').length }));
  }, [cyReady, allHl, desired]);

  // ---- store → chart: AI pulse + path sequence ------------------------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady) return;
    cy.nodes('.ai-pulse').removeClass('ai-pulse ai-pulse-on');
    cy.edges('.ai-path').removeClass('ai-path');
    const nodes = cy.nodes().filter((n) => aiHl.entityIds.includes(n.id()));
    nodes.addClass('ai-pulse');
    const timers: number[] = [];
    let interval: number | undefined;
    if (!reduced && nodes.length) {
      interval = window.setInterval(() => nodes.toggleClass('ai-pulse-on'), 560);
    }
    // Path edges light up in order, 120ms apart (GR-4), all at once under reduced motion.
    aiHl.edgeIds.forEach((id, i) => {
      const e = cy.getElementById(id);
      if (e.empty()) return;
      if (reduced) e.addClass('ai-path');
      else timers.push(window.setTimeout(() => e.addClass('ai-path'), i * 120));
    });
    return () => {
      if (interval !== undefined) window.clearInterval(interval);
      timers.forEach((t) => window.clearTimeout(t));
      nodes.removeClass('ai-pulse ai-pulse-on');
    };
  }, [cyReady, aiHl, desired, reduced]);

  // ---- hide-locations toggle ----------------------------------------------------
  const toggleLocations = (hide: boolean) => {
    relayoutRef.current = true;  // the node set changes enough to warrant a fresh layout
    setHideLocations(hide);
  };

  const fit = () => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 24 } }, { duration: prefersReducedMotion() ? 0 : 250 });

  return (
    <div className="relative h-full w-full bg-bg">
      <div
        ref={hostRef}
        id="graph-canvas"
        tabIndex={-1}
        className="h-full w-full outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-concord/70"
        data-node-count={counts.nodes}
        data-highlighted-count={counts.highlighted}
        role="img"
        aria-label="Link chart of entities and relationships"
      />
      {(graph.isPending || !cyReady) && !graph.error && (
        <div className="pointer-events-none absolute left-1 top-1 w-48"><Skeleton rows={3} testId="graph-loading" /></div>
      )}
      {graph.error && (
        <div className="absolute left-2 top-2 z-10 max-w-[280px]">
          <ErrorState error={graph.error} retry={() => void graph.refetch()} retrying={graph.isFetching} testId="graph-error" className="m-0! bg-panel!" />
        </div>
      )}
      {!graph.error && cyReady && desired && desired.nodes.length === 0 && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-panel/80">
          <EmptyState
            testId="graph-empty" className="py-2! text-center text-[11px]!"
            action={graph.data && graph.data.nodes.length > 0 && hideLocations ? { label: 'Show locations', onClick: () => toggleLocations(false) } : undefined}
          >
            {graph.data && graph.data.nodes.length > 0 ? 'Nothing to chart: every entity is a hidden location.' : 'No entities in the database yet. Reseed the scenario from Admin.'}
          </EmptyState>
        </div>
      )}

      <div className="absolute right-1 top-1 z-10 flex items-center gap-2 rounded-sm border border-border bg-panel/90 px-1.5 py-1 text-[10px] text-text">
        {expandError && (
          <span role="alert" data-testid="graph-expand-error" title={expandError} className="max-w-[160px] truncate rounded-sm border border-hegemony/40 bg-hegemony/10 px-1 font-mono text-[9px] tracking-wider text-hegemony">
            EXPAND FAILED
          </span>
        )}
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" className="h-2.5 w-2.5 accent-concord" checked={hideLocations} onChange={(e) => toggleLocations(e.target.checked)} data-toggle="hide-locations" />
          Hide locations
        </label>
        <button type="button" onClick={fit} className="rounded-sm border border-border px-1 leading-[14px] text-muted hover:border-concord/50 hover:text-concord" title="Fit to view">fit</button>
      </div>

      <div className="pointer-events-none absolute bottom-1 left-2 font-mono text-[10px] text-muted">
        {counts.nodes} nodes · {cyRef.current?.edges().length ?? 0} edges{counts.highlighted ? ` · ${counts.highlighted} lit` : ''} · dbl-tap expands
      </div>

      {tip && (
        <div className="pointer-events-none absolute z-20 rounded-sm border border-border bg-panel px-1.5 py-0.5 font-mono text-[10px] text-text" style={{ left: tip.x + 10, top: tip.y + 10 }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

/** New nodes land at the centroid of their already-placed neighbours, spread in a small ring so they don't stack. */
function placeNearNeighbours(cy: Core, nodes: NodeCollection, reduced: boolean) {
  if (nodes.empty()) return;
  const ext = cy.extent();
  const fallback = { x: (ext.x1 + ext.x2) / 2, y: (ext.y1 + ext.y2) / 2 };
  nodes.forEach((n, i) => {
    const placed = n.neighborhood('node').nodes().filter((m) => !nodes.contains(m));
    let cx = fallback.x, cy0 = fallback.y;
    if (placed.nonempty()) {
      let sx = 0, sy = 0;
      placed.forEach((m) => { sx += m.position('x'); sy += m.position('y'); });
      cx = sx / placed.length;
      cy0 = sy / placed.length;
    }
    const a = (i / nodes.length) * Math.PI * 2;
    const r = 40 + (nodes.length > 8 ? 30 : 0);
    const target = { x: cx + Math.cos(a) * r, y: cy0 + Math.sin(a) * r };
    if (reduced) n.position(target);
    else { n.position({ x: cx, y: cy0 }); n.animate({ position: target }, { duration: 300 }); }
  });
}

export default GraphView;
