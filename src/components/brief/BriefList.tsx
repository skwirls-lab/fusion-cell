'use client';

import clsx from 'clsx';
import { useBriefs } from '@/lib/client/api';
import { EmptyState, ErrorState, Skeleton, TypeBadge } from '@/lib/client/chips';
import { formatDtgFull } from '@/lib/client/format';
import { TEMPLATE_LABEL, TEMPLATE_SHORT } from './templates';

export function BriefList({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const q = useBriefs();
  if (q.isPending) return <Skeleton rows={5} testId="briefs-loading" />;
  if (q.error) return <ErrorState error={q.error} retry={() => void q.refetch()} retrying={q.isFetching} testId="briefs-error" />;
  const briefs = q.data;
  if (!briefs.length) return <EmptyState testId="briefs-empty">No briefs yet. Pick a template under NEW BRIEF below and draft one, or use “Draft brief” on an analyst answer.</EmptyState>;
  return (
    <ul data-testid="brief-list" className="flex flex-col">
      {briefs.map((b) => (
        <li key={b.id}>
          <button
            type="button"
            data-testid="brief-row"
            data-id={b.id}
            aria-current={b.id === selectedId ? 'true' : undefined}
            onClick={() => onSelect(b.id)}
            className={clsx(
              'flex w-full flex-col gap-0.5 border-l-2 px-3 py-1.5 text-left hover:bg-panel-2',
              b.id === selectedId ? 'border-concord bg-panel-2' : 'border-transparent',
            )}
          >
            <span className="truncate text-[12px] text-text" title={b.title}>{b.title}</span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
              <TypeBadge>{TEMPLATE_SHORT[b.template]}</TypeBadge>
              <span title={TEMPLATE_LABEL[b.template]}>v{b.version}</span>
              <span>·</span>
              <span>{formatDtgFull(b.updatedAt)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
