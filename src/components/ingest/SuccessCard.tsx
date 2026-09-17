'use client';

/**
 * Step 3 of ingest: what the commit wrote, what it skipped and why, and the
 * two hand-offs — open the new report in the reader here, or jump to the
 * workspace with the first new/linked entity selected (cross-highlighted on
 * the map and chart).
 */
import Link from 'next/link';
import { useSelection } from '@/stores/selection';
import type { IngestJobOut, CommitResult } from '@/lib/client/api';
import { Chip, ReportTypeBadge } from '@/lib/client/chips';
import { buttonClass, primaryButtonClass } from '@/components/lists/PageFrame';

export function SuccessCard({ job, result, onReset }: { job: IngestJobOut; result: CommitResult; onReset: () => void }) {
  const openReport = useSelection((s) => s.openReport);
  const first = result.created.entities[0] ?? result.linked[0] ?? null;
  const resumed = result.created.entities.length === 0 && result.linked.length === 0 && result.skipped.length === 0 && job.status === 'committed';

  return (
    <div className="mx-auto max-w-3xl px-3 py-4" data-testid="ingest-success">
      <div className="rounded-sm border border-emerald-400/40 bg-emerald-400/5 p-3">
        <div className="font-mono text-[10px] tracking-[0.18em] text-emerald-400">COMMITTED</div>
        <h2 className="mt-1 text-[16px] font-semibold text-text">
          Report <span className="font-mono" data-testid="new-report-number">{result.reportNumber}</span>
          <ReportTypeBadge type={job.reportType} className="ml-2 align-middle" />
        </h2>
        {resumed ? (
          <p className="mt-1 text-[12px] text-muted">This job was committed earlier. The report is in the feed and the lists.</p>
        ) : (
          <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]" data-testid="commit-counts">
            <div className="rounded-sm border border-border bg-panel px-2 py-1">
              <dt className="font-mono text-[9px] uppercase tracking-wider text-muted">Entities</dt>
              <dd className="font-mono text-[14px] text-text" data-testid="count-entities">{result.created.entities.length} new <span className="text-muted">· {result.linked.length} linked</span></dd>
            </div>
            <div className="rounded-sm border border-border bg-panel px-2 py-1">
              <dt className="font-mono text-[9px] uppercase tracking-wider text-muted">Relationships</dt>
              <dd className="font-mono text-[14px] text-text" data-testid="count-relationships">{result.created.relationships.length}</dd>
            </div>
            <div className="rounded-sm border border-border bg-panel px-2 py-1">
              <dt className="font-mono text-[9px] uppercase tracking-wider text-muted">Events</dt>
              <dd className="font-mono text-[14px] text-text" data-testid="count-events">{result.created.events.length}</dd>
            </div>
          </dl>
        )}

        {(result.created.entities.length > 0 || result.linked.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px]">
            <span className="font-mono tracking-wider text-muted">ENTITIES</span>
            {result.created.entities.map((e) => <Chip key={e.id} title={`${e.id} (new)`} active>{e.name}</Chip>)}
            {result.linked.map((e) => <Chip key={e.id} title={`${e.id} (linked)`}>{e.name}</Chip>)}
          </div>
        )}

        {result.skipped.length > 0 && (
          <div className="mt-2 rounded-sm border border-cartel/40 bg-cartel/10 px-2 py-1.5 text-[11px]" data-testid="skipped">
            <div className="font-mono text-[10px] tracking-wider text-cartel">SKIPPED {result.skipped.length}</div>
            <ul className="mt-0.5 list-disc pl-4 text-text/90">
              {result.skipped.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {first ? (
            <Link href={`/?sel=${encodeURIComponent(`entity:${first.id}`)}`} className={primaryButtonClass} data-testid="open-workspace">Open in workspace → {first.name}</Link>
          ) : (
            <Link href="/" className={primaryButtonClass} data-testid="open-workspace">Open workspace</Link>
          )}
          <button type="button" className={buttonClass} onClick={() => openReport(result.reportNumber)} data-testid="open-report">Open report</button>
          <Link href="/reports" className={buttonClass}>Reports list</Link>
          <button type="button" className={buttonClass + ' ml-auto'} onClick={onReset}>Ingest another</button>
        </div>
      </div>
    </div>
  );
}
