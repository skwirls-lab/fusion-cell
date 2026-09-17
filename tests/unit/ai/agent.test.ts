import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDb, type DbHandle } from '@/lib/db';
import { runMigrations } from '@/lib/db/migrate';
import { loadSeed } from '@/lib/db/seed';
import { runAgent, normalizeCitations, type AgentEvent } from '@/lib/ai/agent';
import { ScriptedProvider, ModelStallError, type ScriptedTurn } from '@/lib/ai/provider';
import { TOOLS } from '@/lib/ai/tools';

let h: DbHandle;

beforeAll(async () => {
  h = await createDb({ driver: 'pglite', pgliteDir: 'memory' });
  await runMigrations(h);
  const counts = await loadSeed(h); // the real clue chain, same loader as scripts/seed-db.ts
  expect(counts.reports).toBe(80);
});

afterAll(async () => { await h.close(); });

async function run(turns: ScriptedTurn[], opts: { question?: string; maxSteps?: number } = {}) {
  const provider = new ScriptedProvider(turns);
  const events: AgentEvent[] = [];
  const result = await runAgent({
    db: h.db,
    provider,
    question: opts.question ?? 'Who is LANTERN, and what are they enabling?',
    maxSteps: opts.maxSteps,
    emit: (ev) => events.push(ev),
  });
  return { provider, events, result };
}

const ofType = <T extends AgentEvent['type']>(events: AgentEvent[], type: T) =>
  events.filter((e): e is Extract<AgentEvent, { type: T }> => e.type === type);

/** Content of the tool message the loop appended for the i-th tool call (0-based), parsed. */
function toolResult(provider: ScriptedProvider, i: number): Record<string, unknown> {
  const last = provider.requests[provider.requests.length - 1];
  const toolMsgs = last.messages.filter((m) => m.role === 'tool');
  const m = toolMsgs[i];
  if (!m || m.role !== 'tool') throw new Error(`no tool message #${i}`);
  return JSON.parse(m.content) as Record<string, unknown>;
}

describe('runAgent (scripted provider, real seeded DB)', () => {
  it('happy path: trace, ui highlight, tokens, citation validation, done', async () => {
    const answer = '**Bottom line** LANTERN is likely Ilsa Varro [R-0019] [R-0031].';
    const { events, result } = await run([
      { toolCalls: [{ name: 'search_reports', args: { query: 'LANTERN' } }] },
      { toolCalls: [{ name: 'get_report', args: { report_number: 'R-0019' } }] },
      { toolCalls: [{ name: 'highlight_in_ui', args: { entity_ids: ['per_ilsa_varro'] } }] },
      { text: answer },
    ]);

    const ok = ofType(events, 'trace').filter((t) => t.status === 'ok');
    expect(ok.map((t) => t.tool)).toEqual(['search_reports', 'get_report', 'highlight_in_ui']);
    expect(ok.map((t) => t.label)).toEqual([
      'Searching reports for "LANTERN"',
      'Reading report R-0019',
      'Highlighting 1 entities, 0 events, 0 edges',
    ]);
    expect(ok.map((t) => t.step)).toEqual([1, 2, 3]);
    expect(ok[0].summary).toMatch(/^2 reports, 2 new$/);
    expect(ofType(events, 'trace').filter((t) => t.status === 'start')).toHaveLength(3);

    const ui = ofType(events, 'ui');
    expect(ui).toHaveLength(1);
    expect(ui[0]).toMatchObject({ action: 'highlight', entityIds: ['per_ilsa_varro'], eventIds: [], edgeIds: [] });

    const tokens = ofType(events, 'token');
    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens.map((t) => t.delta).join('')).toBe(answer);

    // R-0031 exists in the DB but no tool returned it: a fabricated citation.
    expect(ofType(events, 'citations')).toEqual([{ type: 'citations', valid: ['R-0019'], invalid: ['R-0031'] }]);
    expect(result.citations).toEqual({ valid: ['R-0019'], invalid: ['R-0031'] });

    const done = ofType(events, 'done');
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ answer, steps: 3, model: 'scripted' });
    expect(ofType(events, 'error')).toHaveLength(0);
    expect(ofType(events, 'limit')).toHaveLength(0);
    expect(result.answer).toBe(answer);
    expect(result.messages.at(-1)).toEqual({ role: 'assistant', content: answer });
    expect(result.trace).toHaveLength(6);
  });

  it('search_reports really hits the seeded DB', async () => {
    const { provider, events } = await run([
      { toolCalls: [{ name: 'search_reports', args: { query: 'transponder', limit: 25 } }] },
      { text: 'ok' },
    ]);
    const out = toolResult(provider, 0) as { reports: Array<{ report_number: string; snippet: string }> };
    const numbers = out.reports.map((r) => r.report_number);
    expect(numbers).toContain('R-0007');
    expect(numbers).toContain('R-0064');
    for (const r of out.reports) expect(r.snippet.length).toBeLessThanOrEqual(360);
    expect(ofType(events, 'done')[0]).toMatchObject({ steps: 1 });
  });

  it('invalid arguments → invalid_arguments tool result, loop continues to done', async () => {
    const { provider, events } = await run([
      { toolCalls: [{ name: 'get_neighbors', args: { entity_id: 'x', depth: 99 } }] },
      { text: 'ok' },
    ]);
    const out = toolResult(provider, 0);
    expect(out.error).toBe('invalid_arguments');
    expect(Array.isArray(out.issues)).toBe(true);
    const trace = ofType(events, 'trace');
    expect(trace).toHaveLength(1);
    expect(trace[0]).toMatchObject({ tool: 'get_neighbors', status: 'error', summary: 'invalid_arguments' });
    expect(ofType(events, 'done')[0]).toMatchObject({ answer: 'ok', steps: 1 });
    expect(ofType(events, 'error')).toHaveLength(0);
  });

  it('malformed JSON arguments → invalid_json tool result, loop continues', async () => {
    const { provider, events } = await run([
      { toolCalls: [{ name: 'search_reports', rawArgs: '{"query": "LANTERN' }] },
      { text: 'ok' },
    ]);
    expect(toolResult(provider, 0)).toMatchObject({ error: 'invalid_json' });
    expect(ofType(events, 'trace')[0]).toMatchObject({ tool: 'search_reports', status: 'error', summary: 'invalid_json' });
    expect(ofType(events, 'done')[0]).toMatchObject({ answer: 'ok', steps: 1 });
  });

  it('unknown tool → unknown_tool result, loop continues', async () => {
    const { provider, events } = await run([
      { toolCalls: [{ name: 'delete_everything', args: {} }] },
      { text: 'ok' },
    ]);
    expect(toolResult(provider, 0)).toMatchObject({ error: 'unknown_tool', name: 'delete_everything' });
    expect(ofType(events, 'done')[0]).toMatchObject({ answer: 'ok' });
  });

  it('step limit: limit event, forced final answer with tools disabled, steps === 8', async () => {
    const turns: ScriptedTurn[] = [];
    for (let i = 0; i < 9; i++) turns.push({ toolCalls: [{ name: 'search_entities', args: { query: `q${i}` } }] });
    turns.push({ text: 'Partial answer with what I have.' });
    const { provider, events, result } = await run(turns);

    expect(ofType(events, 'limit')).toEqual([{ type: 'limit', reason: 'steps' }]);
    const done = ofType(events, 'done')[0];
    expect(done.steps).toBe(8);
    expect(done.answer).toBe('Partial answer with what I have.');
    expect(result.limited).toBe(true);
    // 8 executed tool turns + the 9th (refused) + the forced final call.
    expect(provider.requests).toHaveLength(10);
    const forced = provider.requests[9];
    expect(forced.tools).toEqual([]);
    expect(forced.messages.at(-1)).toMatchObject({ role: 'user' });
    expect(forced.messages.at(-1)?.content).toMatch(/Answer now with what you have/);
    // The refused tool request never entered the transcript.
    expect(forced.messages.filter((m) => m.role === 'assistant')).toHaveLength(8);
    expect(ofType(events, 'token').map((t) => t.delta).join('')).toBe(done.answer);
  });

  it('time budget: once spent, the next turn is the forced answer and the limit reason is time', async () => {
    const provider = new ScriptedProvider([
      { toolCalls: [{ name: 'search_entities', args: { query: 'Varro' } }] },
      { toolCalls: [{ name: 'search_entities', args: { query: 'Renley' } }] },
      { text: 'Partial answer.' },
    ]);
    const events: AgentEvent[] = [];
    let clock = 0;
    const result = await runAgent({
      db: h.db, provider, question: 'q', emit: (ev) => events.push(ev),
      budgetMs: 1500, now: () => (clock += 400), // every reading advances 400ms: started at 400; budget checked at 1200 (800 elapsed: in budget), then at 2000 (1600: spent)
    });
    expect(ofType(events, 'limit')).toEqual([{ type: 'limit', reason: 'time' }]);
    expect(result.limited).toBe(true);
    expect(result.steps).toBe(2);
    expect(provider.requests).toHaveLength(3);
    expect(provider.requests[2].tools).toEqual([]);
    expect(result.answer).toBe('Partial answer.');
  });

  it('an identical repeated tool call gets a pointer, not the payload again', async () => {
    const { provider, events } = await run([
      { toolCalls: [{ name: 'get_entity', args: { entity_id: 'per_doss_renley' } }] },
      { toolCalls: [{ name: 'get_entity', args: { entity_id: 'per_doss_renley' } }, { name: 'get_entity', args: { entity_id: 'per_ilsa_varro' } }] },
      { text: 'done' },
    ]);
    const toolMsgs = provider.requests[2].messages.filter((m) => m.role === 'tool');
    expect(toolMsgs).toHaveLength(3);
    expect(JSON.parse(toolMsgs[0].content as string)).not.toHaveProperty('duplicate_call');
    expect(JSON.parse(toolMsgs[1].content as string)).toMatchObject({ duplicate_call: true, first_made_at_step: 1 });
    expect(JSON.parse(toolMsgs[2].content as string)).not.toHaveProperty('duplicate_call');
    expect(ofType(events, 'trace').filter((t) => t.summary === 'duplicate of step 1')).toHaveLength(1);
  });

  it('a failed tool call may be repeated: only successes are remembered as duplicates', async () => {
    const { provider } = await run([
      { toolCalls: [{ name: 'get_report', args: { report_number: 'R-0019' } }] },
      { toolCalls: [{ name: 'get_report', args: { report_number: 'R-0019' } }] },
      { text: 'done' },
    ]);
    const second = JSON.parse(provider.requests[2].messages.filter((m) => m.role === 'tool')[1].content as string);
    expect(second).toMatchObject({ duplicate_call: true }); // success → remembered
    const failing = { ...TOOLS.find((t) => t.name === 'get_report')!, run: async () => { throw new Error('db down'); } };
    const events: AgentEvent[] = [];
    const p2 = new ScriptedProvider([
      { toolCalls: [{ name: 'get_report', args: { report_number: 'R-0019' } }] },
      { toolCalls: [{ name: 'get_report', args: { report_number: 'R-0019' } }] },
      { text: 'done' },
    ]);
    await runAgent({ db: h.db, provider: p2, question: 'q', tools: [failing], emit: (ev) => events.push(ev) });
    const results = p2.requests[2].messages.filter((m) => m.role === 'tool').map((m) => JSON.parse(m.content as string));
    expect(results).toEqual([{ error: 'tool_failed', message: 'db down' }, { error: 'tool_failed', message: 'db down' }]);
  });

  it('a tool turn that overruns its deadline ends the investigation, not the request', async () => {
    const seen: Array<number | undefined> = [];
    let n = 0;
    const provider = {
      model: 'fake',
      async *complete(req: { deadlineMs?: number; tools: unknown[] }) {
        seen.push(req.deadlineMs);
        n++;
        if (n === 1) { yield { type: 'tool_call' as const, id: 'c1', name: 'search_entities', argumentsJson: '{"query":"Varro"}' }; yield { type: 'done' as const, finishReason: 'tool_calls' }; return; }
        if (n === 2) throw new ModelStallError('fake', 1000, true);
        yield { type: 'text' as const, delta: 'Partial.' };
        yield { type: 'done' as const, finishReason: 'stop' };
      },
    };
    const events: AgentEvent[] = [];
    const result = await runAgent({ db: h.db, provider, question: 'q', budgetMs: 60_000, hardStopMs: 90_000, emit: (ev) => events.push(ev) });
    expect(result.error).toBeUndefined();
    expect(result.limited).toBe(true);
    expect(ofType(events, 'limit')).toEqual([{ type: 'limit', reason: 'time' }]);
    expect(result.answer).toBe('Partial.');
    expect(seen[0]).toBeLessThanOrEqual(60_000);
    expect(seen[2]).toBeGreaterThan(60_000 - 5_000); // the final answer is capped by the hard stop, not the tool budget
    expect(seen[2]).toBeLessThanOrEqual(90_000);
  });

  it('citation format drift is normalised, so an unbracketed fabricated number is still caught', async () => {
    expect(normalizeCitations('a (R-0019) b R-0042, c [R-0019, R-0042] d [R-0003; R-0007] e (R-0001 and R-0002) f [R-0019]'))
      .toBe('a [R-0019] b [R-0042], c [R-0019] [R-0042] d [R-0003] [R-0007] e [R-0001] [R-0002] f [R-0019]');
    expect(normalizeCitations('ids like per_R-0019x or XR-0019 or R-00199 stay')).toBe('ids like per_R-0019x or XR-0019 or R-00199 stay');
    // Forms a reviewer found escaping validation: a number sharing its brackets with other text.
    for (const sneaky of ['[R-9999, para 2]', '[see R-9998]', '[R-9999: title]', '[R-0019–R-9999]', 'R-9999]']) {
      const numbers = [...normalizeCitations(sneaky).matchAll(/\[(R-\d{4})\]/g)].map((m) => m[1]);
      expect(numbers, sneaky).toEqual(sneaky.match(/R-\d{4}/g));
    }
    const { result, events } = await run([
      { toolCalls: [{ name: 'search_reports', args: { query: 'LANTERN' } }] },
      { text: 'LANTERN has access (R-0019). Also see R-9999.' },
    ]);
    expect(result.answer).toBe('LANTERN has access [R-0019]. Also see [R-9999].');
    expect(result.citations).toEqual({ valid: ['R-0019'], invalid: ['R-9999'] });
    expect(ofType(events, 'done')[0].answer).toBe(result.answer);
  });

  it('an empty final turn is asked for once more; the second answer is the answer', async () => {
    const { provider, events, result } = await run([
      { toolCalls: [{ name: 'search_reports', args: { query: 'LANTERN' } }] },
      { text: '' },
      { text: 'LANTERN has access to movement tables [R-0019].' },
    ]);
    expect(provider.requests).toHaveLength(3);
    expect(provider.requests[2].tools).toEqual([]);
    expect(provider.requests[2].messages.at(-1)).toMatchObject({ role: 'user' });
    expect(provider.requests[2].messages.at(-1)?.content).toMatch(/last reply was empty/);
    expect(result.answer).toBe('LANTERN has access to movement tables [R-0019].');
    expect(result.citations.valid).toEqual(['R-0019']);
    expect(ofType(events, 'error')).toEqual([]);
  });

  it('two empty turns in a row is an error, not a loop', async () => {
    const { provider, events, result } = await run([{ text: '' }, { text: '' }]);
    expect(provider.requests).toHaveLength(2);
    expect(result.answer).toBe('');
    expect(ofType(events, 'error')[0].message).toMatch(/no answer text/);
  });

  it('find_paths returns the evidence reports on each edge and makes them citable', async () => {
    const { provider, events } = await run([
      { toolCalls: [{ name: 'find_paths', args: { from_id: 'per_ilsa_varro', to_id: 'org_vantor_hegemony' } }] },
      { text: 'Chain [R-0023] [R-0019] and a fake [R-9999].' },
    ]);
    const out = toolResult(provider, 0) as { found: boolean; edges: Array<{ report_ids: string[] }> };
    expect(out.found).toBe(true);
    expect(out.edges.some((e) => e.report_ids.length > 0)).toBe(true);
    const cites = ofType(events, 'citations')[0];
    expect(cites.invalid).toContain('R-9999');
    expect(cites.valid).toContain('R-0019');
    expect(ofType(events, 'trace')[0].label).toBe('Finding paths from per_ilsa_varro to org_vantor_hegemony');
  });

  it('get_timeline returns chronological events with provenance and makes them citable', async () => {
    const { provider, events } = await run([
      { toolCalls: [{ name: 'get_timeline', args: { entity_ids: ['per_ilsa_varro', 'ves_cinder_moth'] } }] },
      { text: 'ok' },
    ]);
    const out = toolResult(provider, 0) as { events: Array<{ occurred_at: string; report_ids: string[]; entity_ids: string[] }> };
    expect(out.events.length).toBeGreaterThan(1);
    const times = out.events.map((e) => Date.parse(e.occurred_at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(out.events.every((e) => e.entity_ids.some((id) => id === 'per_ilsa_varro' || id === 'ves_cinder_moth'))).toBe(true);
    expect(out.events.some((e) => e.report_ids.length > 0)).toBe(true);
    expect(ofType(events, 'trace').at(-1)).toMatchObject({ status: 'ok', label: 'Building timeline for 2 entities' });
  });

  it('compute_centrality ranks named non-location entities', async () => {
    const { provider, events } = await run([
      { toolCalls: [{ name: 'compute_centrality', args: {} }] },
      { text: 'ok' },
    ]);
    const out = toolResult(provider, 0) as { scope: string; ranking: Array<{ id: string; name: string; type: string; betweenness: number }> };
    expect(out.scope).toBe('non_location');
    expect(out.ranking).toHaveLength(15);
    expect(out.ranking.every((r) => r.type !== 'location' && r.name !== r.id)).toBe(true);
    expect(out.ranking[0].betweenness).toBeGreaterThanOrEqual(out.ranking[14].betweenness);
    expect(ofType(events, 'trace').at(-1)).toMatchObject({ status: 'ok', summary: 'top 15' });
  });

  it('UI selection is rendered into the first user message and history precedes it', async () => {
    const provider = new ScriptedProvider([{ text: 'ok' }]);
    await runAgent({
      db: h.db,
      provider,
      question: 'Tell me about this',
      selection: { kind: 'entity', id: 'per_ilsa_varro', name: 'Ilsa Varro' },
      history: [{ role: 'user', content: 'earlier q' }, { role: 'assistant', content: 'earlier a' }],
      emit: () => {},
    });
    const msgs = provider.requests[0].messages;
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(msgs[3].content).toContain('Ilsa Varro (entity id: per_ilsa_varro)');
  });

  it('a provider failure becomes an error event, never a throw', async () => {
    const provider = new ScriptedProvider([]); // exhausted on first call
    const events: AgentEvent[] = [];
    const result = await runAgent({ db: h.db, provider, question: 'x', emit: (ev) => events.push(ev) });
    expect(ofType(events, 'error')).toHaveLength(1);
    expect(ofType(events, 'error')[0].message).toMatch(/script exhausted/);
    expect(result.error).toMatch(/script exhausted/);
    expect(ofType(events, 'done')).toHaveLength(0);
  });
});
