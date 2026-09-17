import { describe, it, expect } from 'vitest';
import { buildAdjacency, neighborhood, shortestPaths, centrality, type GraphEdge } from '@/lib/graph';

// The clue-chain shape: varro -> brightwater -> cartel -> hegemony, plus a
// red-herring branch and an unreachable island.
const E = (id: string, s: string, t: string, type = 'associated_with'): GraphEdge =>
  ({ id, source: s, target: t, type, confidence: 0.7 });

const edges: GraphEdge[] = [
  E('e1', 'varro', 'brightwater', 'pays'),
  E('e2', 'brightwater', 'cartel', 'pays'),
  E('e3', 'cartel', 'hegemony', 'communicates_with'),
  E('e4', 'renley', 'kestrel', 'travels_to'),
  E('e5', 'varro', 'kestrel', 'travels_to'),
  E('e6', 'brightwater', 'kestrel', 'located_at'),
  E('e7', 'island_a', 'island_b'),
];
const adj = buildAdjacency(edges);

describe('neighborhood', () => {
  it('depth 1 returns direct neighbours and the root', () => {
    const r = neighborhood(adj, 'varro', 1);
    expect(new Set(r.nodeIds)).toEqual(new Set(['varro', 'brightwater', 'kestrel']));
    expect(r.depthOf.brightwater).toBe(1);
  });
  it('depth 2 reaches the cartel', () => {
    const r = neighborhood(adj, 'varro', 2);
    expect(r.nodeIds).toContain('cartel');
    expect(r.depthOf.cartel).toBe(2);
    expect(r.nodeIds).not.toContain('hegemony');
  });
  it('filters by relationship type', () => {
    const r = neighborhood(adj, 'varro', 3, ['pays']);
    expect(new Set(r.nodeIds)).toEqual(new Set(['varro', 'brightwater', 'cartel']));
    expect(r.nodeIds).not.toContain('kestrel');
  });
});

describe('shortestPaths', () => {
  it('finds the four-node clue chain in 3 hops', () => {
    const p = shortestPaths(adj, 'varro', 'hegemony', 4);
    expect(p).toHaveLength(1);
    expect(p[0].nodeIds).toEqual(['varro', 'brightwater', 'cartel', 'hegemony']);
    expect(p[0].edgeIds).toEqual(['e1', 'e2', 'e3']);
    expect(p[0].hops).toBe(3);
  });
  it('respects maxHops', () => {
    expect(shortestPaths(adj, 'varro', 'hegemony', 2)).toEqual([]);
  });
  it('returns [] for unreachable nodes', () => {
    expect(shortestPaths(adj, 'varro', 'island_a', 6)).toEqual([]);
  });
  it('returns all equally-short alternatives', () => {
    // varro->kestrel directly (1 hop) is shortest; only one such path.
    const direct = shortestPaths(adj, 'varro', 'kestrel');
    expect(direct).toHaveLength(1);
    // renley->brightwater: renley-kestrel-brightwater (2 hops), unique.
    const p = shortestPaths(adj, 'renley', 'brightwater');
    expect(p).toHaveLength(1);
    expect(p[0].nodeIds).toEqual(['renley', 'kestrel', 'brightwater']);
  });
  it('handles from === to', () => {
    expect(shortestPaths(adj, 'varro', 'varro')).toEqual([{ nodeIds: ['varro'], edgeIds: [], hops: 0 }]);
  });
});

describe('centrality', () => {
  it('ranks the broker (brightwater) highest by betweenness', () => {
    const rows = centrality(adj);
    expect(rows[0].id).toBe('brightwater');
    const bw = rows.find((r) => r.id === 'brightwater')!;
    expect(bw.degree).toBe(3);
    const island = rows.find((r) => r.id === 'island_a')!;
    expect(island.betweenness).toBe(0);
  });
});
