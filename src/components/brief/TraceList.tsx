'use client';

/**
 * The investigation trace as the brief drafter shows it. Same look as the
 * analyst panel's trace block (which is not exported), fed by the same events.
 */
import type { AgentEvent } from '@/lib/ai/agent';

export interface TraceStep {
  step: number;
  tool: string;
  label: string;
  status: 'start' | 'ok' | 'error';
  ms?: number;
  summary?: string;
}

/** Fold one event into the list: an ok/error replaces its own start row. Pure. */
export function foldTrace(trace: TraceStep[], ev: AgentEvent): TraceStep[] {
  if (ev.type !== 'trace') return trace;
  const next = [...trace];
  const i = ev.status === 'start' ? -1 : next.findLastIndex((t) => t.status === 'start' && t.tool === ev.tool && t.step === ev.step);
  const row: TraceStep = { step: ev.step, tool: ev.tool, label: ev.label, status: ev.status, ms: ev.ms, summary: ev.summary };
  if (i >= 0) next[i] = row; else next.push(row);
  return next;
}

const DOT: Record<TraceStep['status'], string> = {
  start: 'bg-muted animate-pulse',
  ok: 'bg-concord',
  error: 'bg-hegemony',
};

export function TraceList({ trace, live, title = 'Drafting trace' }: { trace: TraceStep[]; live: boolean; title?: string }) {
  if (!trace.length && !live) return null;
  return (
    <div className="rounded border border-border bg-panel-2/60 text-[11px]" data-testid="brief-trace" data-live={live || undefined}>
      <div className="flex items-center justify-between px-2 py-1 text-muted">
        <span>{title} · {trace.length} {trace.length === 1 ? 'step' : 'steps'}</span>
        {live && <span className="font-mono text-[10px] text-concord">RUNNING</span>}
      </div>
      <ol className="px-2 pb-1.5">
        {trace.length === 0 && <li className="py-0.5 text-muted">Thinking…</li>}
        {trace.map((t, i) => (
          <li key={i} className="flex items-baseline gap-2 py-0.5">
            <span className={`inline-block h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${DOT[t.status]}`} aria-label={t.status} />
            <span className="min-w-0 flex-1 truncate text-text" title={t.label}>{t.label}</span>
            {t.summary && <span className={'shrink-0 truncate max-w-[40%] ' + (t.status === 'error' ? 'text-hegemony' : 'text-muted')} title={t.summary}>{t.summary}</span>}
            {t.ms !== undefined && <span className="shrink-0 font-mono text-muted">{t.ms}ms</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
