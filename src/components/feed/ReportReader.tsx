'use client';

/**
 * Full report reader: a right-side sheet above the detail panel, opened by
 * store.openReportId. Extracted entities are highlighted inline; clicking one
 * selects it everywhere (PRD §5.5).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useSelection } from '@/stores/selection';
import { useGraph, useReport } from '@/lib/client/api';
import { Chip, EmptyState, ErrorState, ReportTypeBadge, Skeleton } from '@/lib/client/chips';
import { useEscapeLayer } from '@/hooks/useEscapeLayer';
import { ESCAPE_PRIORITY } from '@/lib/client/shortcuts';
import { formatDtgFull } from '@/lib/client/format';
import { segmentBody, type Term } from '@/lib/client/highlight';
import { selectEntity } from '@/lib/client/select';

export function ReportReader() {
  const id = useSelection((s) => s.openReportId);
  const close = useSelection((s) => s.closeReport);
  const selectedId = useSelection((s) => s.selectedId);
  const q = useReport(id);
  const graph = useGraph();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (id) panelRef.current?.focus(); }, [id]);
  useEscapeLayer(id !== null, close, ESCAPE_PRIORITY.reader);

  const nodeById = useMemo(() => new Map((graph.data?.nodes ?? []).map((n) => [n.id, n])), [graph.data]);
  const terms = useMemo<Term[]>(() => {
    if (!q.data) return [];
    return q.data.links
      .filter((l) => l.objectType === 'entity')
      .map((l) => {
        const n = nodeById.get(l.objectId);
        return { id: l.objectId, names: n ? [n.name, ...n.aliases] : l.name ? [l.name] : [] };
      });
  }, [q.data, nodeById]);
  const segments = useMemo(() => (q.data ? segmentBody(q.data.body, terms) : []), [q.data, terms]);

  if (!id) return null;
  const r = q.data;
  const eventLinks = r?.links.filter((l) => l.objectType === 'event') ?? [];
  const relLinks = r?.links.filter((l) => l.objectType === 'relationship') ?? [];

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={`Report ${id}`}
      tabIndex={-1}
      data-testid="report-reader"
      className="panel absolute bottom-1 right-1 top-1 z-30 flex w-[560px] max-w-[calc(100%-8px)] flex-col overflow-hidden shadow-xl shadow-black/60 outline-none"
    >
      <div className="flex h-5 shrink-0 items-center justify-center bg-banner font-mono text-[10px] font-bold tracking-[0.18em] text-[#1a0d02]">
        {r?.marking ?? 'EXERCISE – FICTIONAL DATA'}
      </div>
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted">
            <span className="text-text">{id}</span>
            {r && <ReportTypeBadge type={r.type} />}
            {r && <span>{formatDtgFull(r.reportedAt)}</span>}
            {r && <span title="Source reliability / information credibility">{r.sourceReliability}{r.infoCredibility}</span>}
            {r?.eventAt && <span title="Event time">evt {formatDtgFull(r.eventAt)}</span>}
          </div>
          {r && <h2 className="mt-0.5 text-[13px] font-semibold leading-snug text-text" data-testid="report-title">{r.title}</h2>}
        </div>
        <button type="button" onClick={close} aria-label="Close report" className="shrink-0 rounded px-1.5 font-mono text-[11px] text-muted hover:bg-panel-2 hover:text-text">ESC ×</button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {q.isPending && <Skeleton rows={10} testId="reader-loading" />}
        {q.error && <ErrorState error={q.error} retry={() => void q.refetch()} retrying={q.isFetching} testId="reader-error" />}
        {r && !q.error && !r.body.trim() && <EmptyState testId="reader-empty">This report has no body text.</EmptyState>}
        {r && !q.error && r.body.trim() && (
          <p className="whitespace-pre-wrap text-[12px] leading-[1.55] text-text" data-testid="report-body">
            {segments.map((s, i) => s.entityId ? (
              <mark
                key={i}
                role="button"
                tabIndex={0}
                data-entity-id={s.entityId}
                onClick={() => selectEntity(s.entityId!)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectEntity(s.entityId!); } }}
                className={'cursor-pointer rounded-sm px-0.5 ' + (selectedId === s.entityId ? 'bg-concord/40 text-white' : 'bg-concord/15 text-concord hover:bg-concord/30')}
              >{s.text}</mark>
            ) : <span key={i}>{s.text}</span>)}
          </p>
        )}
      </div>

      {r && (
        <footer className="shrink-0 border-t border-border px-3 py-1.5 text-[10px]">
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-mono tracking-wider text-muted">ENTITIES</span>
            {terms.length === 0 && <span className="text-muted">none</span>}
            {terms.map((t) => <Chip key={t.id} active={selectedId === t.id} onClick={() => selectEntity(t.id)}>{nodeById.get(t.id)?.name ?? t.id}</Chip>)}
          </div>
          {(eventLinks.length > 0 || relLinks.length > 0) && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="font-mono tracking-wider text-muted">LINKED</span>
              {eventLinks.map((l) => <Chip key={l.objectId} mono title={l.excerpt} onClick={() => useSelection.getState().select('event', l.objectId)}>evt · {l.name ?? l.objectId}</Chip>)}
              {relLinks.map((l) => <Chip key={l.objectId} mono title={l.excerpt} onClick={() => useSelection.getState().setHighlights({ edgeIds: [l.objectId] }, 'selection')}>rel · {l.objectId}</Chip>)}
            </div>
          )}
        </footer>
      )}
    </div>
  );
}

export default ReportReader;
