'use client';

/**
 * /ingest (PRD §5.7): paste or upload → extract (POST /api/ingest) → review
 * every extraction with its match suggestion → commit in one transaction.
 * `?job=<id>` resumes a stored job (the URL is updated as soon as a job
 * exists, so a refresh mid-review loses nothing).
 */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, submitIngest, useIngestJob, discardIngestJob, commitIngestJob, type IngestJobOut, type CommitResult, type IngestDecisions } from '@/lib/client/api';
import { ErrorState, ReportTypeBadge, Skeleton } from '@/lib/client/chips';
import { PageFrame, buttonClass, primaryButtonClass, selectClass } from '@/components/lists/PageFrame';
import { ReviewPanel } from './ReviewPanel';
import { SuccessCard } from './SuccessCard';

const REPORT_TYPES = ['SIGINT', 'HUMINT', 'IMINT', 'OSINT', 'FINANCIAL', 'TRACKING'] as const;
const MIN = 20;
const MAX = 20_000;

type Phase =
  | { step: 'compose' }
  | { step: 'extracting' }
  | { step: 'review'; job: IngestJobOut }
  | { step: 'done'; job: IngestJobOut; result: CommitResult };

const errorMessage = (e: unknown): string => {
  if (e instanceof ApiRequestError) {
    const b = e.body as { message?: unknown; error?: unknown } | null;
    if (b && typeof b.message === 'string') return b.message;
    if (b && typeof b.error === 'string') return `${b.error} (${e.status})`;
  }
  return e instanceof Error ? e.message : String(e);
};

function setJobParam(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('job', id); else url.searchParams.delete('job');
  window.history.replaceState(window.history.state, '', url);
}

export function IngestFlow() {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ step: 'compose' });
  const [text, setText] = useState('');
  const [reportType, setReportType] = useState<(typeof REPORT_TYPES)[number]>('HUMINT');
  const [error, setError] = useState<string | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Resume: read ?job= once on mount (window is the source of truth; no Suspense boundary needed).
  useEffect(() => { setResumeId(new URLSearchParams(window.location.search).get('job')); }, []);
  const resumed = useIngestJob(resumeId);
  // Hydrate once per job: after a commit the cache is invalidated and the job refetches as
  // 'committed', which must not replace the success card (with its counts) by the resume variant.
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    const job = resumed.data;
    if (!job || hydratedRef.current === job.id) return;
    hydratedRef.current = job.id;
    setText(job.rawText);
    setReportType(job.reportType);
    if (job.status === 'reviewed' && job.extraction?.extraction) setPhase({ step: 'review', job });
    else if (job.status === 'committed') setPhase({ step: 'done', job, result: { reportNumber: job.reportId ?? '?', reportId: job.reportId ?? '?', created: { entities: [], relationships: [], events: [] }, linked: [], skipped: [] } });
    else {
      setPhase({ step: 'compose' });
      if (job.status === 'discarded') setError('This job was discarded. Edit the text and extract again to start a new one.');
      else if (job.extraction?.error) setError(job.extraction.error);
    }
  }, [resumed.data]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      setText((await file.text()).slice(0, MAX));
      setError(null);
    } catch (e) {
      setError(`Could not read ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function extract() {
    setError(null);
    setPhase({ step: 'extracting' });
    try {
      const job = await submitIngest({ rawText: text, reportType });
      setJobParam(job.id);
      setPhase({ step: 'review', job });
    } catch (e) {
      const b = e instanceof ApiRequestError ? (e.body as { jobId?: unknown } | null) : null;
      if (b && typeof b.jobId === 'string') setJobParam(b.jobId);
      setError(errorMessage(e));
      setPhase({ step: 'compose' });
    }
  }

  async function commit(job: IngestJobOut, decisions: IngestDecisions) {
    setError(null);
    const result = await commitIngestJob(job.id, decisions);
    await qc.invalidateQueries(); // the feed, map, graph and lists all changed
    setPhase({ step: 'done', job, result });
  }

  async function discard(job: IngestJobOut) {
    setError(null);
    try {
      await discardIngestJob(job.id);
      setJobParam(null);
      setPhase({ step: 'compose' });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function reset() {
    setJobParam(null);
    setResumeId(null);
    hydratedRef.current = null;
    setText('');
    setError(null);
    setPhase({ step: 'compose' });
  }

  const chars = text.length;
  const canExtract = chars >= MIN && chars <= MAX && phase.step === 'compose';
  const stepIndex = phase.step === 'compose' || phase.step === 'extracting' ? 1 : phase.step === 'review' ? 2 : 3;

  return (
    <PageFrame
      title="INGEST"
      subtitle="Paste a report, review the AI's extraction, commit it to the picture."
      testId="ingest-page"
      actions={<Steps current={stepIndex} />}
    >
      {resumeId && resumed.isPending && <Skeleton rows={6} testId="ingest-job-loading" />}
      {resumeId && resumed.error && (
        <div data-testid="ingest-job-error-wrap">
          <ErrorState error={resumed.error} retry={() => void resumed.refetch()} retrying={resumed.isFetching} title={`COULD NOT LOAD JOB ${resumeId}`} testId="ingest-job-error" />
          <p className="px-3 text-[11px] text-muted">
            Retry, or <button type="button" onClick={reset} data-testid="ingest-job-start-over" className="text-concord hover:underline">start a new ingest</button> below.
          </p>
        </div>
      )}

      {(phase.step === 'compose' || phase.step === 'extracting') && !(resumeId && resumed.isPending) && (
        <div className="mx-auto flex max-w-4xl flex-col gap-2 px-3 py-3" data-testid="ingest-compose">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-muted">
              Report type
              <select value={reportType} onChange={(e) => setReportType(e.target.value as (typeof REPORT_TYPES)[number])} className={selectClass} aria-label="Report type" disabled={phase.step === 'extracting'}>
                {REPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <ReportTypeBadge type={reportType} />
            <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Upload a .txt or .md file" />
            <button type="button" className={buttonClass} onClick={() => fileRef.current?.click()} disabled={phase.step === 'extracting'}>Upload .txt / .md</button>
            <span className="ml-auto font-mono text-[10px] text-muted" data-testid="char-count">{chars.toLocaleString()} / {MAX.toLocaleString()} chars{chars > 0 && chars < MIN ? ` · need ${MIN}` : ''}</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); if (error) setError(null); }}
            placeholder="Paste the raw report text here. It is treated as data: any instructions inside it are ignored by the extractor."
            aria-label="Report text"
            data-testid="ingest-text"
            disabled={phase.step === 'extracting'}
            spellCheck={false}
            className="min-h-[360px] w-full resize-y rounded border border-border bg-bg px-2 py-1.5 font-mono text-[12px] leading-[1.5] text-text placeholder:text-muted/60 focus:border-concord/60 focus:outline-none disabled:opacity-60"
          />
          {error && (
            <div role="alert" className="rounded-sm border border-hegemony/40 bg-hegemony/10 px-2 py-1.5 text-[11px]" data-testid="ingest-error">
              <div className="font-mono text-[10px] tracking-wider text-hegemony">EXTRACTION FAILED</div>
              <div className="mt-0.5 break-words text-text">{error}</div>
              <div className="mt-0.5 text-muted">Your text is kept. Fix the input, or press “Retry extraction” below.</div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button type="button" className={primaryButtonClass} onClick={() => void extract()} disabled={!canExtract} data-testid="extract">
              {phase.step === 'extracting' ? 'Extracting…' : error ? 'Retry extraction' : 'Extract'}
            </button>
            {phase.step === 'extracting' && <Progress />}
            {text && phase.step === 'compose' && <button type="button" className={buttonClass} onClick={reset}>Clear</button>}
          </div>
        </div>
      )}

      {phase.step === 'review' && (
        <ReviewPanel
          job={phase.job}
          onCommit={(d) => commit(phase.job, d)}
          onDiscard={() => void discard(phase.job)}
          error={error}
          setError={setError}
        />
      )}

      {phase.step === 'done' && <SuccessCard job={phase.job} result={phase.result} onReset={reset} />}
    </PageFrame>
  );
}

function Steps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ['Paste', 'Review', 'Commit'];
  return (
    <ol className="flex items-center gap-2 font-mono text-[10px] tracking-wider" aria-label="Ingest steps">
      {steps.map((s, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const state = n < current ? 'done' : n === current ? 'current' : 'todo';
        return (
          <li key={s} aria-current={state === 'current' ? 'step' : undefined} className={'flex items-center gap-1 ' + (state === 'current' ? 'text-concord' : state === 'done' ? 'text-text' : 'text-muted')}>
            <span className={'inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px] ' + (state === 'current' ? 'border-concord' : state === 'done' ? 'border-text' : 'border-border')}>{state === 'done' ? '✓' : n}</span>
            {s}
          </li>
        );
      })}
    </ol>
  );
}

/** Indeterminate progress for the model call: a skeleton line that pulses, matching the rest of the app. */
function Progress() {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted" aria-live="polite" data-testid="ingest-progress">
      <div className="h-1.5 w-32 overflow-hidden rounded-sm bg-panel-2"><div className="h-1.5 w-1/3 animate-pulse rounded-sm bg-concord" /></div>
      Calling the model and matching entities…
    </div>
  );
}
