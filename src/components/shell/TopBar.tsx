'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserIcon } from './icons';
import GlobalSearch from '@/components/search';
import AlertBell from '@/components/alerts/Bell';
import { useReports } from '@/lib/client/api';
import { useSelection } from '@/stores/selection';
import { formatDtg, scenarioDay } from '@/lib/client/format';

/**
 * "SCENARIO DAY N": the newest report's date relative to 2026-08-01 (day 1).
 * While the timeline holds a cutoff (filters.to) the clock follows the cursor
 * instead, so a replay reads as the day it is showing.
 */
function ScenarioClock() {
  const to = useSelection((s) => s.filters.to);
  const latest = useReports({ limit: 1, refetchInterval: 30_000 });
  const newest = latest.data?.reports[0]?.reportedAt;
  const day = to ? scenarioDay(to) : newest ? scenarioDay(newest) : null;
  return (
    <span
      className={to ? 'font-mono text-[11px] tracking-wider text-cartel' : 'font-mono text-[11px] tracking-wider text-muted'}
      title={to ? `Replay cutoff: ${formatDtg(to)}` : newest ? `Newest report: ${newest}` : 'Waiting for the first report'}
      data-testid="scenario-clock"
      data-day={day ?? undefined}
      data-replay={to ? 'true' : undefined}
    >
      SCENARIO DAY {day ?? '—'}
    </span>
  );
}

export function TopBar() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch('/api/logout', { method: 'POST' });
    } finally {
      router.push('/login');
    }
  }

  return (
    <header className="flex h-11 shrink-0 items-center gap-4 border-b border-border bg-panel px-3">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[13px] font-semibold tracking-[0.2em] text-text">FUSION CELL</span>
        <span className="hidden text-[11px] text-muted lg:inline">Meridian Reach · All-Source Workspace</span>
      </div>

      <div className="flex flex-1 justify-center">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-3">
        <ScenarioClock />

        <AlertBell />

        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-[11px] text-muted hover:bg-panel-2 hover:text-text"
          >
            <UserIcon />
            <span className="font-mono tracking-wider">ANALYST</span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="panel absolute right-0 top-8 z-20 min-w-[140px] p-1 shadow-lg shadow-black/50"
            >
              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                disabled={signingOut}
                className="w-full rounded px-2 py-1.5 text-left text-[12px] text-text hover:bg-panel-2 disabled:opacity-50"
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
