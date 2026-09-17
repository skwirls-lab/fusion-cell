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

export function Skeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-1.5 p-2', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-3 animate-pulse rounded-sm bg-panel-2" style={{ width: `${70 + ((i * 37) % 30)}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-4 text-[12px] text-muted">{children}</div>;
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="m-2 rounded-sm border border-hegemony/40 bg-hegemony/10 px-2 py-1.5 text-[11px] text-text">
      <div className="font-mono text-[10px] tracking-wider text-hegemony">LOAD FAILED</div>
      <div className="mt-0.5 break-words text-muted">{msg}</div>
      {retry && (
        <button type="button" onClick={retry} className="mt-1 rounded-sm border border-border px-1.5 py-px text-[10px] hover:border-concord/50 hover:text-concord">
          Retry
        </button>
      )}
    </div>
  );
}
