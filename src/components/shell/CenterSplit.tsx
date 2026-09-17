'use client';

import { useUiStore, type Maximized } from '@/stores/ui';
import { MaximizeIcon, RestoreIcon } from './icons';
import MapView from '@/components/map';
import GraphView from '@/components/graph';

function Pane({ id, kind, title, children }: {
  id: string;
  kind: Exclude<Maximized, null>;
  title: string;
  children: React.ReactNode;
}) {
  const maximized = useUiStore((s) => s.maximized);
  const setMaximized = useUiStore((s) => s.setMaximized);
  const isMax = maximized === kind;
  const hidden = maximized !== null && !isMax;
  const label = title.toLowerCase();

  return (
    <section
      id={id}
      aria-label={title}
      className={'panel flex min-h-0 min-w-0 flex-col overflow-hidden ' + (hidden ? 'hidden' : '')}
    >
      <header className="flex h-7 shrink-0 items-center justify-between border-b border-border bg-panel-2 px-2">
        <h2 className="font-mono text-[10px] font-semibold tracking-[0.18em] text-muted">{title}</h2>
        <button
          type="button"
          onClick={() => setMaximized(isMax ? null : kind)}
          aria-label={isMax ? `Restore ${label}` : `Maximize ${label}`}
          aria-pressed={isMax}
          title={isMax ? 'Restore' : 'Maximize'}
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-border hover:text-text"
        >
          {isMax ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}

export function CenterSplit() {
  const maximized = useUiStore((s) => s.maximized);
  return (
    <div className={'grid min-h-0 gap-1 p-1 ' + (maximized ? 'grid-cols-1' : 'grid-cols-2')}>
      <Pane id="map-pane" kind="map" title="OPERATIONAL MAP"><MapView /></Pane>
      <Pane id="graph-pane" kind="graph" title="LINK CHART"><GraphView /></Pane>
    </div>
  );
}
