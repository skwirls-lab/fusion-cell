'use client';

import { useUiStore } from '@/stores/ui';
import { ChevronIcon } from './icons';
import FeedView from '@/components/feed';
import Timeline from '@/components/timeline';

export function BottomDrawer() {
  const open = useUiStore((s) => s.drawerOpen);
  const toggle = useUiStore((s) => s.toggleDrawer);

  return (
    <section
      id="bottom-drawer"
      aria-label="Live feed"
      className="flex shrink-0 flex-col border-t border-border bg-panel"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="bottom-drawer-body"
        className="flex h-7 w-full shrink-0 items-center justify-between px-2 text-left hover:bg-panel-2"
      >
        <span className="font-mono text-[10px] font-semibold tracking-[0.18em] text-muted">LIVE FEED</span>
        <span className="text-muted"><ChevronIcon up={!open} /></span>
      </button>
      {/* Height-driven collapse so it can transition (PRD §8: panel transitions ≤200ms); `inert` keeps
          a collapsed drawer out of the tab order. The timeline stays mounted so a replay keeps its clock. */}
      <div
        id="bottom-drawer-body"
        inert={!open}
        aria-hidden={!open}
        className="flex min-h-0 flex-col overflow-hidden border-t border-border transition-[height] duration-200 ease-out motion-reduce:transition-none"
        style={{ height: open ? 250 : 0 }}
      >
        <Timeline />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <FeedView />
        </div>
      </div>
    </section>
  );
}
