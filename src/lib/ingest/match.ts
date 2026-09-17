/**
 * Entity matching for ingest (BUILD.md P6.2): extracted names against the
 * existing entity table. Pure scoring over data fetched in one query — 169
 * rows, so it runs in memory and unit-tests without a database.
 *
 * Tiers (best wins, top 3 kept):
 *   1.0        exact name or alias, case-insensitive
 *   0.6–0.9    normalised token overlap, rank/prefix words stripped, initials
 *              aware ("I. Varro" ↔ "Ilsa Varro": surname exact, initial matches)
 *   0.5–0.7    character-trigram similarity ≥ 0.8 (typos, spacing)
 */
import { asc } from 'drizzle-orm';
import type { Db } from '../db';
import { entities } from '../db/schema';
import type { ExtractedEntity, EntityMatch, MatchCandidate } from './types';

export interface MatchableEntity {
  id: string;
  name: string;
  type: MatchCandidate['type'];
  factionId: string | null;
  aliases: string[];
}

export const LINK_THRESHOLD = 0.8;

/** Words that carry no identity: ranks, honorifics, hull prefixes, articles. */
const STOP = new Set([
  'lt', 'cmdr', 'cdr', 'capt', 'cpt', 'col', 'maj', 'sgt', 'ens', 'adm', 'gen', 'mr', 'mrs', 'ms', 'dr',
  'cns', 'cv', 'mv', 'vhs', 'ss', 'hms', 'uss', 'iss',
  'the', 'of', 'an', 'and',
]);

const GENERIC = /^(?:the |an? |one |two |some |several |unidentified |unknown |unnamed )*(?:officer|official|manager|operator|crew|personnel|man|woman|person|individual|actor|group|party|source|contact|vessel|ship|craft|corvette|freighter|convoy|station|facility|outpost|base|company|organization|organisation|location|place|account|entity|unknown|unidentified|unnamed|someone|they|he|she|it)s?$/i;

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Tokens minus stop words; a single letter is kept as an initial. */
export function tokens(s: string): string[] {
  const out = norm(s).split(' ').filter((t) => t && !STOP.has(t));
  return out;
}

const isInitial = (t: string) => t.length === 1;
const tokenMatches = (a: string, b: string) => a === b || (isInitial(a) && b.startsWith(a)) || (isInitial(b) && a.startsWith(b));

/**
 * 0.6–0.9 when at least one full (≥3-char) token matches and every token on
 * the shorter side is accounted for; else null.
 */
export function tokenOverlapScore(a: string, b: string): number | null {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return null;
  const used = new Set<number>();
  let matched = 0;
  let fullMatched = 0;
  for (const x of ta) {
    const j = tb.findIndex((y, i) => !used.has(i) && tokenMatches(x, y));
    if (j < 0) continue;
    used.add(j);
    matched++;
    if (x.length >= 3 && tb[j].length >= 3) fullMatched++;
  }
  if (!fullMatched) return null;
  const shorter = Math.min(ta.length, tb.length);
  if (matched < shorter) return null; // "Ansel Varro" vs "Ilsa Varro": surname only, first names disagree
  const ratio = matched / Math.max(ta.length, tb.length);
  return 0.6 + 0.3 * ratio;
}

function trigrams(s: string): Set<string> {
  const p = `  ${norm(s)} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  return out;
}

/** Dice coefficient over character trigrams, 0–1. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (!ta.size || !tb.size) return 0;
  let both = 0;
  for (const g of ta) if (tb.has(g)) both++;
  return (2 * both) / (ta.size + tb.size);
}

export function isGenericName(name: string): boolean {
  const n = name.trim();
  if (n.length < 3) return true;
  if (!/\p{L}/u.test(n)) return true;
  if (GENERIC.test(n)) return true;
  return tokens(n).length === 0;
}

export const typeCompatible = (a: string, b: string) => a === b || a === 'other' || b === 'other';

/** Best score of an extracted name against one existing entity's name + aliases. */
export function scoreAgainst(name: string, ex: MatchableEntity): number {
  const target = norm(name);
  const names = [ex.name, ...ex.aliases];
  let best = 0;
  for (const n of names) {
    const nn = norm(n);
    if (!nn) continue;
    if (nn === target) return 1;
    const tokenNorm = tokens(n).join(' ');
    if (tokenNorm && tokenNorm === tokens(name).join(' ')) { best = Math.max(best, 0.95); continue; } // "Larkspur" ↔ "MV Larkspur"
    const t = tokenOverlapScore(name, n);
    if (t !== null) { best = Math.max(best, t); continue; }
    const sim = trigramSimilarity(name, n);
    if (sim >= 0.8) best = Math.max(best, 0.5 + 0.2 * ((sim - 0.8) / 0.2));
  }
  return best;
}

/** Pure: match every extracted entity against `existing`. Exported for tests. */
export function matchAgainst(existing: MatchableEntity[], extracted: ExtractedEntity[]): EntityMatch[] {
  return extracted.map((e) => {
    const names = [e.name, ...e.aliases];
    const scored: MatchCandidate[] = [];
    for (const ex of existing) {
      let score = 0;
      for (const n of names) score = Math.max(score, scoreAgainst(n, ex));
      if (score > 0) scored.push({ id: ex.id, name: ex.name, type: ex.type, factionId: ex.factionId, score: Math.round(score * 100) / 100 });
    }
    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const candidates = scored.slice(0, 3);
    // All candidates are listed, but the suggestion is the best TYPE-COMPATIBLE one: a same-name
    // entity of another type (a location called Halloway vs the organization) must not win.
    const best = candidates.find((c) => typeCompatible(c.type, e.type));
    if (isGenericName(e.name)) return { candidates, suggested: 'discard', suggestedId: null };
    if (best && best.score >= LINK_THRESHOLD) {
      return { candidates, suggested: 'link', suggestedId: best.id };
    }
    return { candidates, suggested: 'create', suggestedId: null };
  });
}

/** One query: everything the matcher needs about every entity. */
export async function loadMatchable(db: Db): Promise<MatchableEntity[]> {
  return db
    .select({ id: entities.id, name: entities.name, type: entities.type, factionId: entities.factionId, aliases: entities.aliases })
    .from(entities)
    .orderBy(asc(entities.name));
}

export async function matchEntities(db: Db, extracted: ExtractedEntity[]): Promise<EntityMatch[]> {
  if (!extracted.length) return [];
  return matchAgainst(await loadMatchable(db), extracted);
}
