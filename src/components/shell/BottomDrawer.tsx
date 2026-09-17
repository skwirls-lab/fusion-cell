'use client';

import { useUiStore } from '@/stores/ui';
import { ChevronIcon } from './icons';
import FeedView from '@/components/feed';

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
      <div
        id="bottom-drawer-body"
        hidden={!open}
        className="h-[220px] min-h-0 overflow-y-auto border-t border-border"
      >
        <FeedView />
      </div>
    </section>
  );
}
