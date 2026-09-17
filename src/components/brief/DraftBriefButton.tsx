'use client';

/**
 * The analyst hand-off (PRD §8 "one click turns the finding into a formatted
 * threat brief"): posts the completed answer and its validated citations as the
 * seed of a threat assessment, then opens the editor on the new brief.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { streamBrief } from './stream';

export function DraftBriefButton({ text, citations }: { text: string; citations: string[] }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; step: string | null; error: string | null }>({ busy: false, step: null, error: null });
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async () => {
    if (state.busy) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setState({ busy: true, step: 'Starting…', error: null });
    try {
      const done = await streamBrief({ template: 'threat_assessment', seedAnswer: { text, citations } }, (ev) => {
        if (ev.type === 'trace' && ev.status === 'start') setState((s) => ({ ...s, step: ev.label }));
      }, ac.signal);
      router.push(`/briefs?id=${encodeURIComponent(done.id)}`);
    } catch (e) {
      setState({ busy: false, step: null, error: ac.signal.aborted ? null : (e instanceof Error ? e.message : String(e)) });
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2" data-testid="draft-brief">
      <button
        type="button"
        onClick={() => void run()}
        disabled={state.busy}
        data-testid="draft-brief-button"
        className="rounded border border-border bg-panel-2 px-2 py-0.5 text-[10px] text-muted hover:border-concord/50 hover:text-concord disabled:opacity-50"
      >
        {state.busy ? 'Drafting brief…' : 'Draft brief from this answer'}
      </button>
      {state.busy && state.step && <span className="text-[10px] text-muted">{state.step}</span>}
      {state.error && <span role="alert" className="text-[10px] text-hegemony">{state.error}</span>}
    </span>
  );
}
