import { describe, it, expect } from 'vitest';
import { TOOLS, toToolSpecs, stringifyResult, RESULT_CHAR_CAP } from '@/lib/ai/tools';

// BUILD.md §9. compute_centrality (PRD §7) is registered as a ninth tool.
const BUILD_MD_TOOLS = [
  'search_reports', 'get_report', 'search_entities', 'get_entity',
  'get_neighbors', 'find_paths', 'get_timeline', 'highlight_in_ui',
];

describe('analyst tools', () => {
  it('registers the eight BUILD.md §9 tools (plus compute_centrality) with unique names', () => {
    const names = TOOLS.map((t) => t.name);
    for (const n of BUILD_MD_TOOLS) expect(names).toContain(n);
    expect(names).toContain('compute_centrality');
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(9);
  });

  it('every tool converts to a JSON-schema object parameter spec', () => {
    const specs = toToolSpecs();
    expect(specs.map((s) => s.name)).toEqual(TOOLS.map((t) => t.name));
    for (const s of specs) {
      expect(s.parameters.type).toBe('object');
      expect(typeof s.parameters.properties).toBe('object');
      expect(s.parameters).not.toHaveProperty('$schema');
      expect(s.description.length).toBeGreaterThan(40);
    }
    const search = specs.find((s) => s.name === 'search_reports')!;
    expect(search.parameters.required).toEqual(['query']);
    expect(search.description).toMatch(/report_number/);
  });

  it('schemas apply defaults and reject out-of-range values', () => {
    const neighbors = TOOLS.find((t) => t.name === 'get_neighbors')!;
    expect(neighbors.schema.parse({ entity_id: 'x' })).toEqual({ entity_id: 'x', depth: 1 });
    expect(neighbors.schema.safeParse({ entity_id: 'x', depth: 4 }).success).toBe(false);
    const highlight = TOOLS.find((t) => t.name === 'highlight_in_ui')!;
    expect(highlight.schema.parse({})).toEqual({ entity_ids: [], event_ids: [], edge_ids: [] });
  });

  it('stringifyResult caps oversized results by trimming arrays and marking truncation', () => {
    const big = { reports: Array.from({ length: 400 }, (_, i) => ({ report_number: `R-${String(i).padStart(4, '0')}`, snippet: 'x'.repeat(100) })) };
    const text = stringifyResult(big);
    expect(text.length).toBeLessThanOrEqual(RESULT_CHAR_CAP);
    const parsed = JSON.parse(text) as { truncated: boolean; reports: unknown[]; dropped: Record<string, number> };
    expect(parsed.truncated).toBe(true);
    expect(parsed.reports.length).toBeGreaterThan(0);
    expect(parsed.reports.length + parsed.dropped.reports).toBe(400);
    // Small results pass through untouched.
    expect(stringifyResult({ ok: true })).toBe('{"ok":true}');
  });
});
