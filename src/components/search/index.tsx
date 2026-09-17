'use client';

/** Global search (PRD §5.9): /api/search, debounced 200ms; entities select, reports open. */
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useSelection } from '@/stores/selection';
import { useSearch } from '@/lib/client/api';
import { FactionDot, ReportTypeBadge, TypeBadge } from '@/lib/client/chips';
import { selectEntity } from '@/lib/client/select';

const DEBOUNCE_MS = 200;

export function GlobalSearch() {
  const [raw, setRaw] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openReport = useSelection((s) => s.openReport);
  const results = useSearch(q);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(raw), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [raw]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const entities = results.data?.entities ?? [];
  const reports = results.data?.reports ?? [];
  const items = [
    ...entities.map((e) => ({ key: `e:${e.id}`, run: () => { selectEntity(e.id); } })),
    ...reports.map((r) => ({ key: `r:${r.id}`, run: () => { openReport(r.reportNumber); } })),
  ];
  const showList = open && q.trim().length >= 2;

  const choose = (i: number) => {
    const it = items[i];
    if (!it) return;
    it.run();
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return; }
    if (!showList) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(cursor); }
  };

  let idx = -1;
  return (
    <div ref={wrapRef} className="relative w-full max-w-[520px]">
      <input
        ref={inputRef}
        id="global-search"
        type="search"
        autoComplete="off"
        placeholder="Search entities, reports… ( / )"
        aria-label="Global search"
        aria-expanded={showList}
        aria-controls="global-search-results"
        role="combobox"
        value={raw}
        onChange={(e) => { setRaw(e.target.value); setOpen(true); setCursor(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-7 w-full rounded border border-border bg-bg px-2.5 text-[12px] text-text placeholder:text-muted focus:border-concord/60 focus:outline-none"
      />
      {showList && (
        <div id="global-search-results" role="listbox" className="panel absolute left-0 right-0 top-8 z-40 max-h-[60vh] overflow-y-auto shadow-lg shadow-black/50" data-testid="search-results">
          {results.isPending && <div className="px-2 py-1.5 text-[11px] text-muted">Searching…</div>}
          {results.error && <div className="px-2 py-1.5 text-[11px] text-hegemony">Search failed: {results.error.message}</div>}
          {results.data && items.length === 0 && <div className="px-2 py-1.5 text-[11px] text-muted">No matches for “{q}”.</div>}
          {entities.length > 0 && <div className="px-2 pt-1.5 font-mono text-[9px] tracking-[0.18em] text-muted">ENTITIES</div>}
          {entities.map((e) => { idx += 1; const i = idx; return (
            <button key={e.id} type="button" role="option" aria-selected={cursor === i} onMouseEnter={() => setCursor(i)} onClick={() => choose(i)}
              className={clsx('flex w-full items-center gap-2 px-2 py-1 text-left text-[12px]', cursor === i ? 'bg-panel-2 text-concord' : 'text-text')} data-testid="search-entity">
              <FactionDot factionId={e.factionId} />
              <span className="truncate">{e.name}</span>
              <TypeBadge className="ml-auto">{e.type}</TypeBadge>
            </button>
          ); })}
          {reports.length > 0 && <div className="px-2 pt-1.5 font-mono text-[9px] tracking-[0.18em] text-muted">REPORTS</div>}
          {reports.map((r) => { idx += 1; const i = idx; return (
            <button key={r.id} type="button" role="option" aria-selected={cursor === i} onMouseEnter={() => setCursor(i)} onClick={() => choose(i)}
              className={clsx('flex w-full items-center gap-2 px-2 py-1 text-left text-[12px]', cursor === i ? 'bg-panel-2 text-concord' : 'text-text')} data-testid="search-report">
              <span className="font-mono text-[10px] text-muted">{r.reportNumber}</span>
              <ReportTypeBadge type={r.type} />
              <span className="truncate">{r.title}</span>
            </button>
          ); })}
        </div>
      )}
    </div>
  );
}

export default GlobalSearch;
