'use client';

/** Filter panel (PRD §5.1), bound to the shared store; the map, feed, and events hooks read it. */
import { useSelection, DEFAULT_FILTERS } from '@/stores/selection';
import { useFactions } from '@/lib/client/api';
import { isoToLocalInput, localInputToIso } from '@/lib/client/format';
import { Skeleton } from '@/lib/client/chips';

/** Control vocabularies: the same enums the API validates against (src/lib/db/schema.ts). */
const EVENT_TYPES = ['movement', 'meeting', 'transaction', 'communication', 'sighting', 'incident'] as const;
const REPORT_TYPES = ['SIGINT', 'HUMINT', 'IMINT', 'OSINT', 'FINANCIAL', 'TRACKING'] as const;

/** The scenario window (story bible): August 2026. */
const WINDOW_MIN = '2026-08-01T00:00';
const WINDOW_MAX = '2026-08-31T23:59';
const clampToWindow = (v: string) => (v < WINDOW_MIN ? WINDOW_MIN : v > WINDOW_MAX ? WINDOW_MAX : v);

function Group({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <fieldset className="px-3 py-1.5">
      <legend className="flex w-full items-center justify-between text-[11px] text-muted">{title}{action}</legend>
      {children}
    </fieldset>
  );
}

function toggle(list: string[], v: string, on: boolean): string[] {
  return on ? [...new Set([...list, v])] : list.filter((x) => x !== v);
}

export function FilterPanel() {
  const filters = useSelection((s) => s.filters);
  const setFilters = useSelection((s) => s.setFilters);
  const resetFilters = useSelection((s) => s.resetFilters);
  const factions = useFactions();
  const dirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div data-testid="filter-panel">
      <Group title="Time range">
        <div className="flex flex-col gap-1">
          <input
            type="datetime-local" min={WINDOW_MIN} max={WINDOW_MAX} aria-label="Time range start"
            value={isoToLocalInput(filters.from)}
            onChange={(e) => setFilters({ from: e.target.value ? localInputToIso(clampToWindow(e.target.value)) : null })}
            className="h-6 rounded border border-border bg-bg px-1.5 font-mono text-[11px] text-text focus:border-concord/60 focus:outline-none"
          />
          <input
            type="datetime-local" min={WINDOW_MIN} max={WINDOW_MAX} aria-label="Time range end"
            value={isoToLocalInput(filters.to)}
            onChange={(e) => setFilters({ to: e.target.value ? localInputToIso(clampToWindow(e.target.value)) : null })}
            className="h-6 rounded border border-border bg-bg px-1.5 font-mono text-[11px] text-text focus:border-concord/60 focus:outline-none"
          />
        </div>
      </Group>

      <Group title="Factions">
        {factions.isPending && <Skeleton rows={4} className="p-0" />}
        {factions.error && <div className="text-[11px] text-hegemony">Could not load factions.</div>}
        {factions.data?.map((f) => (
          <label key={f.id} className="flex items-center gap-1.5 py-0.5 text-[12px] text-text">
            <input
              type="checkbox" className="h-3 w-3 accent-concord" name="faction" value={f.id}
              checked={filters.factions.includes(f.id)}
              onChange={(e) => setFilters({ factions: toggle(filters.factions, f.id, e.target.checked) })}
            />
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: f.color }} aria-hidden="true" />
            {f.name}
          </label>
        ))}
      </Group>

      <Group title="Event types">
        <div className="grid grid-cols-2">
          {EVENT_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-1.5 py-0.5 text-[12px] text-text">
              <input type="checkbox" className="h-3 w-3 accent-concord" name="eventType" value={t} checked={filters.eventTypes.includes(t)} onChange={(e) => setFilters({ eventTypes: toggle(filters.eventTypes, t, e.target.checked) })} />
              {t}
            </label>
          ))}
        </div>
      </Group>

      <Group title="Confidence">
        <div className="flex items-center gap-2">
          <input
            type="range" min={0} max={1} step={0.1} value={filters.minConfidence} aria-label="Minimum confidence"
            onChange={(e) => setFilters({ minConfidence: Number(e.target.value) })}
            className="w-full accent-concord"
          />
          <span className="w-10 shrink-0 text-right font-mono text-[11px] text-muted">≥ {Math.round(filters.minConfidence * 100)}%</span>
        </div>
      </Group>

      <Group title="Report types">
        <div className="grid grid-cols-2">
          {REPORT_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-1.5 py-0.5 text-[12px] text-text">
              <input type="checkbox" className="h-3 w-3 accent-concord" name="reportType" value={t} checked={filters.reportTypes.includes(t)} onChange={(e) => setFilters({ reportTypes: toggle(filters.reportTypes, t, e.target.checked) })} />
              <span className="font-mono text-[11px]">{t}</span>
            </label>
          ))}
        </div>
      </Group>

      <div className="px-3 py-2">
        <button
          type="button" onClick={resetFilters} disabled={!dirty}
          className="w-full rounded-sm border border-border px-2 py-1 text-[11px] text-muted hover:border-concord/50 hover:text-concord disabled:cursor-default disabled:opacity-40"
        >
          Reset filters
        </button>
      </div>
    </div>
  );
}

export default FilterPanel;
