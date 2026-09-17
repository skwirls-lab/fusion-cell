'use client';

/**
 * "New brief": template, subject (entity picker / topic / none), Draft. The
 * draft streams over SSE; the trace shows while the analyst gathers evidence
 * and the structuring call runs; on the final `brief` event the parent opens it.
 */
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { BRIEFS_KEY, useSearch } from '@/lib/client/api';
import { FactionDot, TypeBadge } from '@/lib/client/chips';
import { TEMPLATES, type BriefTemplate } from './templates';
import { streamBrief } from './stream';
import { TraceList, foldTrace, type TraceStep } from './TraceList';

interface PickedEntity { id: string; name: string; type: string; factionId: string | null }

function EntityPicker({ value, onChange }: { value: PickedEntity | null; onChange: (e: PickedEntity | null) => void }) {
  const [raw, setRaw] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const results = useSearch(q);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(raw), 200);
    return () => window.clearTimeout(t);
  }, [raw]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded border border-border bg-bg px-2 py-1 text-[12px]" data-testid="brief-entity-picked" data-entity-id={value.id}>
        <FactionDot factionId={value.factionId} />
        <span className="truncate text-text">{value.name}</span>
        <TypeBadge>{value.type}</TypeBadge>
        <span className="ml-auto font-mono text-[10px] text-muted">{value.id}</span>
        <button type="button" onClick={() => onChange(null)} aria-label="Clear entity" className="rounded px-1 font-mono text-[11px] text-muted hover:bg-panel-2 hover:text-text">×</button>
      </div>
    );
  }
  const entities = results.data?.entities ?? [];
  const showList = open && q.trim().length >= 2;
  return (
    <div ref={wrapRef} className="relative">
      <input
        type="search"
        autoComplete="off"
        value={raw}
        onChange={(e) => { setRaw(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search for an entity…"
        aria-label="Subject entity"
        data-testid="brief-entity-search"
        className="h-7 w-full rounded border border-border bg-bg px-2 text-[12px] text-text placeholder:text-muted focus:border-concord/60 focus:outline-none"
      />
      {showList && (
        <div role="listbox" className="panel absolute left-0 right-0 top-8 z-40 max-h-[40vh] overflow-y-auto shadow-lg shadow-black/50" data-testid="brief-entity-results">
          {results.isPending && <div className="px-2 py-1.5 text-[11px] text-muted">Searching…</div>}
          {results.error && <div className="px-2 py-1.5 text-[11px] text-hegemony">Search failed: {results.error.message}</div>}
          {results.data && entities.length === 0 && <div className="px-2 py-1.5 text-[11px] text-muted">No entities match “{q}”.</div>}
          {entities.map((e) => (
            <button key={e.id} type="button" role="option" aria-selected={false} onClick={() => { onChange(e); setOpen(false); setRaw(''); }}
              className="flex w-full items-center gap-2 px-2 py-1 text-left text-[12px] text-text hover:bg-panel-2 hover:text-concord">
              <FactionDot factionId={e.factionId} />
              <span className="truncate">{e.name}</span>
              <TypeBadge className="ml-auto">{e.type}</TypeBadge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function NewBriefForm({ onDrafted, busyChange }: { onDrafted: (id: string) => void; busyChange?: (busy: boolean) => void }) {
  const qc = useQueryClient();
  const [template, setTemplate] = useState<BriefTemplate>('threat_assessment');
  const [entity, setEntity] = useState<PickedEntity | null>(null);
  const [topic, setTopic] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const needsEntity = template === 'entity_profile';
  const canDraft = !drafting && (!needsEntity || entity !== null);
  const tpl = TEMPLATES.find((t) => t.id === template)!;

  const draft = async () => {
    if (!canDraft) return;
    setDrafting(true); busyChange?.(true);
    setTrace([]); setError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const subject = {
        ...(entity ? { entityId: entity.id } : {}),
        ...(template === 'threat_assessment' && topic.trim() ? { topic: topic.trim() } : {}),
      };
      const done = await streamBrief({ template, subject }, (ev) => {
        if (ev.type === 'trace') setTrace((t) => foldTrace(t, ev));
      }, ac.signal);
      await qc.invalidateQueries({ queryKey: BRIEFS_KEY });
      onDrafted(done.id);
    } catch (e) {
      if (!ac.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setDrafting(false); busyChange?.(false);
    }
  };

  return (
    <form data-testid="brief-new-form" className="flex flex-col gap-2 p-3" onSubmit={(e) => { e.preventDefault(); void draft(); }}>
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        Template
        <select
          value={template}
          onChange={(e) => setTemplate(e.target.value as BriefTemplate)}
          disabled={drafting}
          data-testid="brief-template"
          className="h-7 rounded border border-border bg-bg px-1.5 text-[12px] text-text focus:border-concord/60 focus:outline-none"
        >
          {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <span className="text-[10px] leading-snug text-muted/80">{tpl.hint}</span>
      </label>

      {template !== 'daily_summary' && (
        <div className="flex flex-col gap-1 text-[11px] text-muted">
          <span>{needsEntity ? 'Subject entity (required)' : 'Subject entity (optional)'}</span>
          <EntityPicker value={entity} onChange={setEntity} />
        </div>
      )}
      {template === 'threat_assessment' && !entity && (
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          Topic (optional)
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={drafting}
            placeholder="e.g. Convoy 7, Tessaly Gate"
            data-testid="brief-topic"
            className="h-7 rounded border border-border bg-bg px-2 text-[12px] text-text placeholder:text-muted/70 focus:border-concord/60 focus:outline-none"
          />
        </label>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!canDraft}
          data-testid="brief-draft"
          className={clsx('h-7 rounded px-3 text-[12px] font-medium', canDraft ? 'bg-concord text-bg hover:bg-concord/90' : 'bg-concord/40 text-bg/70')}
        >
          {drafting ? 'Drafting…' : 'Draft'}
        </button>
        {drafting && (
          <button type="button" onClick={() => abortRef.current?.abort()} className="h-7 rounded border border-hegemony/60 px-2 text-[11px] text-hegemony hover:bg-hegemony/10">
            Stop
          </button>
        )}
        <span className="text-[10px] text-muted">Runs the analyst, then structures the answer.</span>
      </div>

      <TraceList trace={trace} live={drafting} />
      {error && (
        <div role="alert" data-testid="brief-draft-error" className="rounded border border-hegemony/60 bg-hegemony/10 px-2 py-1 text-[11px] text-hegemony">{error}</div>
      )}
    </form>
  );
}
