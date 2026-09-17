'use client';

import { useUiStore, type RightTab } from '@/stores/ui';
import EntityPanel from '@/components/entity';
import AnalystPanel from '@/components/analyst';

const TABS: { id: RightTab; label: string }[] = [
  { id: 'entity', label: 'Entity Profile' },
  { id: 'analyst', label: 'AI Analyst' },
];

export function RightPanel() {
  const rightTab = useUiStore((s) => s.rightTab);
  const setRightTab = useUiStore((s) => s.setRightTab);

  return (
    <aside className="flex min-h-0 flex-col border-l border-border bg-panel" aria-label="Detail panel">
      <div role="tablist" aria-label="Detail tabs" className="flex h-8 shrink-0 border-b border-border">
        {TABS.map((t) => {
          const active = t.id === rightTab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`right-tab-${t.id}`}
              aria-selected={active}
              aria-controls={`right-tabpanel-${t.id}`}
              onClick={() => setRightTab(t.id)}
              className={
                'flex-1 border-b-2 text-[12px] ' +
                (active
                  ? 'border-concord text-text'
                  : 'border-transparent text-muted hover:bg-panel-2 hover:text-text')
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`right-tabpanel-${rightTab}`}
        aria-labelledby={`right-tab-${rightTab}`}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {rightTab === 'entity' ? <EntityPanel /> : <AnalystPanel />}
      </div>
    </aside>
  );
}
