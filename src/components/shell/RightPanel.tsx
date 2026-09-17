'use client';

import { useEffect } from 'react';
import { useUiStore, type RightTab } from '@/stores/ui';
import { useSelection } from '@/stores/selection';
import EntityPanel from '@/components/entity';
import AnalystPanel from '@/components/analyst';

const TABS: { id: RightTab; label: string }[] = [
  { id: 'entity', label: 'Entity Profile' },
  { id: 'analyst', label: 'AI Analyst' },
];

export function RightPanel() {
  const rightTab = useUiStore((s) => s.rightTab);
  const setRightTab = useUiStore((s) => s.setRightTab);
  const selectedId = useSelection((s) => s.selectedId);

  // A new selection surfaces the profile, but never yanks the user out of a conversation.
  useEffect(() => {
    if (selectedId === null) return;
    if (useUiStore.getState().rightTab !== 'analyst') setRightTab('entity');
  }, [selectedId, setRightTab]);

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
      {/* Both panels stay mounted: switching tabs must not abort the analyst's stream or drop its conversation. */}
      {TABS.map((t) => {
        const active = t.id === rightTab;
        return (
          <div
            key={t.id}
            role="tabpanel"
            id={`right-tabpanel-${t.id}`}
            aria-labelledby={`right-tab-${t.id}`}
            aria-hidden={!active}
            hidden={!active}
            className="panel-in min-h-0 flex-1 overflow-y-auto"
          >
            {t.id === 'entity' ? <EntityPanel /> : <AnalystPanel />}
          </div>
        );
      })}
    </aside>
  );
}
