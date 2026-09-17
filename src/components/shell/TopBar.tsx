'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellIcon, UserIcon } from './icons';

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
        <input
          id="global-search"
          type="search"
          autoComplete="off"
          placeholder="Search entities, reports… ( / )"
          aria-label="Global search"
          className="h-7 w-full max-w-[520px] rounded border border-border bg-bg px-2.5 text-[12px] text-text placeholder:text-muted focus:border-concord/60 focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <span
          className="font-mono text-[11px] tracking-wider text-muted"
          title="Scenario clock (wired in a later phase)"
          data-testid="scenario-clock"
        >
          SCENARIO DAY —
        </span>

        <button
          type="button"
          aria-label="Alerts"
          className="relative flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-panel-2 hover:text-text"
        >
          <BellIcon />
        </button>

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
