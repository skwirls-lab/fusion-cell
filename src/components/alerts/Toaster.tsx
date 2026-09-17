'use client';

/**
 * Watchlist toasts (PRD §5.10): bottom-right, auto-dismiss after 6s, click →
 * select the entity and open the report. Also the one place the persisted
 * watchlist is hydrated, so SSR markup never disagrees with localStorage.
 */
import { useEffect } from 'react';
import clsx from 'clsx';
import { hydrateWatchlist, useWatchlist, type Alert } from '@/stores/watchlist';
import { useSelection } from '@/stores/selection';
import { selectEntity } from '@/lib/client/select';
import { usePrefersReducedMotion } from '@/lib/client/motion';
import styles from './toaster.module.css';

export const TOAST_MS = 6000;

/** Shared by the toast and the bell dropdown: one click lands on the entity and the report. */
export function openAlert(a: Alert): void {
  useWatchlist.getState().markRead(a.id);
  selectEntity(a.entityId);
  useSelection.getState().openReport(a.reportNumber);
}

function Toast({ a }: { a: Alert }) {
  const dismiss = useWatchlist((s) => s.dismissToast);
  useEffect(() => {
    const t = window.setTimeout(() => dismiss(a.id), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [a.id, dismiss]);
  return (
    <div role="status" data-testid="toast" data-alert-id={a.id} className={clsx('panel pointer-events-auto flex w-[300px] items-stretch shadow-lg shadow-black/60', styles.toast)}>
      <button
        type="button"
        onClick={() => { dismiss(a.id); openAlert(a); }}
        data-testid="toast-open"
        className="min-w-0 flex-1 px-2.5 py-1.5 text-left hover:bg-panel-2"
      >
        <div className="font-mono text-[9px] tracking-[0.18em] text-cartel">WATCHLIST · {a.reportNumber}</div>
        <div className="truncate text-[12px] font-semibold text-text">{a.entityName}</div>
        <div className="line-clamp-2 text-[11px] leading-snug text-muted">{a.reportTitle}</div>
      </button>
      <button type="button" onClick={() => dismiss(a.id)} aria-label="Dismiss" className="border-l border-border px-2 text-muted hover:text-text">×</button>
    </div>
  );
}

export function Toaster() {
  const toasts = useWatchlist((s) => s.toasts);
  const reduced = usePrefersReducedMotion();
  useEffect(() => { hydrateWatchlist(); }, []);
  return (
    <div
      aria-live="polite"
      data-reduced-motion={reduced ? 'true' : undefined}
      className="pointer-events-none absolute bottom-2 right-2 z-40 flex flex-col items-end gap-1.5"
    >
      {toasts.slice(-4).map((a) => <Toast key={a.id} a={a} />)}
    </div>
  );
}

export default Toaster;
