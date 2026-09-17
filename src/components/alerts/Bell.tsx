'use client';

/** Top-bar bell: unread badge + a dropdown of watchlist alerts (PRD §5.10). */
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useWatchlist } from '@/stores/watchlist';
import { BellIcon } from '@/components/shell/icons';
import { formatDtg } from '@/lib/client/format';
import { openAlert } from './Toaster';
import { useEscapeLayer } from '@/hooks/useEscapeLayer';
import { ESCAPE_PRIORITY } from '@/lib/client/shortcuts';

export function AlertBell() {
  const alerts = useWatchlist((s) => s.alerts);
  const watched = useWatchlist((s) => s.entityIds.length);
  const markAllRead = useWatchlist((s) => s.markAllRead);
  const clearAlerts = useWatchlist((s) => s.clearAlerts);
  const unread = alerts.reduce((n, a) => n + (a.read ? 0 : 1), 0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEscapeLayer(open, () => setOpen(false), ESCAPE_PRIORITY.menu);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={unread ? `Alerts, ${unread} unread` : 'Alerts'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="alert-bell"
        data-unread={unread}
        className={clsx('relative flex h-7 w-7 items-center justify-center rounded hover:bg-panel-2 hover:text-text', unread ? 'text-cartel' : 'text-muted')}
      >
        <BellIcon />
        {unread > 0 && (
          <span data-testid="alert-badge" className="absolute -right-0.5 -top-0.5 min-w-[14px] rounded-full bg-cartel px-1 text-center font-mono text-[9px] font-bold leading-[14px] text-[#1a0d02]">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="menu" data-testid="alert-menu" className="panel absolute right-0 top-8 z-30 w-[320px] overflow-hidden shadow-lg shadow-black/50">
          <div className="flex items-center justify-between border-b border-border px-2 py-1">
            <span className="font-mono text-[9px] tracking-[0.18em] text-muted">WATCHLIST ALERTS · {watched} WATCHED</span>
            <span className="flex gap-2">
              <button type="button" onClick={markAllRead} disabled={!unread} className="text-[10px] text-muted hover:text-text disabled:opacity-40">Mark all read</button>
              <button type="button" onClick={clearAlerts} disabled={!alerts.length} className="text-[10px] text-muted hover:text-text disabled:opacity-40">Clear</button>
            </span>
          </div>
          {alerts.length === 0 ? (
            <div className="px-2 py-3 text-[11px] text-muted" data-testid="alerts-empty" data-state="empty">
              {watched === 0
                ? 'No alerts yet, and nothing is on the watchlist. Select an entity and press the star in its profile; an alert lands here when a report naming it arrives or is replayed.'
                : `No alerts yet. Watching ${watched} entit${watched === 1 ? 'y' : 'ies'}: an alert lands here when a report naming one arrives or is replayed.`}
            </div>
          ) : (
            <ol className="max-h-[50vh] overflow-y-auto">
              {alerts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { openAlert(a); setOpen(false); }}
                    className={clsx('grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-2 border-b border-border/60 px-2 py-1 text-left hover:bg-panel-2', a.read ? 'text-muted' : 'text-text')}
                  >
                    <span aria-hidden="true" className={clsx('h-1.5 w-1.5 rounded-full', a.read ? 'bg-transparent' : 'bg-cartel')} />
                    <span className="min-w-0">
                      <span className="block truncate text-[12px]">{a.entityName}</span>
                      <span className="block truncate text-[10px] text-muted">{a.reportNumber} · {a.reportTitle}</span>
                    </span>
                    <span className="font-mono text-[9px] text-muted">{formatDtg(a.at)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

export default AlertBell;
