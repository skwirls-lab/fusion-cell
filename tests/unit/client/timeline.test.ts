/** Phase 7: scenario timeline cursor math (MAP-7). */
import { describe, it, expect } from 'vitest';
import {
  advance, clampFraction, cursorDay, cursorLabel, dayStart, densityByDay, fractionToIso, isoToFraction, msPerDay, quantize, STEP_MS,
} from '@/lib/client/timeline';

describe('timeline cursor math', () => {
  it('maps ISO ↔ fraction across the 30-day window', () => {
    expect(fractionToIso(0)).toBe('2026-08-01T00:00:00.000Z');
    expect(fractionToIso(1)).toBe('2026-08-31T00:00:00.000Z');
    expect(fractionToIso(0.5)).toBe('2026-08-16T00:00:00.000Z');
    expect(isoToFraction('2026-08-16T00:00:00.000Z')).toBeCloseTo(0.5, 10);
    expect(isoToFraction(fractionToIso(0.3))).toBeCloseTo(0.3, 10);
    // No cutoff, garbage, and anything outside the window clamp to the edges.
    expect(isoToFraction(null)).toBe(1);
    expect(isoToFraction('nope')).toBe(1);
    expect(isoToFraction('2026-07-01T00:00:00Z')).toBe(0);
    expect(isoToFraction('2026-09-09T00:00:00Z')).toBe(1);
  });

  it('clamps and labels', () => {
    expect(clampFraction(-2)).toBe(0);
    expect(clampFraction(9)).toBe(1);
    expect(clampFraction(Number.NaN)).toBe(1);
    expect(cursorDay(0)).toBe(1);
    expect(cursorDay(dayStart(8))).toBe(8);
    expect(cursorDay(0.999)).toBe(30);
    expect(cursorDay(1)).toBe(31);
    expect(cursorLabel(0)).toBe('DAY 1 · 01 0000Z');
    expect(cursorLabel(dayStart(8) + 16 / 24 / 30)).toBe('DAY 8 · 08 1600Z');
    expect(cursorLabel(1)).toBe('DAY 31 · 31 0000Z');
  });

  it('speed → real ms per scenario day, and advancing saturates at the end', () => {
    expect(msPerDay(1)).toBe(10_000);
    expect(msPerDay(4)).toBe(2_500);
    expect(msPerDay(12)).toBeCloseTo(833.33, 1);
    // 10 real seconds at 1× is one day = 1/30 of the window.
    expect(advance(0, 10_000, 1)).toBeCloseTo(1 / 30, 10);
    expect(advance(0, 10_000, 12)).toBeCloseTo(12 / 30, 10);
    expect(advance(0.99, 60_000, 12)).toBe(1);
    expect(advance(0.2, -50, 4)).toBe(0.2);
    expect(advance(0.2, Number.NaN, 4)).toBe(0.2);
  });

  it('quantizes filter pushes to the 2-hour grid', () => {
    const twoHours = STEP_MS / (30 * 86_400_000);
    expect(quantize(0)).toBe(0);
    expect(quantize(twoHours * 3.9)).toBeCloseTo(twoHours * 3, 10);
    expect(fractionToIso(quantize(isoToFraction('2026-08-08T17:59:00Z')))).toBe('2026-08-08T16:00:00.000Z');
    expect(quantize(1)).toBe(1);
  });

  it('counts events per scenario day', () => {
    const d = densityByDay(['2026-08-01T05:00:00Z', '2026-08-01T23:59:00Z', '2026-08-30T17:00:00Z', '2026-08-31T00:00:00Z', 'garbage', '2026-07-31T23:00:00Z']);
    expect(d).toHaveLength(30);
    expect(d[0]).toBe(2);
    expect(d[29]).toBe(1);
    expect(d.reduce((a, b) => a + b, 0)).toBe(3);
  });
});
