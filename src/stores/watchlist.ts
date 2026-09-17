/**
 * Watchlist + alerts (PRD §5.10), client-side. Starred entity ids and the
 * alert log persist in localStorage; toasts are ephemeral. Persistence is
 * best-effort: every storage access is wrapped, so a private window or a
 * blocked origin degrades to an in-memory watchlist rather than an error.
 *
 * The store starts empty on both server and client and is filled by
 * `hydrateWatchlist()` after mount, so SSR markup never disagrees with what
 * the browser has stored.
 */
import { create } from 'zustand';

export interface Alert {
  /** `${reportNumber}:${entityId}` — the dedupe key: one alert per (report, entity). */
  id: string;
  entityId: string;
  entityName: string;
  reportNumber: string;
  reportTitle: string;
  at: string;          // ISO, when the alert fired (wall clock)
  read: boolean;
}

export const STORAGE_KEY = 'fusion-cell.watchlist.v1';
export const ALERT_CAP = 50;

interface Persisted { entityIds: string[]; alerts: Alert[] }

export interface WatchlistState {
  entityIds: string[];
  add: (id: string) => void;
  remove: (id: string) => void;
  toggle: (id: string) => void;
  has: (id: string) => boolean;

  alerts: Alert[];
  /** Records the alert and queues a toast; returns false (and does nothing) when it already exists. */
  pushAlert: (a: Omit<Alert, 'id' | 'at' | 'read'>) => boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAlerts: () => void;
  unreadCount: () => number;

  toasts: Alert[];
  dismissToast: (id: string) => void;

  hydrated: boolean;
}

function storage(): Storage | null {
  try {
    const s = (globalThis as { localStorage?: Storage }).localStorage;
    return s ?? null;
  } catch { return null; }
}

function load(): Persisted | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Persisted>;
    const ids = Array.isArray(v.entityIds) ? v.entityIds.filter((x): x is string => typeof x === 'string') : [];
    const alerts = Array.isArray(v.alerts) ? v.alerts.filter((a): a is Alert => !!a && typeof a === 'object' && typeof a.id === 'string') : [];
    return { entityIds: ids, alerts: alerts.slice(0, ALERT_CAP) };
  } catch { return null; }
}

function save(p: Persisted): void {
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* quota, private mode, disabled storage */ }
}

export const useWatchlist = create<WatchlistState>((set, get) => ({
  entityIds: [],
  add: (id) => set((s) => (s.entityIds.includes(id) ? s : { entityIds: [...s.entityIds, id] })),
  remove: (id) => set((s) => ({ entityIds: s.entityIds.filter((x) => x !== id) })),
  toggle: (id) => (get().entityIds.includes(id) ? get().remove(id) : get().add(id)),
  has: (id) => get().entityIds.includes(id),

  alerts: [],
  pushAlert: (a) => {
    const id = `${a.reportNumber}:${a.entityId}`;
    if (get().alerts.some((x) => x.id === id)) return false;
    const alert: Alert = { ...a, id, at: new Date().toISOString(), read: false };
    // Newest first, capped: the oldest entries fall off the end.
    set((s) => ({ alerts: [alert, ...s.alerts].slice(0, ALERT_CAP), toasts: [...s.toasts, alert] }));
    return true;
  },
  markRead: (id) => set((s) => ({ alerts: s.alerts.map((x) => (x.id === id && !x.read ? { ...x, read: true } : x)) })),
  markAllRead: () => set((s) => ({ alerts: s.alerts.map((x) => (x.read ? x : { ...x, read: true })) })),
  clearAlerts: () => set({ alerts: [], toasts: [] }),
  unreadCount: () => get().alerts.reduce((n, a) => n + (a.read ? 0 : 1), 0),

  toasts: [],
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  hydrated: false,
}));

/** Load the persisted watchlist once (after mount) and mirror every later change back to storage. */
let persisting: (() => void) | null = null;
export function hydrateWatchlist(): void {
  const stored = load();
  useWatchlist.setState({ ...(stored ?? {}), hydrated: true });
  if (persisting) return;
  persisting = useWatchlist.subscribe((s, prev) => {
    if (s.entityIds === prev.entityIds && s.alerts === prev.alerts) return;
    save({ entityIds: s.entityIds, alerts: s.alerts });
  });
}

/** Test seam: forget the storage subscription so a fresh stub can be hydrated. */
export function resetWatchlistForTests(): void {
  persisting?.();
  persisting = null;
  useWatchlist.setState({ entityIds: [], alerts: [], toasts: [], hydrated: false });
}
