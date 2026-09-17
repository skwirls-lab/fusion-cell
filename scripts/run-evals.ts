/**
 * Phase 5 gate: run the 12 scenario questions in tests/evals/questions.json
 * through the real agent (real model, whichever DB the env points at) and
 * score the answers. Exit 0 iff total ≥ 9/12 AND every `required` question
 * passed. Exit 3 when the network is blocked (nothing was evaluated).
 *
 * Field semantics (inferred from the names; the data file has no schema):
 *   mustMentionAll   every string must appear in the answer (case-insensitive substring)
 *   mustMentionAny   list of groups; each group needs at least one of its strings
 *   mustMentionAny2  a second, independent list of groups with the same rule
 *   mustCiteAny      list of groups; each group needs at least one of its report
 *                    numbers among the VALID citations (returned by a tool + exists)
 *   mustNotClaim     none of the phrases may appear (case-insensitive substring)
 *   required         the suite fails if this question fails, whatever the total
 * Plus two implicit criteria: all citations valid (hard), and answered within
 * the step limit (a `limit` event is noted as a soft fail, not a failure).
 *
 * Flags: --only <id> runs one question; --runs N repeats each question N times
 * (a question passes only if every run passes — a stability check).
 */
import './_env.ts';
import fs from 'node:fs';
import { z } from 'zod';
import { createDb } from '../src/lib/db/index';
import { runAgent, type AgentEvent } from '../src/lib/ai/agent';
import { getProvider, isNetworkBlocked, type ChatProvider } from '../src/lib/ai/provider';

const Question = z.object({
  id: z.string(),
  question: z.string(),
  mustMentionAll: z.array(z.string()).default([]),
  mustMentionAny: z.array(z.array(z.string())).default([]),
  mustMentionAny2: z.array(z.array(z.string())).default([]),
  mustCiteAny: z.array(z.array(z.string())).default([]),
  mustNotClaim: z.array(z.string()).default([]),
  required: z.boolean().default(false),
});
type Question = z.infer<typeof Question>;

const argv = process.argv.slice(2);
const flag = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const only = flag('--only');
const runs = Math.max(1, Number(flag('--runs') ?? 1) || 1);

const questions = z.array(Question).parse(JSON.parse(fs.readFileSync('tests/evals/questions.json', 'utf8')))
  .filter((q) => !only || q.id === only);
if (!questions.length) { console.error(`no question matches --only ${only}`); process.exit(2); }

interface Outcome {
  answer: string;
  steps: number;
  limited: boolean;
  valid: string[];
  invalid: string[];
  error?: string;
}

interface Score { pass: boolean; failed: string[]; soft: string[] }

const has = (answer: string, s: string) => answer.toLowerCase().includes(s.toLowerCase());

function score(q: Question, o: Outcome): Score {
  const failed: string[] = [];
  const soft: string[] = [];
  if (o.error) failed.push(`error: ${o.error}`);
  for (const s of q.mustMentionAll) if (!has(o.answer, s)) failed.push(`mustMentionAll "${s}"`);
  for (const g of q.mustMentionAny) if (!g.some((s) => has(o.answer, s))) failed.push(`mustMentionAny [${g.join('|')}]`);
  for (const g of q.mustMentionAny2) if (!g.some((s) => has(o.answer, s))) failed.push(`mustMentionAny2 [${g.join('|')}]`);
  const valid = new Set(o.valid);
  for (const g of q.mustCiteAny) if (!g.some((n) => valid.has(n))) failed.push(`mustCiteAny [${g.join('|')}]`);
  for (const s of q.mustNotClaim) if (has(o.answer, s)) failed.push(`mustNotClaim "${s}"`);
  if (o.invalid.length) failed.push(`invalid citations ${o.invalid.join(',')}`);
  if (o.limited) soft.push('hit step limit');
  return { pass: failed.length === 0, failed, soft };
}

const h = await createDb();
let provider: ChatProvider;
try {
  provider = getProvider();
} catch (e) {
  console.error(`FAIL: ${(e as Error).message}`);
  process.exit(2);
}
console.log(`driver: ${h.driver} · model: ${provider.model} · questions: ${questions.length} · runs: ${runs}\n`);

async function runOne(q: Question): Promise<Outcome> {
  const o: Outcome = { answer: '', steps: 0, limited: false, valid: [], invalid: [] };
  const events: AgentEvent[] = [];
  const result = await runAgent({ db: h.db, provider, question: q.question, emit: (ev) => events.push(ev) });
  o.answer = result.answer;
  o.steps = result.steps;
  o.limited = result.limited;
  o.valid = result.citations.valid;
  o.invalid = result.citations.invalid;
  if (result.error) o.error = result.error;
  return o;
}

interface Row { id: string; pass: boolean; required: boolean; steps: string; cites: string; failed: string[]; soft: string[] }
const rows: Row[] = [];

for (const q of questions) {
  const outcomes: Outcome[] = [];
  const scores: Score[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = Date.now();
    const o = await runOne(q);
    if (o.error && isNetworkBlocked(new Error(o.error))) {
      console.error(`\nnetwork blocked — run this from a machine that can reach openrouter.ai\n(${o.error})`);
      await h.close();
      process.exit(3);
    }
    const s = score(q, o);
    outcomes.push(o);
    scores.push(s);
    console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${q.id}${runs > 1 ? ` (run ${i + 1}/${runs})` : ''}  ${o.steps} steps · ${Date.now() - t0}ms${s.failed.length ? `\n      ${s.failed.join('\n      ')}` : ''}${s.soft.length ? `\n      soft: ${s.soft.join(', ')}` : ''}`);
  }
  const failedAll = [...new Set(scores.flatMap((s) => s.failed))];
  rows.push({
    id: q.id,
    pass: scores.every((s) => s.pass),
    required: q.required,
    steps: outcomes.map((o) => o.steps).join('/'),
    cites: outcomes.map((o) => `${o.valid.length}v/${o.invalid.length}i`).join(' '),
    failed: failedAll,
    soft: [...new Set(scores.flatMap((s) => s.soft))],
  });
}

await h.close();

const passed = rows.filter((r) => r.pass).length;
const requiredFailed = rows.filter((r) => r.required && !r.pass).map((r) => r.id);
const pad = (s: string, n: number) => s.padEnd(n);
console.log('\n' + pad('id', 20) + pad('result', 8) + pad('steps', 8) + pad('citations', 14) + 'failed criteria');
console.log('-'.repeat(90));
for (const r of rows) {
  console.log(
    pad(r.id + (r.required ? ' *' : ''), 20) + pad(r.pass ? 'PASS' : 'FAIL', 8) + pad(r.steps, 8) + pad(r.cites, 14) +
    [...r.failed, ...r.soft.map((s) => `(soft) ${s}`)].join('; '),
  );
}
console.log('-'.repeat(90));
console.log(`total: ${passed}/${rows.length} passed${requiredFailed.length ? ` · REQUIRED FAILED: ${requiredFailed.join(', ')}` : ''}  (* = required)`);

const threshold = only ? rows.length : 9;
const ok = passed >= Math.min(threshold, rows.length) && requiredFailed.length === 0;
console.log(ok ? '\nEVALS PASS' : `\nEVALS FAIL — need ≥ ${threshold}/${rows.length} with every required question passing`);
process.exit(ok ? 0 : 1);
