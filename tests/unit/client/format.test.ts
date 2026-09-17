import { describe, it, expect } from 'vitest';
import { formatDtg, formatDtgFull, scenarioDay, hexToRgb, isoToLocalInput, localInputToIso, confidencePct } from '@/lib/client/format';

describe('format', () => {
  it('formats DTGs in UTC', () => {
    expect(formatDtg('2026-08-03T19:05:00.000Z')).toBe('03 1905Z');
    expect(formatDtgFull('2026-08-03T19:05:00.000Z')).toBe('031905Z AUG 26');
    expect(formatDtg('garbage')).toBe('—');
  });
  it('derives the scenario day from 2026-08-01', () => {
    expect(scenarioDay('2026-08-01T00:00:00Z')).toBe(1);
    expect(scenarioDay('2026-08-31T23:59:00Z')).toBe(31);
    expect(scenarioDay('nope')).toBeNull();
  });
  it('round-trips datetime-local values as UTC', () => {
    const iso = localInputToIso('2026-08-10T12:30');
    expect(iso).toBe('2026-08-10T12:30:00.000Z');
    expect(isoToLocalInput(iso)).toBe('2026-08-10T12:30');
    expect(isoToLocalInput(null)).toBe('');
  });
  it('parses hex colours with a grey fallback', () => {
    expect(hexToRgb('#22d3ee')).toEqual([34, 211, 238]);
    expect(hexToRgb('nope')).toEqual([156, 163, 175]);
    expect(confidencePct(0.456)).toBe('46%');
  });
});
