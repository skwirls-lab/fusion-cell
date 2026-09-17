/**
 * draftBrief over the REAL seed in an in-memory PGlite with a scripted model:
 * Step A is the real analyst loop running real tools; Step B is one scripted
 * JSON turn. The real model is never called here (see DECISIONS.md).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDb, type DbHandle } from '@/lib/db';
import { runMigrations } from '@/lib/db/migrate';
import { loadSeed } from '@/lib/db/seed';
import { createBrief, getBrief, listBriefs, updateBrief, deleteBrief } from '@/lib/db/queries';
import { draftBrief, BriefContentSchema } from '@/lib/ai/brief';
import type { AgentEvent } from '@/lib/ai/agent';
import { ScriptedProvider, type ScriptedTurn } from '@/lib/ai/provider';

let h: DbHandle;

beforeAll(async () => {
  h = await createDb({ driver: 'pglite', pgliteDir: 'memory' });
  await runMigrations(h);
  const counts = await loadSeed(h);
  expect(counts.reports).toBe(80);
});
afterAll(async () => { await h.close(); });

const ANSWER = '**Bottom line** LANTERN is likely Ilsa Varro [R-0019] [R-0031].\n\n**Evidence**\n- A HUMINT source names a Concord logistics officer [R-0019].';

const BRIEF_JSON = {
  bluf: 'Ilsa Varro is likely LANTERN. Moderate confidence.',
  key_judgments: [{ statement: 'Varro is LANTERN.', confidence: 'moderate', estimative: 'likely — single HUMINT source' }],
  evidence: [
    { point: 'A HUMINT source names a Concord logistics officer.', citations: ['R-0019'] },
    { point: 'A fabricated point.', citations: ['R-9999'] },
  ],
  intelligence_gaps: ['No SIGINT on Varro.'],
  assumptions: ['The source is not a plant.'],
  entities_of_interest: [{ id: 'per_ilsa_varro', name: 'Ilsa Varro' }],
};

const STEP_A: ScriptedTurn[] = [
  { toolCalls: [{ name: 'search_reports', args: { query: 'LANTERN' } }] },
  { toolCalls: [{ name: 'get_report', args: { report_number: 'R-0019' } }] },
  { text: ANSWER },
];

const ofType = <T extends AgentEvent['type']>(events: AgentEvent[], type: T) =>
  events.filter((e): e is Extract<AgentEvent, { type: T }> => e.type === type);

describe('draftBrief (scripted provider, real seeded DB)', () => {
  it('runs the analyst, structures the answer, enforces citations, renders, and the row persists', async () => {
    const provider = new ScriptedProvider([...STEP_A, { text: `Here is the brief:\n${JSON.stringify(BRIEF_JSON)}` }]);
    const events: AgentEvent[] = [];
    const draft = await draftBrief({ db: h.db, provider, template: 'threat_assessment', subject: { topic: 'LANTERN' }, date: '2026-09-17', emit: (ev) => events.push(ev) });

    // The Step A trace was forwarded, then one more step for the structuring call.
    const ok = ofType(events, 'trace').filter((t) => t.status === 'ok');
    expect(ok.map((t) => t.tool)).toEqual(['search_reports', 'get_report', 'structure_brief']);
    expect(ok[2]).toMatchObject({ step: 3, label: 'Structuring the brief', summary: '1 judgments, 2 evidence points' });

    // Step B saw the allowed list and the analysis with the fabricated citation removed.
    const stepB = provider.requests[3];
    expect(stepB.tools).toEqual([]);
    const user = stepB.messages[1];
    expect(user.role).toBe('user');
    expect(user.content).toContain('ALLOWED report numbers: ');
    expect(user.content).toContain('R-0019');
    expect(user.content).not.toContain('R-0031');
    expect(user.content).toContain('Subject: LANTERN');

    expect(BriefContentSchema.safeParse(draft.content).success).toBe(true);
    expect(draft.title).toBe('Threat Assessment: LANTERN');
    expect(draft.markdown).toContain('## Bottom Line Up Front');
    expect(draft.markdown).toContain('[R-0019]');
    expect(draft.markdown).not.toContain('[R-9999]');
    expect(draft.markdown).not.toContain('R-0031');
    expect(draft.markdown).toContain('**EXERCISE – FICTIONAL DATA**');
    expect(draft.citations).toEqual(['R-0019']);
    // R-0031 exists but was never retrieved (Step A); R-9999 was never retrieved and does not exist (Step B).
    expect(draft.strippedCitations).toEqual(['R-0031', 'R-9999']);
    expect(draft.content.evidence[1].citations).toEqual([]);
    expect(draft.steps).toBe(2);
    expect(draft.model).toBe('scripted');
    expect(ofType(events, 'citations').at(-1)).toEqual({ type: 'citations', valid: ['R-0019'], invalid: ['R-0031', 'R-9999'] });

    // Persist exactly as the route does, then read it back.
    const saved = await createBrief(h.db, {
      title: draft.title, template: 'threat_assessment', content: draft.content, markdown: draft.markdown, topic: 'LANTERN', citations: draft.citations,
    });
    expect(saved.id).toMatch(/^brf_[0-9a-f]{8}$/);
    const row = await getBrief(h.db, saved.id);
    expect(row).not.toBeNull();
    expect(row!.markdown).toBe(draft.markdown);
    expect(row!.version).toBe(1);
    expect(row!.citations).toEqual(['R-0019']);
    expect(BriefContentSchema.safeParse(row!.content).success).toBe(true);

    // Versioning and listing.
    const v2 = await updateBrief(h.db, saved.id, { markdown: `${draft.markdown}\n\nAnalyst note.` });
    expect(v2!.version).toBe(2);
    expect(new Date(v2!.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(row!.updatedAt).getTime());
    const list = await listBriefs(h.db);
    expect(list.map((b) => b.id)).toContain(saved.id);
    expect(list.find((b) => b.id === saved.id)).toMatchObject({ version: 2, template: 'threat_assessment', topic: 'LANTERN' });
    expect(await deleteBrief(h.db, saved.id)).toBe(true);
    expect(await getBrief(h.db, saved.id)).toBeNull();
    expect(await deleteBrief(h.db, saved.id)).toBe(false);
    expect(await updateBrief(h.db, 'brf_nope0000', { title: 'x' })).toBeNull();
  });

  it('seedAnswer skips the agent: one model call, citations limited to the seed list ∩ DB', async () => {
    const provider = new ScriptedProvider([{ text: JSON.stringify(BRIEF_JSON) }]);
    const events: AgentEvent[] = [];
    const draft = await draftBrief({
      db: h.db, provider, template: 'threat_assessment', date: '2026-09-17',
      seedAnswer: { text: ANSWER, citations: ['R-0019', 'R-0031', 'R-8888'] },
      emit: (ev) => events.push(ev),
    });
    expect(provider.requests).toHaveLength(1);
    expect(draft.steps).toBe(0);
    expect(draft.title).toBe('Threat Assessment: Concord forces and convoys');
    expect(draft.citations).toEqual(['R-0019']);
    // R-0031 was vouched for by the caller and exists, so it stays allowed (nothing in the brief cites it).
    // R-8888 does not exist; R-9999 came from Step B.
    expect(draft.strippedCitations).toEqual(['R-9999']);
    expect(draft.analysis).toContain('[R-0031]');
    expect(ofType(events, 'trace').map((t) => [t.tool, t.status])).toEqual([['structure_brief', 'start'], ['structure_brief', 'ok']]);
  });

  it('retries the structuring call once with the validation error, then fails', async () => {
    const bad = { ...BRIEF_JSON, key_judgments: [] };
    const provider = new ScriptedProvider([{ text: 'not json at all' }, { text: JSON.stringify(bad) }]);
    await expect(draftBrief({ db: h.db, provider, template: 'daily_summary', seedAnswer: { text: 'x', citations: [] } }))
      .rejects.toThrow(/Brief structuring failed after 2 attempts: key_judgments/);
    expect(provider.requests).toHaveLength(2);
    const retry = provider.requests[1].messages.at(-1);
    expect(retry?.role).toBe('user');
    expect(retry?.content).toMatch(/did not validate: Response was not a JSON object/);

    const provider2 = new ScriptedProvider([{ text: '{"bluf": 1}' }, { text: JSON.stringify(BRIEF_JSON) }]);
    const draft = await draftBrief({ db: h.db, provider: provider2, template: 'daily_summary', date: '2026-09-17', seedAnswer: { text: 'x', citations: [] } });
    expect(draft.title).toBe('Daily Intelligence Summary — 2026-09-17');
    expect(draft.citations).toEqual([]);
    expect(draft.strippedCitations).toEqual(['R-0019', 'R-9999']);
  });

  it('entity_profile needs a real entity and scopes the question and title to it', async () => {
    await expect(draftBrief({ db: h.db, provider: new ScriptedProvider([]), template: 'entity_profile' })).rejects.toThrow(/entityId/);
    await expect(draftBrief({ db: h.db, provider: new ScriptedProvider([]), template: 'entity_profile', subject: { entityId: 'ent_nope' } })).rejects.toThrow(/entity_not_found/);

    const provider = new ScriptedProvider([{ text: ANSWER }, { text: JSON.stringify(BRIEF_JSON) }]);
    const draft = await draftBrief({ db: h.db, provider, template: 'entity_profile', subject: { entityId: 'per_ilsa_varro' }, date: '2026-09-17' });
    expect(draft.subjectEntity).toEqual({ id: 'per_ilsa_varro', name: 'Ilsa Varro' });
    expect(draft.title).toBe('Entity Profile: Ilsa Varro');
    const q = provider.requests[0].messages.at(-1);
    expect(q?.content).toMatch(/^Produce a profile of Ilsa Varro \(entity id per_ilsa_varro\)/);
    expect(q?.content).toContain('UI context: the analyst currently has Ilsa Varro');
    // No tool ran, so nothing could be cited: both numbers stripped.
    expect(draft.citations).toEqual([]);
    expect(draft.strippedCitations).toEqual(['R-0019', 'R-0031', 'R-9999']);
  });
});
