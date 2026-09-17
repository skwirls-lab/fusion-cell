import { describe, it, expect } from 'vitest';
import { buildQuery } from '@/lib/client/api';

describe('buildQuery', () => {
  it('serialises arrays as CSV and drops empties', () => {
    expect(buildQuery({ type: ['SIGINT', 'HUMINT'], limit: 30, q: '', faction: [], x: null, y: undefined })).toBe('?type=SIGINT%2CHUMINT&limit=30');
    expect(buildQuery()).toBe('');
  });
});

describe('apiErrorDetail / ApiRequestError', () => {
  it('surfaces the typed error body: code, then the message or the first validation issue', async () => {
    const { apiErrorDetail, ApiRequestError } = await import('@/lib/client/api');
    expect(apiErrorDetail({ error: 'internal_error', message: 'connection refused' })).toBe('internal_error — connection refused');
    expect(apiErrorDetail({ error: 'not_found' })).toBe('not_found');
    expect(apiErrorDetail({ error: 'invalid_request', issues: [{ path: ['limit'], message: 'Too big' }] })).toBe('invalid_request — limit: Too big');
    expect(apiErrorDetail({ error: 'invalid_request', issues: [{ path: [], message: 'Required' }] })).toBe('invalid_request — Required');
    expect(apiErrorDetail(null)).toBe('request failed');
    expect(apiErrorDetail('<html>502</html>')).toBe('request failed');
    const e = new ApiRequestError(500, '/api/reports?limit=30', { error: 'internal_error', message: 'boom' });
    expect(e.message).toBe('/api/reports?limit=30 → 500: internal_error — boom');
    expect(e.status).toBe(500);
  });
});
