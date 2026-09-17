/**
 * Pure graph algorithms over the relationships table, loaded into memory.
 * ~400 edges: every function here runs in microseconds. Pure so they are
 * trivially testable and usable from both API routes and AI tools.
 */

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  confidence: number;
}

export interface Adjacency {
  /** node -> list of (edge, neighbour) in both directions */
  out: Map<string, Array<{ edge: GraphEdge; to: string }>>;
  nodes: Set<string>;
}

export function buildAdjacency(edges: GraphEdge[]): Adjacency {
  const out = new Map<string, Array<{ edge: GraphEdge; to: string }>>();
  const nodes = new Set<string>();
  const push = (from: string, to: string, edge: GraphEdge) => {
    if (!out.has(from)) out.set(from, []);
    out.get(from)!.push({ edge, to });
  };
  for (const e of edges) {
    nodes.add(e.source); nodes.add(e.target);
    push(e.source, e.target, e); // relationships are traversed undirected
    push(e.target, e.source, e);
  }
  return { out, nodes };
}

export interface NeighborhoodResult {
  nodeIds: string[];  // includes the root
  edgeIds: string[];
  depthOf: Record<string, number>;
}

/** BFS out to `depth` hops, optionally restricted to relationship types. */
export function neighborhood(adj: Adjacency, root: string, depth: number, relTypes?: string[]): NeighborhoodResult {
  const allow = relTypes && relTypes.length ? new Set(relTypes) : null;
  const depthOf: Record<string, number> = { [root]: 0 };
  const edgeIds = new Set<string>();
  let frontier = [root];
  for (let d = 1; d <= depth && frontier.length; d++) {
    const next: string[] = [];
    for (const n of frontier) {
      for (const { edge, to } of adj.out.get(n) ?? []) {
        if (allow && !allow.has(edge.type)) continue;
        edgeIds.add(edge.id);
        if (!(to in depthOf)) { depthOf[to] = d; next.push(to); }
      }
    }
    frontier = next;
  }
  return { nodeIds: Object.keys(depthOf), edgeIds: [...edgeIds], depthOf };
}

export interface PathResult {
  nodeIds: string[];
  edgeIds: string[];
  hops: number;
}

/**
 * All shortest paths between two nodes up to maxHops (BFS with parent lists),
 * capped at `limit` results so a dense graph can't explode the response.
 * Returns [] when unreachable within maxHops.
 */
export function shortestPaths(adj: Adjacency, from: string, to: string, maxHops = 4, limit = 5, opts: { excludeIntermediate?: Set<string> } = {}): PathResult[] {
  if (from === to) return [{ nodeIds: [from], edgeIds: [], hops: 0 }];
  if (!adj.nodes.has(from) || !adj.nodes.has(to)) return [];
  // Hub nodes (e.g. every location) make every pair trivially 2 hops apart;
  // callers can keep them as endpoints but forbid passing through them.
  const skip = opts.excludeIntermediate;

  const dist = new Map<string, number>([[from, 0]]);
  const parents = new Map<string, Array<{ prev: string; edgeId: string }>>();
  let frontier = [from];
  let found = false;

  for (let d = 1; d <= maxHops && frontier.length && !found; d++) {
    const next: string[] = [];
    for (const n of frontier) {
      for (const { edge, to: m } of adj.out.get(n) ?? []) {
        if (skip && m !== to && skip.has(m)) continue;
        const known = dist.get(m);
        if (known === undefined) {
          dist.set(m, d); next.push(m);
          parents.set(m, [{ prev: n, edgeId: edge.id }]);
        } else if (known === d) {
          parents.get(m)!.push({ prev: n, edgeId: edge.id }); // another shortest path
        }
        if (m === to) found = true;
      }
    }
    frontier = next;
  }
  if (!found) return [];

  // Enumerate paths back from `to`.
  const results: PathResult[] = [];
  const walk = (node: string, nodesRev: string[], edgesRev: string[]) => {
    if (results.length >= limit) return;
    if (node === from) {
      results.push({ nodeIds: [...nodesRev].reverse(), edgeIds: [...edgesRev].reverse(), hops: edgesRev.length });
      return;
    }
    for (const p of parents.get(node) ?? []) {
      walk(p.prev, [...nodesRev, p.prev], [...edgesRev, p.edgeId]);
    }
  };
  walk(to, [to], []);
  return results;
}

export interface CentralityRow { id: string; degree: number; betweenness: number }

/** Degree + Brandes betweenness. Unweighted, undirected. */
export function centrality(adj: Adjacency): CentralityRow[] {
  const nodes = [...adj.nodes];
  const degree = new Map<string, number>();
  const bet = new Map<string, number>();
  for (const n of nodes) { degree.set(n, (adj.out.get(n) ?? []).length); bet.set(n, 0); }

  for (const s of nodes) {
    const stack: string[] = [];
    const pred = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const dist = new Map<string, number>();
    for (const n of nodes) { pred.set(n, []); sigma.set(n, 0); dist.set(n, -1); }
    sigma.set(s, 1); dist.set(s, 0);
    const queue = [s];
    while (queue.length) {
      const v = queue.shift()!;
      stack.push(v);
      for (const { to: w } of adj.out.get(v) ?? []) {
        if (dist.get(w)! < 0) { queue.push(w); dist.set(w, dist.get(v)! + 1); }
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          pred.get(w)!.push(v);
        }
      }
    }
    const delta = new Map<string, number>(nodes.map((n) => [n, 0]));
    while (stack.length) {
      const w = stack.pop()!;
      for (const v of pred.get(w)!) {
        delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
      }
      if (w !== s) bet.set(w, bet.get(w)! + delta.get(w)!);
    }
  }
  // Undirected: each pair counted twice.
  return nodes
    .map((id) => ({ id, degree: degree.get(id)!, betweenness: bet.get(id)! / 2 }))
    .sort((a, b) => b.betweenness - a.betweenness || b.degree - a.degree);
}
