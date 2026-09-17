'use client';

/**
 * /reports (PRD §5.5): every report, sortable, filterable by type, full-text
 * searchable, 25 per page. Rows open the reader in place.
 *
 * Sorting: the API orders by recency (or FTS rank when searching) and pages
 * server-side. Any other sort fetches the whole set (API cap 200; the seed is
 * 80) once and sorts + pages in memory, so a column sort is a true sort over
 * everything, not just the visible page.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSelection } from '@/stores/selection';
import { useReports } from '@/lib/client/api';
import { EmptyState, ErrorState, ReportTypeBadge, Skeleton } from '@/lib/client/chips';
import { formatDtgFull } from '@/lib/client/format';
import type { ReportSummary } from '@/lib/types';
import { PageFrame, TH, FilterChip, inputClass, buttonClass } from './PageFrame';

const REPORT_TYPES = ['SIGINT', 'HUMINT', 'IMINT', 'OSINT', 'FINANCIAL', 'TRACKING'] as const;
const PAGE = 25;
const ALL_CAP = 200;

type SortKey = 'reportedAt' | 'type' | 'reliability';
type Dir = 'asc' | 'desc';

const RELIABILITY_ORDER = 'ABCDEF';
const gradeRank = (r: ReportSummary) => RELIABILITY_ORDER.indexOf(r.sourceReliability) * 10 + r.infoCredibility;

function sortRows(rows: ReportSummary[], key: SortKey, dir: Dir): ReportSummary[] {
  const s = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === 'reportedAt') return s * (Date.parse(a.reportedAt) - Date.parse(b.reportedAt)) || a.reportNumber.localeCompare(b.reportNumber);
    if (key === 'type') return s * a.type.localeCompare(b.type) || Date.parse(b.reportedAt) - Date.parse(a.reportedAt);
    return s * (gradeRank(a) - gradeRank(b)) || Date.parse(b.reportedAt) - Date.parse(a.reportedAt);
  });
}

export function ReportsTable() {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: 'reportedAt', dir: 'desc' });
  const [page, setPage] = useState(0);
  const openReport = useSelection((s) => s.openReport);
  const openReportId = useSelection((s) => s.openReportId);

  useEffect(() => { const t = window.setTimeout(() => setQ(input.trim()), 300); return () => window.clearTimeout(t); }, [input]);
  useEffect(() => { setPage(0); }, [q, types, sort]);

  // Server order is recency (or rank when searching): page on the server. Otherwise sort the whole set here.
  const serverPaged = sort.key === 'reportedAt' && sort.dir === 'desc';
  const query = useReports(serverPaged
    ? { q: q || undefined, type: types, limit: PAGE, offset: page * PAGE }
    : { q: q || undefined, type: types, limit: ALL_CAP, offset: 0 });

  const rows = useMemo(() => {
    if (!query.data) return [];
    return serverPaged ? query.data.reports : sortRows(query.data.reports, sort.key, sort.dir).slice(page * PAGE, page * PAGE + PAGE);
  }, [query.data, serverPaged, sort, page]);
  const total = query.data?.total ?? 0;
  const sortedSetSize = serverPaged ? total : Math.min(total, ALL_CAP);
  const pages = Math.max(1, Math.ceil(sortedSetSize / PAGE));

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'reportedAt' ? 'desc' : 'asc' }));
  const toggleType = (t: string) => setTypes((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));

  return (
    <PageFrame title="REPORTS" subtitle={query.data ? `${total} report${total === 1 ? '' : 's'}${q ? ` matching “${q}”` : ''}` : undefined} testId="reports-page">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Full-text search (e.g. transponder, LANTERN)"
          aria-label="Search reports"
          data-testid="reports-search"
          className={inputClass + ' w-72'}
        />
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Report type filter">
          {REPORT_TYPES.map((t) => <FilterChip key={t} active={types.includes(t)} onClick={() => toggleType(t)} testId={`type-chip-${t}`}>{t}</FilterChip>)}
          {types.length > 0 && <button type="button" onClick={() => setTypes([])} className="text-[10px] text-muted hover:text-text">clear</button>}
        </div>
        {!serverPaged && total > ALL_CAP && <span className="text-[10px] text-cartel">Sorting the newest {ALL_CAP} of {total}.</span>}
      </div>

      {query.isPending && <Skeleton rows={12} testId="reports-loading" />}
      {query.error && <ErrorState error={query.error} retry={() => void query.refetch()} retrying={query.isFetching} testId="reports-error" />}
      {!query.error && query.data && rows.length === 0 && (
        <EmptyState
          testId="reports-empty"
          action={q || input || types.length ? { label: 'Clear search and filters', onClick: () => { setInput(''); setQ(''); setTypes([]); }, testId: 'reports-clear' } : undefined}
        >
          {q || types.length
            ? <>No reports match{q ? ` “${q}”` : ''}{types.length ? ` in ${types.join(', ')}` : ''}.</>
            : <>No reports in the database yet. Ingest one from the Ingest page, or reseed the scenario from Admin.</>}
        </EmptyState>
      )}
      {!query.error && query.data && rows.length > 0 && (
        <table className="w-full border-collapse text-[11px]" data-testid="reports-table" data-row-count={rows.length}>
          <thead>
            <tr>
              <TH className="w-16">No.</TH>
              <TH className="w-20" onClick={() => toggleSort('type')} active={sort.key === 'type'} dir={sort.dir}>Type</TH>
              <TH>Title</TH>
              <TH className="w-14" onClick={() => toggleSort('reliability')} active={sort.key === 'reliability'} dir={sort.dir}>Grade</TH>
              <TH className="w-32" onClick={() => toggleSort('reportedAt')} active={sort.key === 'reportedAt'} dir={sort.dir}>Reported</TH>
              <TH className="w-32">Event</TH>
              <TH className="w-12 text-right">Ents</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                data-testid="report-row"
                data-report={r.reportNumber}
                aria-current={openReportId === r.reportNumber ? 'true' : undefined}
                onClick={() => openReport(r.reportNumber)}
                className={'cursor-pointer border-b border-border/60 hover:bg-panel-2 ' + (openReportId === r.reportNumber ? 'bg-panel-2' : '')}
              >
                <td className="px-2 py-1 font-mono text-[10px] text-muted">
                  <button type="button" className="hover:text-concord" onClick={(e) => { e.stopPropagation(); openReport(r.reportNumber); }}>{r.reportNumber}</button>
                </td>
                <td className="px-2 py-1"><ReportTypeBadge type={r.type} /></td>
                <td className="max-w-0 truncate px-2 py-1 text-text" title={r.title}>{r.title}</td>
                <td className="px-2 py-1 font-mono text-[10px] text-muted" title="Source reliability / information credibility">{r.sourceReliability}{r.infoCredibility}</td>
                <td className="px-2 py-1 font-mono text-[10px] text-muted">{formatDtgFull(r.reportedAt)}</td>
                <td className="px-2 py-1 font-mono text-[10px] text-muted">{r.eventAt ? formatDtgFull(r.eventAt) : '—'}</td>
                <td className="px-2 py-1 text-right font-mono text-[10px] text-muted">{r.entityIds.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!query.error && query.data && total > 0 && (
        <div className="sticky bottom-0 flex items-center justify-between border-t border-border bg-panel px-3 py-1 font-mono text-[10px] text-muted">
          <span>{page * PAGE + 1}–{Math.min(sortedSetSize, page * PAGE + rows.length)} of {total}</span>
          <span className="flex items-center gap-2">
            <button type="button" className={buttonClass} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span>page {page + 1} / {pages}</span>
            <button type="button" className={buttonClass} disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
          </span>
        </div>
      )}
    </PageFrame>
  );
}
