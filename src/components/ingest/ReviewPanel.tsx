'use client';

/**
 * Step 2 of ingest (P6.3): every extracted entity, relationship and event
 * with its confidence and the matcher's suggestion, editable before commit.
 * Decisions are kept by index into the stored extraction, which is exactly
 * what POST /api/ingest/:id/commit consumes.
 */
import { useMemo, useState } from 'react';
import type { IngestJobOut, IngestDecisions } from '@/lib/client/api';
import type { EntityMatch, ExtractedEntity } from '@/lib/ingest/types';
import { FactionChip, ReportTypeBadge, TypeBadge } from '@/lib/client/chips';
import { confidencePct, formatDtgFull, isoToLocalInput, localInputToIso } from '@/lib/client/format';
import { useFactions } from '@/lib/client/api';
import { TH, buttonClass, dangerButtonClass, inputClass, primaryButtonClass, selectClass } from '@/components/lists/PageFrame';

const ENTITY_TYPES = ['person', 'organization', 'vessel', 'location', 'account', 'equipment', 'other'] as const;
type EntityAction = 'link' | 'create' | 'discard';

interface EntityDecisionState { action: EntityAction; entityId: string | null; name: string; type: ExtractedEntity['type'] }

const NO_MATCH: EntityMatch = { candidates: [], suggested: 'create', suggestedId: null };

export function ConfidenceBar({ value }: { value: number }) {
  const pct = confidencePct(value);
  const tone = value >= 0.75 ? 'bg-emerald-400' : value >= 0.5 ? 'bg-concord' : 'bg-cartel';
  return (
    <div className="flex items-center gap-1.5" title={`Confidence ${pct}`} data-confidence={value}>
      <div className="h-1 w-12 rounded-sm bg-panel-2"><div className={'h-1 rounded-sm ' + tone} style={{ width: pct }} /></div>
      <span className="font-mono text-[10px] text-muted">{pct}</span>
    </div>
  );
}

export function ReviewPanel({ job, onCommit, onDiscard, error, setError }: {
  job: IngestJobOut;
  onCommit: (d: IngestDecisions) => Promise<void>;
  onDiscard: () => void;
  error: string | null;
  setError: (m: string | null) => void;
}) {
  const x = job.extraction?.extraction;
  const matches = job.extraction?.matches ?? [];
  const factions = useFactions();
  const factionName = useMemo(() => new Map((factions.data ?? []).map((f) => [f.id, f.name])), [factions.data]);

  const [title, setTitle] = useState(x?.title ?? '');
  // reported_at defaults to the report's own event time, not "now": an ingested report about day 20
  // must not advance the scenario clock to today.
  const [reportedAt, setReportedAt] = useState(() => isoToLocalInput(x?.event_at ?? new Date().toISOString()));
  const [entities, setEntities] = useState<EntityDecisionState[]>(() =>
    (x?.entities ?? []).map((e, i) => {
      const m = matches[i] ?? NO_MATCH;
      return { action: m.suggested, entityId: m.suggestedId ?? m.candidates[0]?.id ?? null, name: e.name, type: e.type };
    }),
  );
  const [keepRel, setKeepRel] = useState<boolean[]>(() => (x?.relationships ?? []).map(() => true));
  const [keepEv, setKeepEv] = useState<boolean[]>(() => (x?.events ?? []).map(() => true));
  const [busy, setBusy] = useState(false);

  if (!x) return <div className="p-3 text-[12px] text-muted" data-testid="ingest-review-empty" data-state="empty">This job has no extraction to review. Discard it and extract again.</div>;

  const patch = (i: number, p: Partial<EntityDecisionState>) => setEntities((list) => list.map((d, j) => (j === i ? { ...d, ...p } : d)));

  const counts = {
    link: entities.filter((d) => d.action === 'link').length,
    create: entities.filter((d) => d.action === 'create').length,
    discard: entities.filter((d) => d.action === 'discard').length,
    rel: keepRel.filter(Boolean).length,
    ev: keepEv.filter(Boolean).length,
  };
  const invalidLink = entities.findIndex((d) => d.action === 'link' && !d.entityId);

  async function commit() {
    if (invalidLink >= 0) { setError(`Entity #${invalidLink + 1} is set to link but no existing entity is chosen.`); return; }
    setBusy(true);
    setError(null);
    try {
      await onCommit({
        title: title.trim() && title.trim() !== x!.title ? title.trim() : undefined,
        reportedAt: localInputToIso(reportedAt) ?? undefined,
        entities: entities.map((d, index) => {
          const orig = x!.entities[index];
          const overrides = d.action === 'create' && (d.name !== orig.name || d.type !== orig.type) ? { name: d.name, type: d.type } : undefined;
          return { index, action: d.action, entityId: d.action === 'link' ? (d.entityId ?? undefined) : undefined, overrides };
        }),
        relationships: keepRel.map((keep, index) => ({ index, action: keep ? 'create' : 'discard' })),
        events: keepEv.map((keep, index) => ({ index, action: keep ? 'create' : 'discard' })),
      });
    } catch (e) {
      const b = (e as { body?: { message?: unknown } }).body;
      setError(b && typeof b.message === 'string' ? b.message : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-3" data-testid="ingest-review">
      {/* ---- header ---- */}
      <section className="rounded-sm border border-border bg-panel p-2">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted">
          <span className="text-text">{job.id}</span>
          <ReportTypeBadge type={job.reportType} />
          <span title="Source reliability / information credibility">{x.source_reliability ?? 'C'}{x.info_credibility ?? 3}{(x.source_reliability === null || x.info_credibility === null) && <span className="text-muted"> (default)</span>}</span>
          <span title="Event time">{x.event_at ? `evt ${formatDtgFull(x.event_at)}` : 'no event time'}</span>
          <span>{job.rawText.length.toLocaleString()} chars</span>
          <span>model {job.extraction?.model ?? '—'}{job.extraction?.source === 'manual' && <span className="text-cartel"> · manual extraction (dev seam)</span>}</span>
        </div>
        <label className="mt-1.5 block">
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Report title" data-testid="review-title" className={inputClass + ' mt-0.5 w-full text-[12px]'} />
        </label>
        <label className="mt-1.5 block">
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted">Reported at</span>
          <input type="datetime-local" value={reportedAt} onChange={(e) => setReportedAt(e.target.value)} aria-label="Reported at" data-testid="review-reported-at" className={inputClass + ' mt-0.5 text-[12px]'} />
        </label>
        <p className="mt-1.5 text-[12px] leading-snug text-text" data-testid="review-summary">{x.summary || <span className="text-muted">No summary.</span>}</p>
      </section>

      {/* ---- entities ---- */}
      <section>
        <h2 className="mb-1 font-mono text-[10px] font-semibold tracking-[0.18em] text-muted">
          ENTITIES <span className="font-normal">· {x.entities.length} extracted · {counts.link} link · {counts.create} create · {counts.discard} discard</span>
        </h2>
        {x.entities.length === 0 ? <p className="text-[11px] text-muted">None extracted.</p> : (
          <table className="w-full border-collapse text-[11px]" data-testid="entities-review">
            <thead>
              <tr><TH className="w-6">#</TH><TH>Name</TH><TH className="w-28">Type</TH><TH className="w-24">Conf</TH><TH className="w-[420px]">Match</TH><TH>Aliases · description</TH></tr>
            </thead>
            <tbody>
              {x.entities.map((e, i) => {
                const d = entities[i];
                const m = matches[i] ?? NO_MATCH;
                const chosen = m.candidates.find((c) => c.id === d.entityId);
                return (
                  <tr key={i} data-testid="ingest-entity-row" data-name={e.name} data-action={d.action} className={'border-b border-border/60 align-top ' + (d.action === 'discard' ? 'opacity-50' : '')}>
                    <td className="px-1 py-1 font-mono text-[10px] text-muted">{i + 1}</td>
                    <td className="px-1 py-1">
                      {d.action === 'create'
                        ? <input value={d.name} onChange={(ev) => patch(i, { name: ev.target.value })} aria-label={`Name for entity ${i + 1}`} className={inputClass + ' w-full'} />
                        : <span className="text-text">{e.name}</span>}
                    </td>
                    <td className="px-1 py-1">
                      {d.action === 'create'
                        ? <select value={d.type} onChange={(ev) => patch(i, { type: ev.target.value as ExtractedEntity['type'] })} aria-label={`Type for entity ${i + 1}`} className={selectClass}>{ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                        : <TypeBadge>{e.type}</TypeBadge>}
                    </td>
                    <td className="px-1 py-1"><ConfidenceBar value={e.confidence} /></td>
                    <td className="px-1 py-1">
                      <fieldset className="flex flex-col gap-0.5" aria-label={`Match decision for ${e.name}`}>
                        <label className="flex items-center gap-1.5">
                          <input type="radio" name={`ent-${i}`} value="link" checked={d.action === 'link'} onChange={() => patch(i, { action: 'link', entityId: d.entityId ?? m.candidates[0]?.id ?? null })} disabled={m.candidates.length === 0} className="accent-concord" />
                          <span className={'whitespace-nowrap ' + (m.candidates.length === 0 ? 'text-muted' : '')}>Link to</span>
                          <select
                            value={d.entityId ?? ''}
                            onChange={(ev) => patch(i, { action: 'link', entityId: ev.target.value || null })}
                            disabled={m.candidates.length === 0}
                            aria-label={`Existing entity for ${e.name}`}
                            data-testid="match-select"
                            className={selectClass + ' max-w-[220px]'}
                          >
                            {m.candidates.length === 0 && <option value="">no candidates</option>}
                            {m.candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type}) · {Math.round(c.score * 100)}%</option>)}
                          </select>
                          {chosen && <span className="whitespace-nowrap"><FactionChip factionId={chosen.factionId} name={chosen.factionId ? factionName.get(chosen.factionId) : null} /></span>}
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="radio" name={`ent-${i}`} value="create" checked={d.action === 'create'} onChange={() => patch(i, { action: 'create' })} className="accent-concord" /> Create new
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="radio" name={`ent-${i}`} value="discard" checked={d.action === 'discard'} onChange={() => patch(i, { action: 'discard' })} className="accent-concord" /> Discard
                          {m.suggested === 'discard' && d.action === 'discard' && <span className="text-[10px] text-muted">(generic name)</span>}
                        </label>
                      </fieldset>
                    </td>
                    <td className="px-1 py-1 text-muted">
                      {e.aliases.length > 0 && <div className="text-[10px]">aka {e.aliases.join(' · ')}</div>}
                      {e.description && <div className="text-[11px] text-text/80">{e.description}</div>}
                      {e.lon !== undefined && e.lat !== undefined && <div className="font-mono text-[10px]">{e.lon}, {e.lat}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ---- relationships ---- */}
      <section>
        <h2 className="mb-1 font-mono text-[10px] font-semibold tracking-[0.18em] text-muted">RELATIONSHIPS <span className="font-normal">· {counts.rel} of {x.relationships.length} kept</span></h2>
        {x.relationships.length === 0 ? <p className="text-[11px] text-muted">None extracted.</p> : (
          <table className="w-full border-collapse text-[11px]" data-testid="relationships-review">
            <thead><tr><TH className="w-12">Keep</TH><TH>Source</TH><TH className="w-36">Type</TH><TH>Target</TH><TH className="w-24">Conf</TH><TH>Evidence</TH></tr></thead>
            <tbody>
              {x.relationships.map((r, i) => (
                <tr key={i} data-testid="ingest-relationship-row" className={'border-b border-border/60 ' + (keepRel[i] ? '' : 'opacity-50')}>
                  <td className="px-1 py-1"><input type="checkbox" checked={keepRel[i]} onChange={(ev) => setKeepRel((l) => l.map((v, j) => (j === i ? ev.target.checked : v)))} aria-label={`Keep relationship ${i + 1}`} className="accent-concord" /></td>
                  <td className="px-1 py-1 text-text">{r.source_name}</td>
                  <td className="px-1 py-1"><TypeBadge>{r.type}</TypeBadge></td>
                  <td className="px-1 py-1 text-text">{r.target_name}</td>
                  <td className="px-1 py-1"><ConfidenceBar value={r.confidence} /></td>
                  <td className="px-1 py-1 italic text-muted">“{r.evidence}”</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ---- events ---- */}
      <section>
        <h2 className="mb-1 font-mono text-[10px] font-semibold tracking-[0.18em] text-muted">EVENTS <span className="font-normal">· {counts.ev} of {x.events.length} kept</span></h2>
        {x.events.length === 0 ? <p className="text-[11px] text-muted">None extracted.</p> : (
          <table className="w-full border-collapse text-[11px]" data-testid="events-review">
            <thead><tr><TH className="w-12">Keep</TH><TH>Title</TH><TH className="w-28">Type</TH><TH className="w-36">Time</TH><TH className="w-36">Location</TH><TH>Participants</TH><TH className="w-24">Conf</TH></tr></thead>
            <tbody>
              {x.events.map((ev, i) => (
                <tr key={i} data-testid="ingest-event-row" className={'border-b border-border/60 ' + (keepEv[i] ? '' : 'opacity-50')}>
                  <td className="px-1 py-1"><input type="checkbox" checked={keepEv[i]} onChange={(e) => setKeepEv((l) => l.map((v, j) => (j === i ? e.target.checked : v)))} aria-label={`Keep event ${i + 1}`} className="accent-concord" /></td>
                  <td className="px-1 py-1 text-text">{ev.title}{ev.description && <div className="text-[10px] text-muted">{ev.description}</div>}</td>
                  <td className="px-1 py-1"><TypeBadge>{ev.type}</TypeBadge></td>
                  <td className="px-1 py-1 font-mono text-[10px] text-muted">{ev.occurred_at ? formatDtgFull(ev.occurred_at) : x.event_at ? `${formatDtgFull(x.event_at)} (report)` : '—'}</td>
                  <td className="px-1 py-1 text-text">{ev.location_name ?? <span className="text-muted">participant’s place</span>}</td>
                  <td className="px-1 py-1 text-muted">{ev.participant_names.join(', ') || '—'}</td>
                  <td className="px-1 py-1"><ConfidenceBar value={ev.confidence} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {error && (
        <div role="alert" className="rounded-sm border border-hegemony/40 bg-hegemony/10 px-2 py-1.5 text-[11px]" data-testid="commit-error">
          <div className="font-mono text-[10px] tracking-wider text-hegemony">COMMIT FAILED</div>
          <div className="mt-0.5 break-words text-text">{error}</div>
        </div>
      )}

      <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-panel py-2">
        <button type="button" className={primaryButtonClass} onClick={() => void commit()} disabled={busy} data-testid="commit">
          {busy ? 'Committing…' : `Commit ${counts.link + counts.create} entities, ${counts.rel} relationships, ${counts.ev} events`}
        </button>
        <button type="button" className={dangerButtonClass} onClick={onDiscard} disabled={busy} data-testid="discard">Discard job</button>
        <span className="text-[10px] text-muted">One transaction: the report, everything kept above, and their provenance links.</span>
        <button type="button" className={buttonClass + ' ml-auto'} onClick={() => { setEntities((l) => l.map((d, i) => { const m = matches[i] ?? NO_MATCH; return { ...d, action: m.suggested, entityId: m.suggestedId ?? m.candidates[0]?.id ?? null }; })); setKeepRel((l) => l.map(() => true)); setKeepEv((l) => l.map(() => true)); }} disabled={busy}>Reset to suggestions</button>
      </div>
    </div>
  );
}
