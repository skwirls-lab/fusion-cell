/** Small pure formatters shared by the views. Kept dependency-free so they unit-test trivially. */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `DD HHMMZ` — the day and time of a military date-time group, in UTC. */
export function formatDtg(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}Z`;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Full DTG: `DDHHMMZ MON YY`. */
export function formatDtgFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}Z ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(-2)}`;
}

/** Scenario day: day 1 is 2026-08-01 (story bible). Null when the date is unparseable. */
export const SCENARIO_EPOCH = Date.UTC(2026, 7, 1);
export function scenarioDay(iso: string): number | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((t - SCENARIO_EPOCH) / 86_400_000) + 1;
}

/** ISO → value for `<input type="datetime-local">` (UTC, minute precision). */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** datetime-local value → ISO (treated as UTC so the scenario clock is timezone-free). */
export function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** `#rrggbb` → [r, g, b]; falls back to the unaffiliated grey on bad input. */
export function hexToRgb(hex: string | undefined | null): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return [156, 163, 175];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function confidencePct(c: number): string {
  return `${Math.round(Math.max(0, Math.min(1, c)) * 100)}%`;
}
