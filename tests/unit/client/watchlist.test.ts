/** Phase 7: watchlist store — persistence round-trip, alert dedupe, unread count, cap. */
import { describe, it, expect, beforeEach } from 'vitest';
import { ALERT_CAP, STORAGE_KEY, hydrateWatchlist, resetWatchlistForTests, useWatchlist } from '@/stores/watchlist';

/** A minimal localStorage stand-in; `broken` makes every access throw. */
function stubStorage(initial: Record<string, string> = {}, broken = false): Map<string, string> {
  const m = new Map(Object.entries(initial));
  const boom = () => { throw new Error('storage disabled'); };
  const s = {
    getItem: (k: string) => (broken ? boom() : m.get(k) ?? null),
    setItem: (k: string, v: string) => { if (broken) boom(); m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: s, configurable: true, writable: true });
  return m;
}

const alertFor = (report: string, entityId = 'org_brightwater') => ({ entityId, entityName: 'Brightwater Hauling', reportNumber: report, reportTitle: `Report ${report}` });

beforeEach(() => { resetWatchlistForTests(); });

describe('watchlist store', () => {
  it('toggles and persists entity ids through localStorage', () => {
    const m = stubStorage();
    hydrateWatchlist();
    const s = useWatchlist.getState();
    s.toggle('org_brightwater');
    expect(useWatchlist.getState().has('org_brightwater')).toBe(true);
    expect(JSON.parse(m.get(STORAGE_KEY)!)).toMatchObject({ entityIds: ['org_brightwater'] });
    s.toggle('org_brightwater');
    expect(useWatchlist.getState().entityIds).toEqual([]);
    s.add('per_ilsa_varro'); s.add('per_ilsa_varro');
    expect(useWatchlist.getState().entityIds).toEqual(['per_ilsa_varro']);

    // A fresh store reading the same storage comes back with the same watchlist.
    resetWatchlistForTests();
    expect(useWatchlist.getState().entityIds).toEqual([]);
    hydrateWatchlist();
    expect(useWatchlist.getState().entityIds).toEqual(['per_ilsa_varro']);
    expect(useWatchlist.getState().hydrated).toBe(true);
  });

  it('dedupes alerts per (report, entity) and counts unread', () => {
    stubStorage();
    hydrateWatchlist();
    const s = useWatchlist.getState();
    expect(s.pushAlert(alertFor('R-0023'))).toBe(true);
    expect(s.pushAlert(alertFor('R-0023'))).toBe(false);
    expect(s.pushAlert(alertFor('R-0023', 'org_ashen_cartel'))).toBe(true);
    expect(s.pushAlert(alertFor('R-0031'))).toBe(true);
    expect(useWatchlist.getState().alerts).toHaveLength(3);
    expect(useWatchlist.getState().toasts).toHaveLength(3);
    expect(useWatchlist.getState().alerts[0].reportNumber).toBe('R-0031'); // newest first
    expect(useWatchlist.getState().unreadCount()).toBe(3);
    s.markRead('R-0023:org_brightwater');
    expect(useWatchlist.getState().unreadCount()).toBe(2);
    s.dismissToast('R-0023:org_brightwater');
    expect(useWatchlist.getState().toasts.map((t) => t.id)).toEqual(['R-0023:org_ashen_cartel', 'R-0031:org_brightwater']);
    s.markAllRead();
    expect(useWatchlist.getState().unreadCount()).toBe(0);
    // Read state survives a reload; toasts do not.
    resetWatchlistForTests();
    hydrateWatchlist();
    expect(useWatchlist.getState().alerts).toHaveLength(3);
    expect(useWatchlist.getState().unreadCount()).toBe(0);
    expect(useWatchlist.getState().toasts).toEqual([]);
    s.clearAlerts();
    expect(useWatchlist.getState().alerts).toEqual([]);
  });

  it('caps the alert log at 50, dropping the oldest', () => {
    const m = stubStorage();
    hydrateWatchlist();
    for (let i = 1; i <= ALERT_CAP + 7; i++) useWatchlist.getState().pushAlert(alertFor(`R-${String(i).padStart(4, '0')}`));
    const alerts = useWatchlist.getState().alerts;
    expect(alerts).toHaveLength(ALERT_CAP);
    expect(alerts[0].reportNumber).toBe('R-0057');
    expect(alerts[ALERT_CAP - 1].reportNumber).toBe('R-0008');
    expect(JSON.parse(m.get(STORAGE_KEY)!).alerts).toHaveLength(ALERT_CAP);
  });

  it('degrades to memory when storage throws or holds garbage', () => {
    stubStorage({ [STORAGE_KEY]: '{not json' });
    expect(() => hydrateWatchlist()).not.toThrow();
    expect(useWatchlist.getState().entityIds).toEqual([]);
    resetWatchlistForTests();
    stubStorage({}, true);
    expect(() => hydrateWatchlist()).not.toThrow();
    expect(() => useWatchlist.getState().toggle('org_brightwater')).not.toThrow();
    expect(useWatchlist.getState().has('org_brightwater')).toBe(true);
  });
});
