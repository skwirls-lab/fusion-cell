'use client';

/** Live report feed (PRD §5.5): /api/reports polled every 3s, newest first. */
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useSelection } from '@/stores/selection';
import { useGraph, useReports } from '@/lib/client/api';
import { EmptyState, ErrorState, ReportTypeBadge, Skeleton } from '@/lib/client/chips';
import { formatDtg } from '@/lib/client/format';
import { prefersReducedMotion } from '@/lib/client/motion';
import styles from './feed.module.css';

const POLL_MS = 3000;
const LIMIT = 30;
const GLOW_MS = 2000;

export function FeedView() {
  const reportTypes = useSelection((s) => s.filters.reportTypes);
  const from = useSelection((s) => s.filters.from);
  const to = useSelection((s) => s.filters.to);
  const openReportId = useSelection((s) => s.openReportId);
  const openReport = useSelection((s) => s.openReport);
  const q = useReports({ limit: LIMIT, type: reportTypes, from: from ?? undefined, to: to ?? undefined, refetchInterval: POLL_MS });
  const graph = useGraph();
  const nameOf = useMemo(() => new Map((graph.data?.nodes ?? []).map((n) => [n.id, n.name])), [graph.data]);

  // Rows not seen on a previous poll glow for GLOW_MS. The first page never glows.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const rows = q.data?.reports;
    if (!rows) return;
    if (seen.current === null) { seen.current = new Set(rows.map((r) => r.id)); return; }
    const added = rows.filter((r) => !seen.current!.has(r.id)).map((r) => r.id);
    for (const id of added) seen.current.add(id);
    if (!added.length || prefersReducedMotion()) return;
    setFresh((s) => new Set([...s, ...added]));
    const t = window.setTimeout(() => setFresh((s) => { const n = new Set(s); for (const id of added) n.delete(id); return n; }), GLOW_MS);
    return () => window.clearTimeout(t);
  }, [q.data]);

  if (q.isPending) return <Skeleton rows={6} />;
  if (q.error) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  const rows = q.data.reports;
  if (rows.length === 0) return <EmptyState>No reports match the current filters.</EmptyState>;

  return (
    <div data-testid="feed" data-row-count={rows.length} data-total={q.data.total}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-panel px-2 py-0.5 font-mono text-[9px] tracking-wider text-muted">
        <span>{rows.length} of {q.data.total} · newest first</span>
        <span className={clsx('flex items-center gap-1', q.isFetching && 'text-concord')}>
          <span aria-hidden="true" className={clsx('inline-block h-1.5 w-1.5 rounded-full', q.isFetching ? 'bg-concord' : 'bg-muted/50')} />
          {q.isFetching ? 'POLLING' : `LIVE · ${POLL_MS / 1000}s`}
        </span>
      </div>
      <ol>
        {rows.map((r) => {
          const names = r.entityIds.slice(0, 3).map((id) => nameOf.get(id) ?? id);
          const extra = r.entityIds.length - names.length;
          return (
            <li key={r.id} className={clsx('feed-row', fresh.has(r.id) && `feed-new ${styles.feedNew}`)} data-report={r.reportNumber} data-reported-at={r.reportedAt}>
              <button
                type="button"
                onClick={() => openReport(r.reportNumber)}
                aria-current={openReportId === r.reportNumber ? 'true' : undefined}
                className={clsx('grid w-full grid-cols-[56px_54px_1fr_auto] items-center gap-x-2 border-b border-border/60 px-2 py-1 text-left hover:bg-panel-2', openReportId === r.reportNumber && 'bg-panel-2')}
              >
                <ReportTypeBadge type={r.type} className="justify-self-start" />
                <span className="font-mono text-[10px] text-muted">{r.reportNumber}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] text-text">{r.title}</span>
                  <span className="flex flex-wrap gap-1 pt-0.5">
                    {names.map((n, i) => (
                      <span key={r.entityIds[i]} className="rounded-sm border border-border px-1 text-[9px] leading-[13px] text-muted">{n}</span>
                    ))}
                    {extra > 0 && <span className="text-[9px] leading-[13px] text-muted">+{extra}</span>}
                  </span>
                </span>
                <span className="flex flex-col items-end font-mono text-[10px] text-muted">
                  <span>{formatDtg(r.reportedAt)}</span>
                  <span title="Source reliability / information credibility">{r.sourceReliability}{r.infoCredibility}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default FeedView;
