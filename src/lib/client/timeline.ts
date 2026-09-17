/**
 * Pure cursor math for the scenario timeline (MAP-7 / PRD §5.5 replay). The
 * cursor is a fraction 0..1 across the 30-day window; 1 means "no cutoff".
 * Kept dependency-free so the unit test covers it without a DOM.
 */
import { SCENARIO_DAYS, SCENARIO_END, SCENARIO_EPOCH, formatDtg } from './format';

export type Speed = 1 | 4 | 12;
export const SPEEDS: readonly Speed[] = [1, 4, 12];

/** At 1× one scenario day passes in 10 real seconds. */
export const REAL_MS_PER_DAY = 10_000;
/** Filter pushes are quantized to this so a replay does not fire a query per frame. */
export const STEP_MS = 2 * 3_600_000;

const WINDOW_MS = SCENARIO_END - SCENARIO_EPOCH;

export function clampFraction(f: number): number {
  if (!Number.isFinite(f)) return 1;
  return Math.max(0, Math.min(1, f));
}

export function fractionToIso(f: number): string {
  return new Date(SCENARIO_EPOCH + clampFraction(f) * WINDOW_MS).toISOString();
}

/** ISO → fraction, clamped to the window; null (no cutoff) and garbage read as the end. */
export function isoToFraction(iso: string | null | undefined): number {
  if (!iso) return 1;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 1;
  return clampFraction((t - SCENARIO_EPOCH) / WINDOW_MS);
}

/** Real milliseconds one scenario day takes at a given speed. */
export function msPerDay(speed: Speed): number {
  return REAL_MS_PER_DAY / speed;
}

/** Advance the cursor by a real-time delta at a speed; saturates at 1. */
export function advance(f: number, dtMs: number, speed: Speed): number {
  if (!(dtMs > 0)) return clampFraction(f);
  return clampFraction(f + dtMs / (msPerDay(speed) * SCENARIO_DAYS));
}

/** Snap a fraction down to the STEP_MS grid (the value pushed into filters.to). */
export function quantize(f: number): number {
  const ms = clampFraction(f) * WINDOW_MS;
  return Math.floor(ms / STEP_MS) * STEP_MS / WINDOW_MS;
}

/** Fraction at the start of scenario day n (1-based). */
export function dayStart(day: number): number {
  return clampFraction((day - 1) / SCENARIO_DAYS);
}

/** 1-based scenario day under the cursor; the end of the window reads as day 31 (past the last day). */
export function cursorDay(f: number): number {
  const c = clampFraction(f);
  return c >= 1 ? SCENARIO_DAYS + 1 : Math.floor(c * SCENARIO_DAYS) + 1;
}

/** "DAY n · DD HHMMZ" — mono label for the scrubber and the top-bar clock. */
export function cursorLabel(f: number): string {
  return `DAY ${cursorDay(f)} · ${formatDtg(fractionToIso(f))}`;
}

/** Events per scenario day (index 0 = day 1); anything outside the window is dropped. */
export function densityByDay(isoDates: Iterable<string>): number[] {
  const out = new Array<number>(SCENARIO_DAYS).fill(0);
  for (const iso of isoDates) {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) continue;
    const d = Math.floor((t - SCENARIO_EPOCH) / 86_400_000);
    if (d >= 0 && d < SCENARIO_DAYS) out[d] += 1;
  }
  return out;
}
