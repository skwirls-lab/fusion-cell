'use client';

const NAV = ['Workspace', 'Reports', 'Entities', 'Briefs', 'Ingest', 'Admin'] as const;

const FACTIONS = [
  { id: 'concord', label: 'Concord', className: 'bg-concord' },
  { id: 'hegemony', label: 'Hegemony', className: 'bg-hegemony' },
  { id: 'cartel', label: 'Cartel', className: 'bg-cartel' },
  { id: 'kestrel', label: 'Kestrel', className: 'bg-kestrel' },
  { id: 'unaffiliated', label: 'Unaffiliated', className: 'bg-unaffiliated' },
] as const;

const EVENT_TYPES = ['movement', 'meeting', 'transaction', 'communication', 'sighting', 'incident'];
const REPORT_TYPES = ['SIGINT', 'HUMINT', 'IMINT', 'OSINT', 'FINANCIAL', 'TRACKING'];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-3 font-mono text-[10px] font-semibold tracking-[0.18em] text-muted">
      {children}
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset disabled className="px-3 py-1.5 opacity-70">
      <legend className="mb-1 text-[11px] text-muted">{title}</legend>
      {children}
    </fieldset>
  );
}

function Check({ label, swatch }: { label: string; swatch?: string }) {
  return (
    <label className="flex items-center gap-1.5 py-0.5 text-[12px] text-text">
      <input type="checkbox" disabled className="h-3 w-3 accent-concord" />
      {swatch && <span className={`inline-block h-2 w-2 rounded-full ${swatch}`} aria-hidden="true" />}
      {label}
    </label>
  );
}

/** Navigation + filter panel. Filters are placeholders until the filter store lands. */
export function LeftRail() {
  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto border-r border-border bg-panel" aria-label="Navigation and filters">
      <SectionLabel>NAVIGATION</SectionLabel>
      <nav>
        <ul>
          {NAV.map((item) => {
            const active = item === 'Workspace';
            return (
              <li key={item}>
                <button
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  className={
                    'flex w-full items-center px-3 py-1.5 text-left text-[12px] ' +
                    (active
                      ? 'border-l-2 border-concord bg-panel-2 text-text'
                      : 'border-l-2 border-transparent text-muted hover:bg-panel-2 hover:text-text')
                  }
                >
                  {item}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <SectionLabel>FILTERS</SectionLabel>
      <FilterGroup title="Time range">
        <div className="flex flex-col gap-1">
          <input type="datetime-local" disabled className="h-6 rounded border border-border bg-bg px-1.5 font-mono text-[11px] text-muted" aria-label="Time range start" />
          <input type="datetime-local" disabled className="h-6 rounded border border-border bg-bg px-1.5 font-mono text-[11px] text-muted" aria-label="Time range end" />
        </div>
      </FilterGroup>
      <FilterGroup title="Factions">
        {FACTIONS.map((f) => <Check key={f.id} label={f.label} swatch={f.className} />)}
      </FilterGroup>
      <FilterGroup title="Event types">
        {EVENT_TYPES.map((t) => <Check key={t} label={t} />)}
      </FilterGroup>
      <FilterGroup title="Confidence">
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={100} defaultValue={0} disabled className="w-full accent-concord" aria-label="Minimum confidence" />
          <span className="font-mono text-[11px] text-muted">≥ 0%</span>
        </div>
      </FilterGroup>
      <FilterGroup title="Report types">
        {REPORT_TYPES.map((t) => <Check key={t} label={t} />)}
      </FilterGroup>
    </aside>
  );
}
