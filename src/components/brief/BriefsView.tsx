'use client';

/** /briefs: list + new-brief form on the left, the editor on the right. The open brief lives in ?id=. */
import { Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BriefFrame } from './BriefFrame';
import { BriefList } from './BriefList';
import { NewBriefForm } from './NewBriefForm';
import { BriefEditor } from './BriefEditor';
import { EmptyState } from '@/lib/client/chips';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pb-1 pt-3 font-mono text-[10px] font-semibold tracking-[0.18em] text-muted">{children}</div>;
}

function BriefsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const id = sp.get('id');
  const open = useCallback((next: string | null) => {
    router.replace(next ? `/briefs?id=${encodeURIComponent(next)}` : '/briefs');
  }, [router]);

  return (
    <div className="grid h-full min-h-0 grid-cols-[340px_1fr]" data-testid="briefs-page">
      <section className="flex min-h-0 flex-col overflow-y-auto border-r border-border bg-panel" aria-label="Briefs">
        <SectionLabel>BRIEFS</SectionLabel>
        <BriefList selectedId={id} onSelect={open} />
        <SectionLabel>NEW BRIEF</SectionLabel>
        <NewBriefForm onDrafted={open} />
      </section>
      <section className="min-h-0 min-w-0" aria-label="Brief editor">
        {id ? (
          <BriefEditor key={id} id={id} onDeleted={() => open(null)} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState testId="brief-editor-empty">Select a brief, or draft a new one from the left.</EmptyState>
          </div>
        )}
      </section>
    </div>
  );
}

export function BriefsView() {
  return (
    <BriefFrame>
      <Suspense fallback={<div role="status" data-testid="briefs-page-loading" data-state="loading" className="p-3 text-[12px] text-muted">Loading…</div>}>
        <BriefsInner />
      </Suspense>
    </BriefFrame>
  );
}
