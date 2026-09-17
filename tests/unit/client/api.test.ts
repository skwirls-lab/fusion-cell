import { describe, it, expect } from 'vitest';
import { buildQuery } from '@/lib/client/api';

describe('buildQuery', () => {
  it('serialises arrays as CSV and drops empties', () => {
    expect(buildQuery({ type: ['SIGINT', 'HUMINT'], limit: 30, q: '', faction: [], x: null, y: undefined })).toBe('?type=SIGINT%2CHUMINT&limit=30');
    expect(buildQuery()).toBe('');
  });
});
