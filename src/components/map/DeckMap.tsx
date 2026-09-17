'use client';

/**
 * Operational map (PRD §5.2). deck.gl layers over the starfield div — no
 * basemap, no tiles; coordinates are ordinary lon/lat so a basemap can be
 * added later without touching the data.
 *
 * Layer order (bottom → top): lanes, events, locations, steady highlight
 * rings, pulsing AI rings, labels. Locations sit above events so a click on
 * a hub picks the place; radii are in pixels, so zooming in separates the
 * events clustered around it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeckGL, { type DeckGLRef } from '@deck.gl/react';
import { FlyToInterpolator, WebMercatorViewport, type MapViewState, type PickingInfo } from '@deck.gl/core';
import { LineLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { useSelection, selectAllHighlighted } from '@/stores/selection';
import { useEvents, useFactions, useGraph } from '@/lib/client/api';
import { formatDtg, hexToRgb } from '@/lib/client/format';
import { usePrefersReducedMotion } from '@/lib/client/motion';
import { clearSelectionEverywhere, selectEntity, selectEvent } from '@/lib/client/select';
import { ErrorState } from '@/lib/client/chips';
import type { Entity, Event } from '@/lib/types';

type RGB = [number, number, number];
const GREY: RGB = [156, 163, 175];
const MUTED: RGB = [127, 140, 163];
const CYAN: RGB = [34, 211, 238];
const WHITE: RGB = [230, 240, 255];

/** The theatre: every seeded location sits inside lon −28…26 / lat −18…16. */
const THEATRE: [[number, number], [number, number]] = [[-29, -19.5], [27, 17.5]];
const LABEL_MIN_ZOOM = 2.8;
const PICK_RADIUS = 8;
const PULSE_MS = 100;
const LABEL_KINDS = new Set(['system', 'station', 'gate']);

const RADIUS_BY_KIND: Record<string, number> = { system: 9, station: 7, facility: 5, gate: 5.5, city: 4, moon: 4 };

interface LocationDatum { id: string; name: string; kind: string; position: [number, number]; color: RGB; radius: number; factionId: string | null }
interface EventDatum { id: string; title: string; type: string; position: [number, number]; color: RGB; occurredAt: string; factionId: string | null; entityIds: string[] }
interface LaneDatum { id: string; name: string; from: [number, number]; to: [number, number] }
interface RingDatum { id: string; position: [number, number]; radius: number }

interface Toggles { locations: boolean; events: boolean; lanes: boolean; ai: boolean }

function fitTheatre(width: number, height: number): MapViewState {
  const vp = new WebMercatorViewport({ width, height }).fitBounds(THEATRE, { padding: 16 });
  return { longitude: vp.longitude, latitude: vp.latitude, zoom: vp.zoom, pitch: 0, bearing: 0 };
}

export default function DeckMap() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<DeckGLRef>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [viewState, setViewState] = useState<MapViewState | null>(null);
  const [toggles, setToggles] = useState<Toggles>({ locations: true, events: true, lanes: true, ai: true });
  const [pulse, setPulse] = useState(0);
  const reduced = usePrefersReducedMotion();

  const filters = useSelection((s) => s.filters);
  const selectedKind = useSelection((s) => s.selectedKind);
  const selectedId = useSelection((s) => s.selectedId);
  const selectionHl = useSelection((s) => s.selectionHighlights);
  const aiHl = useSelection((s) => s.aiHighlights);
  // Union of both layers. Memoised: the store helper builds a new object per call, which a selector must not do.
  const allHl = useMemo(() => selectAllHighlighted({ selectionHighlights: selectionHl, aiHighlights: aiHl } as Parameters<typeof selectAllHighlighted>[0]), [selectionHl, aiHl]);

  const graph = useGraph();
  const factions = useFactions();
  const events = useEvents(filters);

  // ---- container size → initial fit ------------------------------------------
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (size && !viewState) setViewState(fitTheatre(size.w, size.h));
  }, [size, viewState]);

  // ---- data shaping ------------------------------------------------------------
  const colorOf = useMemo(() => {
    const m = new Map<string, RGB>();
    for (const f of factions.data ?? []) m.set(f.id, hexToRgb(f.color));
    return (factionId: string | null) => (factionId && m.get(factionId)) || GREY;
  }, [factions.data]);

  const nodes = graph.data?.nodes;
  const nodeById = useMemo(() => new Map((nodes ?? []).map((n) => [n.id, n])), [nodes]);

  const locations = useMemo<LocationDatum[]>(() => (nodes ?? [])
    .filter((n): n is Entity & { lon: number; lat: number } => n.type === 'location' && n.lon !== null && n.lat !== null && n.locationKind !== 'lane')
    .map((n) => ({
      id: n.id, name: n.name, kind: n.locationKind ?? 'facility', position: [n.lon, n.lat] as [number, number],
      color: colorOf(n.factionId), radius: RADIUS_BY_KIND[n.locationKind ?? ''] ?? 4, factionId: n.factionId,
    }))
    // Larger markers draw last (on top): at low zoom a hub wins the pick over the small sites clustered inside it.
    .sort((a, b) => a.radius - b.radius), [nodes, colorOf]);

  const lanes = useMemo<LaneDatum[]>(() => (nodes ?? [])
    .filter((n) => n.type === 'location' && n.locationKind === 'lane')
    .flatMap((n) => {
      const a = nodeById.get(String(n.attributes.from ?? ''));
      const b = nodeById.get(String(n.attributes.to ?? ''));
      if (!a || !b || a.lon === null || a.lat === null || b.lon === null || b.lat === null) return [];
      return [{ id: n.id, name: n.name, from: [a.lon, a.lat] as [number, number], to: [b.lon, b.lat] as [number, number] }];
    }), [nodes, nodeById]);

  const eventData = useMemo<EventDatum[]>(() => (events.data ?? []).map((e) => ({
    id: e.id, title: e.title, type: e.type, position: [e.lon, e.lat], color: colorOf(e.factionId),
    occurredAt: e.occurredAt, factionId: e.factionId, entityIds: e.entityIds,
  })), [events.data, colorOf]);

  const eventById = useMemo(() => new Map((events.data ?? []).map((e) => [e.id, e])), [events.data]);

  // Highlight rings: whichever of the visible markers the store points at.
  const ringsFor = useCallback((hl: { entityIds: string[]; eventIds: string[] }, extra: number): RingDatum[] => {
    const ents = new Set(hl.entityIds);
    const evs = new Set(hl.eventIds);
    const out: RingDatum[] = [];
    if (toggles.locations) for (const l of locations) if (ents.has(l.id)) out.push({ id: l.id, position: l.position, radius: l.radius + extra });
    if (toggles.events) for (const e of eventData) if (evs.has(e.id)) out.push({ id: e.id, position: e.position, radius: 3.5 + extra });
    return out;
  }, [locations, eventData, toggles.locations, toggles.events]);

  const selectionRings = useMemo(() => ringsFor(selectionHl, 5), [ringsFor, selectionHl]);
  const aiRings = useMemo(() => (toggles.ai ? ringsFor(aiHl, 6) : []), [ringsFor, aiHl, toggles.ai]);
  const highlightedCount = useMemo(() => {
    const ids = new Set<string>();
    if (toggles.locations) for (const l of locations) if (allHl.entityIds.includes(l.id)) ids.add(l.id);
    if (toggles.events) for (const e of eventData) if (allHl.eventIds.includes(e.id)) ids.add(e.id);
    return ids.size;
  }, [locations, eventData, allHl, toggles.locations, toggles.events]);

  // ---- AI pulse (10 fps while any AI ring is showing; off under reduced motion) ------
  useEffect(() => {
    if (reduced || !toggles.ai || aiRings.length === 0) { setPulse(0); return; }
    const t0 = performance.now();
    const id = window.setInterval(() => setPulse((Math.sin((performance.now() - t0) / 350) + 1) / 2), PULSE_MS);
    return () => window.clearInterval(id);
  }, [reduced, toggles.ai, aiRings.length]);

  // ---- selected location → pan -------------------------------------------------
  useEffect(() => {
    if (selectedKind !== 'entity' || !selectedId) return;
    const n = nodeById.get(selectedId);
    if (!n || n.type !== 'location' || n.lon === null || n.lat === null) return;
    setViewState((v) => v && ({
      ...v, longitude: n.lon as number, latitude: n.lat as number,
      transitionDuration: reduced ? 0 : 500, transitionInterpolator: new FlyToInterpolator({ speed: 3 }),
    }));
  }, [selectedKind, selectedId, nodeById, reduced]);

  // ---- picking -----------------------------------------------------------------
  // Markers cluster (five sites within 1° of Kestrel), so the topmost fragment is
  // not what the user meant. Take everything within PICK_RADIUS px and select the
  // marker whose centre is nearest the pointer; a location wins an exact tie.
  const onClick = useCallback((info: PickingInfo) => {
    const deck = deckRef.current?.deck;
    const vp = deck?.getViewports()[0];
    if (!deck || !vp) return;
    const picks = deck.pickMultipleObjects({ x: info.x, y: info.y, radius: PICK_RADIUS, layerIds: ['locations', 'events'], depth: 12 });
    let best: { info: PickingInfo; d: number } | null = null;
    for (const p of picks) {
      const obj = p.object as LocationDatum | EventDatum | undefined;
      if (!obj) continue;
      const [px, py] = vp.project(obj.position);
      const d = Math.hypot(px - info.x, py - info.y) - (p.layer?.id === 'locations' ? 0.5 : 0);
      if (!best || d < best.d) best = { info: p, d };
    }
    if (!best) { clearSelectionEverywhere(); return; }
    if (best.info.layer?.id === 'events') {
      const d = best.info.object as EventDatum;
      selectEvent({ id: d.id, entityIds: d.entityIds });
    } else {
      selectEntity((best.info.object as LocationDatum).id);
    }
  }, []);

  const getTooltip = useCallback((info: PickingInfo) => {
    if (!info.object) return null;
    const style = { background: '#0e1522', border: '1px solid #1f2a3d', color: '#d6dde8', fontSize: '11px', padding: '4px 6px', borderRadius: '3px' };
    if (info.layer?.id === 'events') {
      const d = info.object as EventDatum;
      return { html: `<div style="font-weight:600">${esc(d.title)}</div><div style="color:#7f8ca3;font-family:ui-monospace,monospace">${esc(d.type)} · ${esc(d.factionId ?? 'unaffiliated')} · ${formatDtg(d.occurredAt)}</div>`, style };
    }
    const d = info.object as LocationDatum;
    return { html: `<div style="font-weight:600">${esc(d.name)}</div><div style="color:#7f8ca3;font-family:ui-monospace,monospace">${esc(d.kind)} · ${esc(d.factionId ?? 'unaffiliated')}</div>`, style };
  }, []);

  // ---- layers ------------------------------------------------------------------
  // Only the AI ring layer depends on `pulse`; everything else keeps its identity across ticks.
  const zoom = viewState?.zoom ?? 0;
  const baseLayers = useMemo(() => [
    new LineLayer<LaneDatum>({
      id: 'lanes', data: lanes, visible: toggles.lanes,
      getSourcePosition: (d) => d.from, getTargetPosition: (d) => d.to,
      getColor: [...MUTED, 110], getWidth: 1, widthUnits: 'pixels',
    }),
    new ScatterplotLayer<EventDatum>({
      id: 'events', data: eventData, visible: toggles.events, pickable: true,
      getPosition: (d) => d.position, getRadius: 3.5, radiusUnits: 'pixels',
      getFillColor: (d) => [...d.color, 217], stroked: true, getLineColor: [7, 11, 20, 200], lineWidthUnits: 'pixels', getLineWidth: 0.75,
    }),
    new ScatterplotLayer<LocationDatum>({
      id: 'locations', data: locations, visible: toggles.locations, pickable: true,
      getPosition: (d) => d.position, getRadius: (d) => d.radius, radiusUnits: 'pixels',
      getFillColor: (d) => [...d.color, 210], stroked: true, getLineColor: [...WHITE, 90], lineWidthUnits: 'pixels', getLineWidth: 1,
    }),
    new ScatterplotLayer<RingDatum>({
      id: 'highlight-selection', data: selectionRings,
      getPosition: (d) => d.position, getRadius: (d) => d.radius, radiusUnits: 'pixels',
      filled: false, stroked: true, getLineColor: [...WHITE, 230], lineWidthUnits: 'pixels', getLineWidth: 1.5,
    }),
  ], [lanes, locations, eventData, selectionRings, toggles.lanes, toggles.events, toggles.locations]);
  const aiLayer = useMemo(() => new ScatterplotLayer<RingDatum>({
    id: 'highlight-ai', data: aiRings,
    getPosition: (d) => d.position, getRadius: (d) => d.radius + pulse * 4, radiusUnits: 'pixels',
    filled: true, getFillColor: [...CYAN, Math.round(30 + pulse * 40)],
    stroked: true, getLineColor: [...CYAN, 240], lineWidthUnits: 'pixels', getLineWidth: 2,
    updateTriggers: { getRadius: pulse, getFillColor: pulse },
  }), [aiRings, pulse]);
  const labelLayer = useMemo(() => new TextLayer<LocationDatum>({
    id: 'labels', data: locations.filter((l) => LABEL_KINDS.has(l.kind)), visible: toggles.locations && zoom >= LABEL_MIN_ZOOM,
    pickable: true, characterSet: 'auto',
    getPosition: (d) => d.position, getText: (d) => d.name, getSize: 10, sizeUnits: 'pixels',
    getColor: [...MUTED, 255], fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSettings: { sdf: false },
    getTextAnchor: 'start', getAlignmentBaseline: 'center', getPixelOffset: (d) => [d.radius + 4, 0],
  }), [locations, toggles.locations, zoom]);
  const layers = useMemo(() => [...baseLayers, aiLayer, labelLayer], [baseLayers, aiLayer, labelLayer]);

  // ---- dev/test seam --------------------------------------------------------------
  const markerCount = (toggles.locations ? locations.length : 0) + (toggles.events ? eventData.length : 0);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const w = window as unknown as { __fusionMap?: unknown };
    w.__fusionMap = {
      ids: { locations: locations.map((l) => l.id), events: eventData.map((e) => e.id) },
      /** lon/lat → page pixels using the live viewport, for e2e canvas clicks. */
      project: (lon: number, lat: number): [number, number] | null => {
        const deck = deckRef.current?.deck;
        const canvas = deck?.getCanvas();
        let vp;
        try { vp = deck?.getViewports()[0]; } catch { return null; } // deck asserts until its view manager exists
        if (!deck || !canvas || !vp) return null;
        const [x, y] = vp.project([lon, lat]);
        const r = canvas.getBoundingClientRect();
        return [r.left + x, r.top + y];
      },
    };
    return () => { delete w.__fusionMap; };
  }, [locations, eventData]);

  const loading = graph.isPending || events.isPending;
  const error = graph.error ?? events.error ?? factions.error;

  return (
    <div
      ref={wrapRef}
      id="map-canvas-wrap"
      className="starfield-bg relative h-full w-full overflow-hidden"
      data-marker-count={markerCount}
      data-highlighted-count={highlightedCount}
      data-loading={loading ? 'true' : undefined}
    >
      {viewState && (
        <DeckGL
          ref={deckRef}
          viewState={viewState}
          onViewStateChange={({ viewState: v }) => setViewState(v as MapViewState)}
          controller={true}
          layers={layers}
          onClick={onClick}
          getTooltip={getTooltip}
          getCursor={({ isHovering, isDragging }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
          style={{ position: 'absolute', inset: '0' }}
        />
      )}

      <LayerToggles toggles={toggles} onChange={setToggles} />

      <div className="pointer-events-none absolute bottom-1 left-2 font-mono text-[10px] text-muted">
        {loading ? 'loading…' : `${locations.length} loc · ${eventData.length} evt · z${zoom.toFixed(1)}`}
      </div>
      {error && <div className="absolute left-2 top-2 max-w-[280px]"><ErrorState error={error} retry={() => { void graph.refetch(); void events.refetch(); }} /></div>}
      {!loading && !error && events.data?.length === 0 && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-panel/80 px-2 py-1 text-[11px] text-muted">
          No events match the current filters
        </div>
      )}
      {selectedEventBadge(selectedKind, selectedId, eventById)}
    </div>
  );
}

function selectedEventBadge(kind: string | null, id: string | null, byId: Map<string, Event>) {
  if (kind !== 'event' || !id) return null;
  const e = byId.get(id);
  if (!e) return null;
  return (
    <div className="pointer-events-none absolute bottom-1 right-2 max-w-[60%] truncate font-mono text-[10px] text-concord">
      ▸ {e.title}
    </div>
  );
}

/** MAP-8 layer toggles. Local state; nothing else needs to know. */
function LayerToggles({ toggles, onChange }: { toggles: Toggles; onChange: (t: Toggles) => void }) {
  const items: { key: keyof Toggles; label: string }[] = [
    { key: 'locations', label: 'Locations' }, { key: 'events', label: 'Events' },
    { key: 'lanes', label: 'Lanes' }, { key: 'ai', label: 'AI highlights' },
  ];
  return (
    <fieldset className="absolute right-1 top-1 z-10 rounded-sm border border-border bg-panel/90 px-1.5 py-1" aria-label="Map layers">
      {items.map((it) => (
        <label key={it.key} className="flex cursor-pointer items-center gap-1.5 py-px text-[10px] text-text">
          <input
            type="checkbox"
            className="h-2.5 w-2.5 accent-concord"
            checked={toggles[it.key]}
            onChange={(e) => onChange({ ...toggles, [it.key]: e.target.checked })}
            data-layer={it.key}
          />
          {it.label}
        </label>
      ))}
    </fieldset>
  );
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
