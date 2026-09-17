import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDb, type DbHandle } from '@/lib/db';
import { runMigrations } from '@/lib/db/migrate';
import { loadSeed } from '@/lib/db/seed';
import { matchAgainst, matchEntities, tokenOverlapScore, trigramSimilarity, isGenericName, type MatchableEntity } from '@/lib/ingest/match';
import type { ExtractedEntity } from '@/lib/ingest/types';

const ext = (name: string, type: ExtractedEntity['type'] = 'person', aliases: string[] = []): ExtractedEntity =>
  ({ name, type, aliases, description: '', confidence: 0.8 });

/** Varro without her seeded aliases, so the token tier (not the exact-alias tier) has to do the work. */
const EXISTING: MatchableEntity[] = [
  { id: 'per_ilsa_varro', name: 'Ilsa Varro', type: 'person', factionId: 'concord', aliases: [] },
  { id: 'per_ansel_varro', name: 'Ansel Varro', type: 'person', factionId: null, aliases: [] },
  { id: 'per_doss_renley', name: 'Doss Renley', type: 'person', factionId: 'concord', aliases: ['Cmdr Renley'] },
  { id: 'ves_larkspur', name: 'MV Larkspur', type: 'vessel', factionId: 'kestrel', aliases: ['Larkspur'] },
  { id: 'loc_tessaly_gate', name: 'Tessaly Gate', type: 'location', factionId: 'kestrel', aliases: [] },
];

describe('scoring tiers', () => {
  it('"I. Varro" ↔ "Ilsa Varro": surname exact + initial → 0.9 (P6.2 gate)', () => {
    expect(tokenOverlapScore('I. Varro', 'Ilsa Varro')).toBeCloseTo(0.9);
    // Ranks are stripped, so "Lt Cmdr I. Varro" scores the same.
    expect(tokenOverlapScore('Lt. Cmdr. I. Varro', 'Ilsa Varro')).toBeCloseTo(0.9);
    // Wrong first name never matches on surname alone.
    expect(tokenOverlapScore('Ansel Varro', 'Ilsa Varro')).toBeNull();
    // Surname only is a weak partial, below the link threshold.
    expect(tokenOverlapScore('Varro', 'Ilsa Varro')).toBeCloseTo(0.75);
  });

  it('trigram similarity catches spacing and typos', () => {
    expect(trigramSimilarity('Brightwater Hauling', 'Bright-water Hauling')).toBeGreaterThan(0.8);
    expect(trigramSimilarity('Brightwater Hauling', 'Halloway & Sons')).toBeLessThan(0.3);
  });

  it('generic names are recognised', () => {
    expect(isGenericName('the officer')).toBe(true);
    expect(isGenericName('two unidentified corvettes')).toBe(true);
    expect(isGenericName('Al')).toBe(true);
    expect(isGenericName('Ilsa Varro')).toBe(false);
  });
});

describe('matchAgainst (pure)', () => {
  it('"I. Varro" suggests linking to Ilsa Varro, Ansel is not a candidate', () => {
    const [m] = matchAgainst(EXISTING, [ext('I. Varro')]);
    expect(m.suggested).toBe('link');
    expect(m.suggestedId).toBe('per_ilsa_varro');
    expect(m.candidates[0]).toMatchObject({ id: 'per_ilsa_varro', name: 'Ilsa Varro', type: 'person', factionId: 'concord', score: 0.9 });
    expect(m.candidates.map((c) => c.id)).not.toContain('per_ansel_varro');
  });

  it('a name with no match suggests create with no candidates', () => {
    const [m] = matchAgainst(EXISTING, [ext('VHS Nightglass', 'vessel')]);
    expect(m).toEqual({ candidates: [], suggested: 'create', suggestedId: null });
  });

  it('exact alias is 1.0; hull prefix stripped is 0.95; both link', () => {
    const [a, b] = matchAgainst(EXISTING, [ext('Cmdr Renley'), ext('Larkspur', 'vessel')]);
    expect(a.candidates[0]).toMatchObject({ id: 'per_doss_renley', score: 1 });
    expect(a.suggested).toBe('link');
    expect(b.candidates[0]).toMatchObject({ id: 'ves_larkspur', score: 1 }); // "Larkspur" is a seeded alias
    expect(b.suggested).toBe('link');
  });

  it('a strong name match with an incompatible type does not auto-link', () => {
    const [m] = matchAgainst(EXISTING, [ext('Tessaly Gate', 'vessel')]);
    expect(m.candidates[0].id).toBe('loc_tessaly_gate');
    expect(m.suggested).toBe('create');
  });

  it('a name shared across types suggests the type-compatible candidate, all candidates still listed', () => {
    // The location sorts first (same score, same name → input order), so a naive candidates[0] would pick it.
    const existing: MatchableEntity[] = [
      { id: 'loc_halloway', name: 'Halloway', type: 'location', factionId: null, aliases: [] },
      { id: 'org_halloway', name: 'Halloway', type: 'organization', factionId: 'cartel', aliases: [] },
    ];
    const [m] = matchAgainst(existing, [ext('Halloway', 'organization')]);
    expect(m.candidates.map((c) => c.id)).toEqual(['loc_halloway', 'org_halloway']);
    expect(m.suggested).toBe('link');
    expect(m.suggestedId).toBe('org_halloway');
    // 'other' is compatible with anything; a type nothing matches still creates.
    expect(matchAgainst(existing, [ext('Halloway', 'other')])[0]).toMatchObject({ suggested: 'link', suggestedId: 'loc_halloway' });
    expect(matchAgainst(existing, [ext('Halloway', 'vessel')])[0]).toMatchObject({ suggested: 'create', suggestedId: null });
  });

  it('generic names are discarded even when something scores', () => {
    const [m] = matchAgainst(EXISTING, [ext('the officer')]);
    expect(m.suggested).toBe('discard');
  });

  it('keeps at most three candidates, best first', () => {
    const many: MatchableEntity[] = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `Varro ${i}`, type: 'person', factionId: null, aliases: [] }));
    const [m] = matchAgainst(many, [ext('Varro')]);
    expect(m.candidates).toHaveLength(3);
    expect(m.candidates.every((c) => c.score >= m.candidates[2].score)).toBe(true);
  });
});

describe('matchEntities (real seed)', () => {
  let h: DbHandle;
  beforeAll(async () => {
    h = await createDb({ driver: 'pglite', pgliteDir: 'memory' });
    await runMigrations(h);
    await loadSeed(h);
  });
  afterAll(async () => { await h.close(); });

  it('resolves "I. Varro" and "MV Larkspur" against the seed; a new vessel creates', async () => {
    const out = await matchEntities(h.db, [ext('I. Varro'), ext('MV Larkspur', 'vessel'), ext('VHS Nightglass', 'vessel'), ext('Tessaly Gate', 'location')]);
    expect(out.map((m) => [m.suggested, m.suggestedId])).toEqual([
      ['link', 'per_ilsa_varro'],
      ['link', 'ves_larkspur'],
      ['create', null],
      ['link', 'loc_tessaly_gate'],
    ]);
    expect(out[2].candidates).toEqual([]);
  });

  it('empty input makes no query', async () => {
    expect(await matchEntities(h.db, [])).toEqual([]);
  });
});
