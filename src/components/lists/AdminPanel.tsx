'use client';

/**
 * /admin (PRD §5.11, hackathon slice): live table counts, one-click reseed
 * behind a confirm step, and the recent ingest jobs. Import/export JSON and
 * user management are marked post-hackathon in the UI rather than stubbed.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { reseedDatabase, useAdminStats, useIngestJobs, type ReseedResult } from '@/lib/client/api';
import { EmptyState, ErrorState, ReportTypeBadge, Skeleton, TypeBadge } from '@/lib/client/chips';
import { formatDtgFull } from '@/lib/client/format';
import { PageFrame, buttonClass, dangerButtonClass } from './PageFrame';

const STAT_LABEL: Record<string, string> = {
  factions: 'Factions', entities: 'Entities', relationships: 'Relationships', reports: 'Reports', events: 'Events',
  report_links: 'Report links', event_entities: 'Event participants', ingest_jobs: 'Ingest jobs', briefs: 'Briefs',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'text-cartel border-cartel/40', reviewed: 'text-concord border-concord/40', committed: 'text-emerald-400 border-emerald-400/40', discarded: 'text-muted border-border',
};

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-b border-border px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="font-mono text-[10px] font-semibold tracking-[0.18em] text-muted">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function AdminPanel() {
  const stats = useAdminStats();
  const jobs = useIngestJobs();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReseedResult | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function reseed() {
    setBusy(true); setError(null); setResult(null);
    try {
      setResult(await reseedDatabase());
      await qc.invalidateQueries(); // every cached list is stale after a wipe
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false); setConfirming(false);
    }
  }

  return (
    <PageFrame title="ADMIN" subtitle={stats.data ? `${stats.data.driver} · ${stats.data.model ?? 'no model configured'}` : undefined} testId="admin-page">
      <Section title="DATABASE" aside={<button type="button" className="text-[10px] text-muted hover:text-text" onClick={() => void stats.refetch()}>refresh</button>}>
        {stats.isPending && <Skeleton rows={3} testId="admin-stats-loading" />}
        {stats.error && <ErrorState error={stats.error} retry={() => void stats.refetch()} retrying={stats.isFetching} testId="admin-stats-error" className="mx-0!" />}
        {!stats.error && stats.data && Object.values(stats.data.counts).every((n) => n === 0) && (
          <EmptyState testId="admin-stats-empty" className="px-0! pt-0!">Every table is empty. Use “Reset and reseed scenario” below to load the seed.</EmptyState>
        )}
        {!stats.error && stats.data && (
          <>
            <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-5" data-testid="stats-grid">
              {Object.entries(stats.data.counts).map(([k, n]) => (
                <div key={k} className="rounded-sm border border-border bg-panel px-2 py-1.5" data-testid={`stat-${k}`} data-value={n}>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-muted">{STAT_LABEL[k] ?? k}</div>
                  <div className="font-mono text-[16px] text-text">{n}</div>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 font-mono text-[10px] text-muted">
              <span>newest report: <span className="text-text" data-testid="newest-report-at">{stats.data.newestReportAt ? formatDtgFull(stats.data.newestReportAt) : '—'}</span></span>
              <span>
                ingest by status:{' '}
                {Object.keys(stats.data.ingestByStatus).length === 0 ? <span className="text-text">none</span> : Object.entries(stats.data.ingestByStatus).map(([s, n]) => <span key={s} className="mr-1.5 text-text">{s} {n}</span>)}
              </span>
            </div>
          </>
        )}
      </Section>

      <Section title="SCENARIO">
        <p className="mb-1.5 max-w-prose text-[11px] text-muted">
          Wipes every table and reloads <span className="font-mono">data/seed/*.json</span> in one transaction. Ingested reports, entities, events and briefs are lost.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {!confirming ? (
            <button type="button" className={dangerButtonClass} onClick={() => setConfirming(true)} disabled={busy} data-testid="reseed">Reset and reseed scenario</button>
          ) : (
            <>
              <span className="text-[11px] text-hegemony">This deletes everything not in the seed. Continue?</span>
              <button type="button" className={dangerButtonClass} onClick={() => void reseed()} disabled={busy} data-testid="reseed-confirm">{busy ? 'Reseeding…' : 'Yes, reseed now'}</button>
              <button type="button" className={buttonClass} onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
            </>
          )}
        </div>
        {error !== null && <ErrorState error={error} title="RESEED FAILED" testId="admin-reseed-error" className="mx-0!" />}
        {result && (
          <div className="mt-1.5 rounded-sm border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 font-mono text-[10px] text-text" role="status" data-testid="reseed-result">
            reseeded in {result.ms} ms · {Object.entries(result.counts).map(([k, n]) => `${k} ${n}`).join(' · ')}
          </div>
        )}
      </Section>

      <Section title="RECENT INGEST JOBS" aside={<Link href="/ingest" className="text-[10px] text-concord hover:underline">New ingest →</Link>}>
        {jobs.isPending && <Skeleton rows={3} testId="admin-jobs-loading" />}
        {jobs.error && <ErrorState error={jobs.error} retry={() => void jobs.refetch()} retrying={jobs.isFetching} testId="admin-jobs-error" className="mx-0!" />}
        {!jobs.error && jobs.data && jobs.data.length === 0 && <EmptyState testId="admin-jobs-empty" className="px-0!">No ingest jobs yet. Start one from “New ingest”.</EmptyState>}
        {!jobs.error && jobs.data && jobs.data.length > 0 && (
          <table className="w-full border-collapse text-[11px]" data-testid="jobs-table">
            <tbody>
              {jobs.data.map((j) => (
                <tr key={j.id} className="border-b border-border/60" data-testid="job-row" data-status={j.status}>
                  <td className="w-40 px-1 py-1 font-mono text-[10px] text-muted">
                    <Link href={`/ingest?job=${encodeURIComponent(j.id)}`} className="hover:text-concord">{j.id}</Link>
                  </td>
                  <td className="w-20 px-1 py-1"><TypeBadge className={STATUS_CLASS[j.status] ?? ''}>{j.status}</TypeBadge></td>
                  <td className="w-20 px-1 py-1"><ReportTypeBadge type={j.reportType} /></td>
                  <td className="max-w-0 truncate px-1 py-1 text-text" title={j.title ?? j.error ?? ''}>{j.title ?? (j.error ? <span className="text-hegemony">{j.error}</span> : <span className="text-muted">(no extraction)</span>)}</td>
                  <td className="w-16 px-1 py-1 font-mono text-[10px] text-muted">{j.reportId ?? `${j.chars} ch`}</td>
                  <td className="w-32 px-1 py-1 font-mono text-[10px] text-muted">{formatDtgFull(j.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="POST-HACKATHON">
        <div className="grid grid-cols-1 gap-1.5 md:grid-cols-3">
          {[
            ['Import / export JSON', 'Round-trip the whole scenario as files.'],
            ['Users and roles', 'One shared password today (BUILD.md §2).'],
            ['Audit log', 'Logins, AI queries, edits, exports.'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-sm border border-dashed border-border px-2 py-1.5 opacity-70">
              <div className="text-[11px] text-text">{t}</div>
              <div className="text-[10px] text-muted">{d}</div>
              <TypeBadge className="mt-1">post-hackathon</TypeBadge>
            </div>
          ))}
        </div>
      </Section>
    </PageFrame>
  );
}
