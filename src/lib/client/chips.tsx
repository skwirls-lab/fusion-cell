'use client';

/** Small shared presentational bits: type badges, faction chips, skeleton rows, empty/error states. */
import clsx from 'clsx';
import { useFactionColors } from './api';

const REPORT_TYPE_CLASS: Record<string, string> = {
  SIGINT: 'text-concord border-concord/40',
  HUMINT: 'text-kestrel border-kestrel/40',
  IMINT: 'text-hegemony border-hegemony/40',
  OSINT: 'text-unaffiliated border-unaffiliated/40',
  FINANCIAL: 'text-cartel border-cartel/40',
  TRACKING: 'text-emerald-400 border-emerald-400/40',
};

export function ReportTypeBadge({ type, className }: { type: string; className?: string }) {
  return (
    <span className={clsx('inline-block shrink-0 rounded-sm border px-1 font-mono text-[9px] font-semibold leading-[14px] tracking-wider', REPORT_TYPE_CLASS[type] ?? 'text-muted border-border', className)}>
      {type}
    </span>
  );
}

export function TypeBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-block shrink-0 rounded-sm border border-border bg-panel-2 px-1 font-mono text-[9px] uppercase leading-[14px] tracking-wider text-muted', className)}>
      {children}
    </span>
  );
}

export function FactionDot({ factionId, className }: { factionId: string | null | undefined; className?: string }) {
  const colors = useFactionColors();
  const color = (factionId && colors.get(factionId)) || '#9ca3af';
  return <span aria-hidden="true" className={clsx('inline-block h-2 w-2 shrink-0 rounded-full', className)} style={{ backgroundColor: color }} />;
}

export function FactionChip({ factionId, name }: { factionId: string | null; name?: string | null }) {
  const colors = useFactionColors();
  const color = (factionId && colors.get(factionId)) || '#9ca3af';
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-[10px]" style={{ borderColor: `${color}66`, color }}>
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name ?? factionId ?? 'Unaffiliated'}
    </span>
  );
}

/** A clickable chip — entity names, report numbers. */
export function Chip({ children, onClick, mono, title, className, active }: {
  children: React.ReactNode; onClick?: () => void; mono?: boolean; title?: string; className?: string; active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={clsx(
        'inline-flex max-w-full items-center truncate rounded-sm border px-1.5 py-px text-[10px] leading-[16px] transition-colors',
        active ? 'border-concord/60 bg-concord/10 text-concord' : 'border-border bg-panel-2 text-text hover:border-concord/50 hover:text-concord',
        mono && 'font-mono',
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---- panel states -------------------------------------------------------------------
// Every data-driven panel has three states besides "has rows", each with a stable test id:
//   <Skeleton testId="x-loading">, <EmptyState testId="x-empty">, <ErrorState testId="x-error">.
// They are mutually exclusive: render at most one, and never next to stale rows.

export function Skeleton({ rows = 4, className, testId }: { rows?: number; className?: string; testId?: string }) {
  return (
    <div className={clsx('flex flex-col gap-1.5 p-2', className)} role="status" aria-busy="true" aria-label="Loading" data-testid={testId} data-state="loading">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-3 animate-pulse rounded-sm bg-panel-2" style={{ width: `${70 + ((i * 37) % 30)}%` }} />
      ))}
    </div>
  );
}

/** One-line loading text for places a skeleton does not fit (dropdowns, toolbars). */
export function LoadingLine({ children = 'Loading…', className, testId }: { children?: React.ReactNode; className?: string; testId?: string }) {
  return <div role="status" aria-busy="true" data-testid={testId} data-state="loading" className={clsx('animate-pulse text-[11px] text-muted', className)}>{children}</div>;
}

/** Query succeeded, nothing to show. `action` is the way out (reset filters, clear search…). */
export function EmptyState({ children, testId, action, className }: { children: React.ReactNode; testId?: string; action?: { label: string; onClick: () => void; testId?: string }; className?: string }) {
  return (
    <div className={clsx('px-3 py-4 text-[12px] text-muted', className)} data-testid={testId} data-state="empty">
      {children}
      {action && (
        <div className="mt-1.5">
          <button type="button" onClick={action.onClick} data-testid={action.testId} className="rounded-sm border border-border px-1.5 py-px text-[11px] text-text hover:border-concord/50 hover:text-concord">
            {action.label}
          </button>
        </div>
      )}
    </div>
  );
}

/** The message a person should read: the API's typed `message` when there is one, else the Error's. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ErrorState({ error, retry, testId, title = 'LOAD FAILED', retrying, className }: {
  error: unknown; retry?: () => void; testId?: string; title?: string; retrying?: boolean; className?: string;
}) {
  return (
    <div role="alert" data-testid={testId} data-state="error" className={clsx('m-2 rounded-sm border border-hegemony/40 bg-hegemony/10 px-2 py-1.5 text-[11px] text-text', className)}>
      <div className="font-mono text-[10px] tracking-wider text-hegemony">{title}</div>
      <div className="mt-0.5 break-words text-muted" data-testid={testId ? `${testId}-message` : undefined}>{errorText(error)}</div>
      {retry && (
        <button type="button" onClick={retry} disabled={retrying} data-testid={testId ? `${testId}-retry` : undefined} className="mt-1 rounded-sm border border-border px-1.5 py-px text-[10px] hover:border-concord/50 hover:text-concord disabled:opacity-50">
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}
