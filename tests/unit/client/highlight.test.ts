import { describe, it, expect } from 'vitest';
import { segmentBody } from '@/lib/client/highlight';

describe('segmentBody', () => {
  const terms = [
    { id: 'per_ilsa_varro', names: ['Ilsa Varro', 'I. Varro'] },
    { id: 'per_ansel_varro', names: ['Ansel Varro'] },
  ];
  it('tags every occurrence, longest name first, case-insensitively', () => {
    const segs = segmentBody('Lt Cmdr I. VARRO met Ansel Varro; ansel varro left.', terms);
    expect(segs.filter((s) => s.entityId).map((s) => [s.text, s.entityId])).toEqual([
      ['I. VARRO', 'per_ilsa_varro'], ['Ansel Varro', 'per_ansel_varro'], ['ansel varro', 'per_ansel_varro'],
    ]);
    expect(segs.map((s) => s.text).join('')).toBe('Lt Cmdr I. VARRO met Ansel Varro; ansel varro left.');
  });
  it('does not match inside other words and ignores very short aliases', () => {
    expect(segmentBody('Varrox', [{ id: 'x', names: ['Varro'] }])).toEqual([{ text: 'Varrox' }]);
    expect(segmentBody('to be', [{ id: 'x', names: ['to'] }])).toEqual([{ text: 'to be' }]);
  });
  it('handles empty input', () => {
    expect(segmentBody('', terms)).toEqual([{ text: '' }]);
    expect(segmentBody('plain', [])).toEqual([{ text: 'plain' }]);
  });
});
