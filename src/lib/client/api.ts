/**
 * Browser-side data access. Every view reads the database through these
 * helpers and the HTTP API — nothing imports seed JSON or the DB layer
 * (BUILD.md prime directive #3).
 *
 * Outside production every response is parsed against the Zod contract in
 * src/lib/types.ts so a shape drift between a route and a view throws at the
 * fetch, with the endpoint named, instead of surfacing as `undefined` in a
 * render. The contract module is imported lazily so the production bundle
 * never carries it (it transitively pulls the Drizzle schema).
 */
import { useQuery, type QueryClient } from '@tanstack/react-query';
import type {
  Entity, EntityProfile, Event, Faction, Graph, PathResult, Report, ReportSummary, SearchResult,
} from '@/lib/types';
import type { Filters } from '@/stores/selection';
import { filtersToParams } from '@/stores/selection';

export type Params = Record<string, string | number | string[] | null | undefined>;

export class ApiRequestError extends Error {
  constructor(public readonly status: number, public readonly path: string, public readonly body: unknown) {
    super(`${path} → ${status}: ${typeof body === 'object' && body && 'error' in body ? String((body as { error: unknown }).error) : 'request failed'}`);
    this.name = 'ApiRequestError';
  }
}

/** Serialises params: arrays become CSV (the routes' `csv()` preprocessor), empty values are dropped. */
export function buildQuery(params: Params = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) { if (v.length) sp.set(k, v.join(',')); continue; }
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

const DEV = process.env.NODE_ENV !== 'production';

type SchemaName =
  | 'factions' | 'entities' | 'events' | 'reports' | 'graph'
  | 'entityProfile' | 'report' | 'search' | 'path';

/** Wraps list responses (`{ entities: [...] }`) the same way the routes do. */
async function validate(name: SchemaName, path: string, data: unknown): Promise<void> {
  const t = await import('@/lib/types');
  const { z } = await import('zod');
  const schema = {
    factions: z.object({ factions: z.array(t.FactionOut) }),
    entities: z.object({ entities: z.array(t.EntityOut) }),
    events: z.object({ events: z.array(t.EventOut) }),
    reports: z.object({ reports: z.array(t.ReportSummaryOut), total: z.number().int() }),
    graph: t.GraphOut,
    entityProfile: t.EntityProfileOut,
    report: t.ReportOut,
    search: t.SearchOut,
    path: t.PathOut,
  }[name];
  const r = schema.safeParse(data);
  if (!r.success) {
    console.error(`[api] ${path} does not match the ${name} contract`, r.error.issues);
    throw new Error(`Response from ${path} does not match the ${name} contract`);
  }
}

export async function apiGet<T>(path: string, params?: Params, schema?: SchemaName): Promise<T> {
  const url = `${path}${buildQuery(params)}`;
  const res = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* non-JSON error page; the status is enough */ }
  if (res.status === 401 && typeof window !== 'undefined') {
    // Session expired or missing: go to the login page and come back here afterwards.
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }
  if (!res.ok) throw new ApiRequestError(res.status, url, body);
  if (DEV && schema) await validate(schema, path, body);
  return body as T;
}

// ---- query client seam ------------------------------------------------------------

let queryClient: QueryClient | null = null;
/** Providers registers the one browser QueryClient so non-React code (selection helpers) can read the cache. */
export function registerQueryClient(client: QueryClient | null): void { queryClient = client; }

export const GRAPH_KEY = ['graph'] as const;
/** The full graph if useGraph has already fetched it; undefined before the first load. */
export function getCachedGraph(): Graph | undefined { return queryClient?.getQueryData<Graph>(GRAPH_KEY); }

// ---- query hooks -------------------------------------------------------------

export function useFactions() {
  return useQuery({
    queryKey: ['factions'],
    queryFn: () => apiGet<{ factions: Faction[] }>('/api/factions', undefined, 'factions').then((r) => r.factions),
    staleTime: 5 * 60_000,
  });
}

/** id → hex. Empty map while loading; views fall back to the unaffiliated grey. */
export function useFactionColors(): Map<string, string> {
  const { data } = useFactions();
  return data ? new Map(data.map((f) => [f.id, f.color])) : new Map();
}

/** The whole graph (~170 nodes / ~440 edges); the link chart's initial state and the name index for chips. */
export function useGraph() {
  return useQuery({
    queryKey: GRAPH_KEY,
    queryFn: () => apiGet<Graph>('/api/graph', undefined, 'graph'),
    staleTime: 5 * 60_000,
  });
}

export function useEntities(q?: string) {
  return useQuery({
    queryKey: ['entities', q ?? ''],
    queryFn: () => apiGet<{ entities: Entity[] }>('/api/entities', { q }, 'entities').then((r) => r.entities),
  });
}

export function useEntityProfile(id: string | null) {
  return useQuery({
    queryKey: ['entity', id],
    queryFn: () => apiGet<EntityProfile>(`/api/entities/${encodeURIComponent(id!)}`, undefined, 'entityProfile'),
    enabled: id !== null,
  });
}

/** Events under the shared filters. bbox is accepted by the API but the map shows the whole theatre. */
export function useEvents(filters: Filters) {
  const params = filtersToParams(filters);
  return useQuery({
    queryKey: ['events', params],
    queryFn: () => apiGet<{ events: Event[] }>('/api/events', params, 'events').then((r) => r.events),
  });
}

export interface ReportListOptions {
  type?: string[];
  limit?: number;
  offset?: number;
  q?: string;
  entity?: string;
  from?: string;
  to?: string;
  /** ms; the live feed polls at 3000 (BUILD.md §2). */
  refetchInterval?: number;
}

export function useReports(opts: ReportListOptions = {}) {
  const { refetchInterval, ...params } = opts;
  return useQuery({
    queryKey: ['reports', params],
    queryFn: () => apiGet<{ reports: ReportSummary[]; total: number }>('/api/reports', params, 'reports'),
    refetchInterval,
  });
}

export function useReport(reportNumber: string | null) {
  return useQuery({
    queryKey: ['report', reportNumber],
    queryFn: () => apiGet<Report>(`/api/reports/${encodeURIComponent(reportNumber!)}`, undefined, 'report'),
    enabled: reportNumber !== null,
  });
}

/** Caller debounces; the hook only gates on length so a 1-char query never hits the API. */
export function useSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ['search', term],
    queryFn: () => apiGet<SearchResult>('/api/search', { q: term }, 'search'),
    enabled: term.length >= 2,
    staleTime: 30_000,
  });
}

// ---- imperative fetches (graph expansion, path tracing) ------------------------

export function fetchNeighbors(id: string, depth = 1): Promise<Graph> {
  return apiGet<Graph>('/api/graph/neighbors', { id, depth }, 'graph');
}

export function fetchPath(from: string, to: string, maxHops?: number): Promise<PathResult> {
  return apiGet<PathResult>('/api/graph/path', { from, to, maxHops }, 'path');
}
