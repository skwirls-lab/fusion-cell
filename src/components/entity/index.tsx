'use client';

/** Entity profile / event card (PRD §5.4). Everything here comes from /api/entities/:id or /api/events. */
import { useMemo } from 'react';
import { DEFAULT_FILTERS, useSelection } from '@/stores/selection';
import { useUiStore } from '@/stores/ui';
import { useWatchlist } from '@/stores/watchlist';
import { useEntityProfile, useEvents, useGraph } from '@/lib/client/api';
import { Chip, EmptyState, ErrorState, FactionChip, ReportTypeBadge, Skeleton, TypeBadge } from '@/lib/client/chips';
import { confidencePct, formatDtg, formatDtgFull } from '@/lib/client/format';
import { selectEntity, selectEvent } from '@/lib/client/select';
import type { EntityProfile, Event, ReportSummary } from '@/lib/types';

export function EntityPanel() {
  const kind = useSelection((s) => s.selectedKind);
  const id = useSelection((s) => s.selectedId);

  if (!id || !kind) {
    return (
      <EmptyState>
        <div className="font-mono text-[10px] tracking-[0.18em] text-muted">NOTHING SELECTED</div>
        <p className="mt-1">Click a marker on the map, a node on the chart, a feed row, or search with <kbd className="rounded-sm border border-border px-1 font-mono">/</kbd>.</p>
      </EmptyState>
    );
  }
  return kind === 'event' ? <EventCard id={id} /> : <EntityProfileView id={id} />;
}

export default EntityPanel;

// ---- entity -------------------------------------------------------------------

function EntityProfileView({ id }: { id: string }) {
  const q = useEntityProfile(id);
  if (q.isPending) return <Skeleton rows={8} />;
  if (q.error) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  const p = q.data;
  return (
    <div className="flex flex-col" data-testid="entity-profile" data-entity-id={p.entity.id}>
      <Header p={p} />
      <Attributes attrs={p.entity.attributes} description={p.entity.description} />
      <Connections p={p} />
      <Timeline events={p.events} />
      <SourceReports reports={p.reports} />
    </div>
  );
}

/** Watchlist toggle (PRD §5.4 header, §5.10): a starred entity raises an alert when a report naming it arrives. */
function WatchStar({ id, name }: { id: string; name: string }) {
  const watched = useWatchlist((s) => s.entityIds.includes(id));
  const toggle = useWatchlist((s) => s.toggle);
  return (
    <button
      type="button"
      onClick={() => toggle(id)}
      aria-pressed={watched}
      aria-label={watched ? `Remove ${name} from watchlist` : `Add ${name} to watchlist`}
      title={watched ? 'On watchlist — click to remove' : 'Add to watchlist: alert me when a report names this entity'}
      data-testid="watchlist-toggle"
      className={watched
        ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-cartel/60 bg-cartel/15 text-cartel'
        : 'flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-border text-muted hover:border-cartel/60 hover:text-cartel'}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true" fill={watched ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" />
      </svg>
    </button>
  );
}

function Header({ p }: { p: EntityProfile }) {
  const setPrefill = useSelection((s) => s.setAnalystPrefill);
  const setRightTab = useUiStore((s) => s.setRightTab);
  const e = p.entity;
  return (
    <div className="border-b border-border px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[14px] font-semibold leading-tight text-text" data-testid="entity-name">{e.name}</h2>
        <span className="flex shrink-0 items-center gap-1.5">
          <TypeBadge>{e.type}{e.locationKind ? ` · ${e.locationKind}` : ''}</TypeBadge>
          <WatchStar id={e.id} name={e.name} />
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <FactionChip factionId={e.factionId} name={p.faction?.name} />
        <span className="font-mono text-[10px] text-muted">{e.id}</span>
      </div>
      {e.aliases.length > 0 && (
        <div className="mt-1 text-[11px] text-muted">aka {e.aliases.join(' · ')}</div>
      )}
      <div className="mt-1.5 flex items-center gap-2" title={`Confidence ${confidencePct(e.confidence)}`}>
        <span className="font-mono text-[9px] tracking-wider text-muted">CONF</span>
        <div className="h-1 flex-1 rounded-sm bg-panel-2"><div className="h-1 rounded-sm bg-concord" style={{ width: confidencePct(e.confidence) }} /></div>
        <span className="font-mono text-[10px] text-muted">{confidencePct(e.confidence)}</span>
      </div>
      <button
        type="button"
        onClick={() => { setPrefill(`Tell me everything the reporting shows about ${e.name} (${e.id}) and what it implies.`); setRightTab('analyst'); }}
        className="mt-2 w-full rounded-sm border border-concord/40 bg-concord/10 px-2 py-1 text-[11px] text-concord hover:bg-concord/20"
      >
        Ask the analyst about this entity
      </button>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="border-b border-border">
      <h3 className="flex items-center justify-between px-3 pb-1 pt-2 font-mono text-[10px] font-semibold tracking-[0.18em] text-muted">
        {title}{count !== undefined && <span>{count}</span>}
      </h3>
      {children}
    </section>
  );
}

function Attributes({ attrs, description }: { attrs: Record<string, unknown>; description: string }) {
  const rows = Object.entries(attrs);
  return (
    <Section title="ATTRIBUTES">
      {description && <p className="px-3 pb-1.5 text-[12px] text-text">{description}</p>}
      {rows.length === 0 && !description && <EmptyState>No attributes recorded.</EmptyState>}
      {rows.length > 0 && (
        <dl className="grid grid-cols-[minmax(80px,auto)_1fr] gap-x-2 px-3 pb-2 text-[11px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="truncate font-mono text-muted">{k}</dt>
              <dd className="break-words text-text">{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Section>
  );
}

function Connections({ p }: { p: EntityProfile }) {
  const openReport = useSelection((s) => s.openReport);
  const groups = useMemo(() => {
    const m = new Map<string, EntityProfile['connections']>();
    for (const c of p.connections) { if (!m.has(c.type)) m.set(c.type, []); m.get(c.type)!.push(c); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [p.connections]);

  return (
    <Section title="CONNECTIONS" count={p.connections.length}>
      {groups.length === 0 && <EmptyState>No relationships recorded.</EmptyState>}
      {groups.map(([type, conns]) => (
        <div key={type} className="px-3 pb-1.5">
          <div className="font-mono text-[10px] text-muted">{type.replace(/_/g, ' ')}</div>
          <ul>
            {conns.map((c) => (
              <li key={c.id} className="flex items-center gap-1.5 py-0.5 text-[11px]" data-testid="connection-row">
                <span className="w-3 shrink-0 font-mono text-muted" aria-label={c.direction === 'out' ? 'outgoing' : 'incoming'}>{c.direction === 'out' ? '→' : '←'}</span>
                <button
                  type="button"
                  onClick={() => selectEntity(c.other.id, { entityIds: [p.entity.id], edgeIds: [c.id] })}
                  className="truncate text-left text-text hover:text-concord hover:underline"
                >
                  {c.other.name}
                </button>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted" title="Confidence">{confidencePct(c.confidence)}</span>
                <span className="flex shrink-0 gap-0.5">
                  {c.reportIds.map((r) => <Chip key={r} mono onClick={() => openReport(r)} title={`Open ${r}`}>{r}</Chip>)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Section>
  );
}

function Timeline({ events }: { events: Event[] }) {
  const selectedId = useSelection((s) => s.selectedId);
  const sorted = useMemo(() => [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)), [events]);
  return (
    <Section title="TIMELINE" count={events.length}>
      {sorted.length === 0 && <EmptyState>No events involve this entity.</EmptyState>}
      <ol className="px-3 pb-2">
        {sorted.map((ev) => (
          <li key={ev.id}>
            <button
              type="button"
              onClick={() => selectEvent(ev)}
              className={'flex w-full items-baseline gap-2 py-0.5 text-left text-[11px] hover:text-concord ' + (selectedId === ev.id ? 'text-concord' : 'text-text')}
            >
              <span className="shrink-0 font-mono text-[10px] text-muted">{formatDtg(ev.occurredAt)}</span>
              <span className="truncate">{ev.title}</span>
              <TypeBadge className="ml-auto">{ev.type}</TypeBadge>
            </button>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function SourceReports({ reports }: { reports: ReportSummary[] }) {
  const openReport = useSelection((s) => s.openReport);
  return (
    <Section title="SOURCE REPORTS" count={reports.length}>
      {reports.length === 0 && <EmptyState>No reports link to this entity.</EmptyState>}
      <ul className="pb-2">
        {reports.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => openReport(r.reportNumber)}
              className="block w-full px-3 py-1 text-left hover:bg-panel-2"
              data-testid="source-report"
            >
              <div className="flex items-center gap-1.5">
                <ReportTypeBadge type={r.type} />
                <span className="font-mono text-[10px] text-muted">{r.reportNumber}</span>
                <span className="ml-auto font-mono text-[10px] text-muted">{formatDtgFull(r.reportedAt)}</span>
              </div>
              <div className="truncate text-[11px] text-text">{r.title}</div>
              <div className="line-clamp-2 text-[10px] text-muted">{r.snippet}</div>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---- event --------------------------------------------------------------------

function EventCard({ id }: { id: string }) {
  const openReport = useSelection((s) => s.openReport);
  // The unfiltered list is cached under the same key the map uses when no filters are set.
  const events = useEvents(DEFAULT_FILTERS);
  const graph = useGraph();
  const nameOf = useMemo(() => new Map((graph.data?.nodes ?? []).map((n) => [n.id, n.name])), [graph.data]);
  if (events.isPending) return <Skeleton rows={5} />;
  if (events.error) return <ErrorState error={events.error} retry={() => void events.refetch()} />;
  const ev = events.data.find((e) => e.id === id);
  if (!ev) return <EmptyState>Event <span className="font-mono">{id}</span> is not in the current dataset.</EmptyState>;
  return (
    <div className="flex flex-col" data-testid="event-card" data-event-id={ev.id}>
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[13px] font-semibold leading-tight text-text">{ev.title}</h2>
          <TypeBadge>{ev.type}</TypeBadge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <FactionChip factionId={ev.factionId} />
          <span className="font-mono text-[10px] text-muted">{formatDtgFull(ev.occurredAt)}</span>
          <span className="font-mono text-[10px] text-muted">conf {confidencePct(ev.confidence)}</span>
        </div>
        <p className="mt-1.5 text-[12px] text-text">{ev.description}</p>
        <div className="mt-0.5 font-mono text-[10px] text-muted">{ev.lon.toFixed(2)}, {ev.lat.toFixed(2)}</div>
      </div>
      <Section title="PARTICIPANTS" count={ev.entityIds.length}>
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {ev.entityIds.length === 0 && <span className="text-[11px] text-muted">None recorded.</span>}
          {ev.entityIds.map((eid) => <Chip key={eid} onClick={() => selectEntity(eid)}>{nameOf.get(eid) ?? eid}</Chip>)}
        </div>
      </Section>
      <Section title="SOURCE REPORTS" count={ev.reportIds.length}>
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {ev.reportIds.length === 0 && <span className="text-[11px] text-muted">No linked reports.</span>}
          {ev.reportIds.map((r) => <Chip key={r} mono onClick={() => openReport(r)}>{r}</Chip>)}
        </div>
      </Section>
    </div>
  );
}
