'use client';

/**
 * /entities: the entity table with type + faction filters and a name/alias/
 * description search, straight from GET /api/entities. A row hands off to
 * the workspace with the entity selected (`/?sel=entity:<id>`), which the
 * URL-sync hook there turns into a full cross-highlighted selection.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEntityList, useFactions } from '@/lib/client/api';
import { EmptyState, ErrorState, FactionChip, LoadingLine, Skeleton, TypeBadge } from '@/lib/client/chips';
import { confidencePct } from '@/lib/client/format';
import { PageFrame, TH, FilterChip, inputClass } from './PageFrame';

const ENTITY_TYPES = ['person', 'organization', 'vessel', 'location', 'account', 'equipment', 'other'] as const;
const LIMIT = 500;

const workspaceHref = (id: string) => `/?sel=${encodeURIComponent(`entity:${id}`)}`;

export function EntitiesTable() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [factionIds, setFactionIds] = useState<string[]>([]);
  useEffect(() => { const t = window.setTimeout(() => setQ(input.trim()), 300); return () => window.clearTimeout(t); }, [input]);

  const factions = useFactions();
  const factionName = useMemo(() => new Map((factions.data ?? []).map((f) => [f.id, f.name])), [factions.data]);
  const query = useEntityList({ q: q || undefined, type: types, faction: factionIds, limit: LIMIT });
  const rows = query.data ?? [];

  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>, v: string) =>
    set((list) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]));

  return (
    <PageFrame title="ENTITIES" subtitle={query.data ? `${rows.length}${rows.length === LIMIT ? '+' : ''} entit${rows.length === 1 ? 'y' : 'ies'}` : undefined} testId="entities-page">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-3 py-1.5">
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Name, alias or description"
          aria-label="Search entities"
          data-testid="entities-search"
          className={inputClass + ' w-64'}
        />
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Entity type filter">
          {ENTITY_TYPES.map((t) => <FilterChip key={t} active={types.includes(t)} onClick={() => toggle(setTypes, t)} testId={`type-chip-${t}`}>{t}</FilterChip>)}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Faction filter">
          {factions.isPending && <LoadingLine testId="entities-factions-loading" className="text-[10px]!">factions…</LoadingLine>}
          {factions.error && (
            <span role="alert" data-testid="entities-factions-error" data-state="error" title={factions.error.message} className="flex items-center gap-1 text-[10px] text-hegemony">
              Faction filter unavailable
              <button type="button" onClick={() => void factions.refetch()} className="rounded-sm border border-border px-1 text-text hover:border-concord/50 hover:text-concord">Retry</button>
            </span>
          )}
          {!factions.error && factions.data?.map((f) => (
            <FilterChip key={f.id} active={factionIds.includes(f.id)} onClick={() => toggle(setFactionIds, f.id)} color={f.color} testId={`faction-chip-${f.id}`}>{f.name}</FilterChip>
          ))}
        </div>
        {(types.length > 0 || factionIds.length > 0) && (
          <button type="button" onClick={() => { setTypes([]); setFactionIds([]); }} className="text-[10px] text-muted hover:text-text">clear filters</button>
        )}
      </div>

      {query.isPending && <Skeleton rows={12} testId="entities-loading" />}
      {query.error && <ErrorState error={query.error} retry={() => void query.refetch()} retrying={query.isFetching} testId="entities-error" />}
      {!query.error && query.data && rows.length === 0 && (
        <EmptyState
          testId="entities-empty"
          action={q || input || types.length || factionIds.length ? { label: 'Clear search and filters', onClick: () => { setInput(''); setQ(''); setTypes([]); setFactionIds([]); }, testId: 'entities-clear' } : undefined}
        >
          {q || types.length || factionIds.length
            ? <>No entities match{q ? ` “${q}”` : ''}{types.length ? ` of type ${types.join(', ')}` : ''}{factionIds.length ? ` in ${factionIds.map((f) => factionName.get(f) ?? f).join(', ')}` : ''}.</>
            : <>No entities in the database yet. Reseed the scenario from Admin.</>}
        </EmptyState>
      )}
      {!query.error && query.data && rows.length > 0 && (
        <table className="w-full border-collapse text-[11px]" data-testid="entities-table" data-row-count={rows.length}>
          <thead>
            <tr>
              <TH>Name</TH>
              <TH className="w-24">Type</TH>
              <TH className="w-36">Faction</TH>
              <TH>Aliases</TH>
              <TH className="w-20">Conf</TH>
              <TH className="w-44">Id</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr
                key={e.id}
                data-testid="entity-row"
                data-entity-id={e.id}
                data-type={e.type}
                onClick={() => router.push(workspaceHref(e.id))}
                className="cursor-pointer border-b border-border/60 hover:bg-panel-2"
              >
                <td className="px-2 py-1 text-text">
                  <Link href={workspaceHref(e.id)} onClick={(ev) => ev.stopPropagation()} className="hover:text-concord" title="Open in the workspace">{e.name}</Link>
                </td>
                <td className="px-2 py-1"><TypeBadge>{e.type}{e.locationKind ? ` · ${e.locationKind}` : ''}</TypeBadge></td>
                <td className="px-2 py-1"><FactionChip factionId={e.factionId} name={e.factionId ? factionName.get(e.factionId) : null} /></td>
                <td className="max-w-0 truncate px-2 py-1 text-muted" title={e.aliases.join(' · ')}>{e.aliases.join(' · ') || '—'}</td>
                <td className="px-2 py-1">
                  <div className="flex items-center gap-1.5" title={`Confidence ${confidencePct(e.confidence)}`}>
                    <div className="h-1 w-10 rounded-sm bg-panel-2"><div className="h-1 rounded-sm bg-concord" style={{ width: confidencePct(e.confidence) }} /></div>
                    <span className="font-mono text-[10px] text-muted">{confidencePct(e.confidence)}</span>
                  </div>
                </td>
                <td className="px-2 py-1 font-mono text-[10px] text-muted">{e.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PageFrame>
  );
}
