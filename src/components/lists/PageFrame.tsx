'use client';

/**
 * Full-width page chrome for the non-workspace routes (/reports, /entities,
 * /ingest, /admin): the same top bar and left rail the Workspace composes,
 * with a single scrolling main instead of the map/graph split. The report
 * reader and the keyboard shortcuts are mounted so any page can open a
 * report in place and close it the same way.
 */
import { TopBar } from '@/components/shell/TopBar';
import { LeftRail } from '@/components/shell/LeftRail';
import ReportReader from '@/components/feed/ReportReader';
import { useShortcuts } from '@/hooks/useShortcuts';

export function PageFrame({ title, subtitle, actions, children, testId }: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  useShortcuts(); // Esc closes the reader, `/` focuses global search — same keys as the workspace
  return (
    <div id="page" className="relative grid h-[calc(100vh-56px)] grid-rows-[auto_1fr] overflow-hidden">
      <TopBar />
      <div className="grid min-h-0 grid-cols-[240px_1fr]">
        <LeftRail />
        <main className="flex min-h-0 min-w-0 flex-col" data-testid={testId}>
          <header className="flex h-8 shrink-0 items-center gap-3 border-b border-border bg-panel px-3">
            <h1 className="font-mono text-[11px] font-semibold tracking-[0.18em] text-text">{title}</h1>
            {subtitle && <span className="truncate text-[11px] text-muted">{subtitle}</span>}
            {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </main>
      </div>
      <ReportReader />
    </div>
  );
}

/** Shared table atoms so the three list pages read as one product. */
export const TH = ({ children, className, onClick, active, dir }: {
  children: React.ReactNode; className?: string; onClick?: () => void; active?: boolean; dir?: 'asc' | 'desc';
}) => (
  <th scope="col" className={'sticky top-0 z-10 border-b border-border bg-panel px-2 py-1 text-left font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted ' + (className ?? '')}>
    {onClick ? (
      <button type="button" onClick={onClick} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined} className={'inline-flex items-center gap-1 hover:text-text ' + (active ? 'text-text' : '')}>
        {children}
        <span aria-hidden="true" className="text-[8px]">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    ) : children}
  </th>
);

export const inputClass = 'h-6 rounded border border-border bg-bg px-1.5 text-[11px] text-text placeholder:text-muted/70 focus:border-concord/60 focus:outline-none';
export const selectClass = 'h-6 rounded border border-border bg-bg px-1 text-[11px] text-text focus:border-concord/60 focus:outline-none';
export const buttonClass = 'inline-flex h-6 items-center rounded-sm border border-border px-2 text-[11px] text-text hover:border-concord/50 hover:text-concord disabled:cursor-not-allowed disabled:opacity-50';
export const primaryButtonClass = 'inline-flex h-6 items-center rounded-sm border border-concord/50 bg-concord/10 px-2 text-[11px] text-concord hover:bg-concord/20 disabled:cursor-not-allowed disabled:opacity-50';
export const dangerButtonClass = 'inline-flex h-6 items-center rounded-sm border border-hegemony/50 bg-hegemony/10 px-2 text-[11px] text-hegemony hover:bg-hegemony/20 disabled:cursor-not-allowed disabled:opacity-50';

/** Toggle chip for filters (report types, entity types, factions). */
export function FilterChip({ children, active, onClick, color, testId }: { children: React.ReactNode; active: boolean; onClick: () => void; color?: string; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={'inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 font-mono text-[10px] tracking-wider transition-colors ' + (active ? 'border-concord/60 bg-concord/10 text-concord' : 'border-border text-muted hover:border-concord/40 hover:text-text')}
      style={active && color ? { borderColor: `${color}99`, color, backgroundColor: `${color}1a` } : undefined}
    >
      {color && <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </button>
  );
}
