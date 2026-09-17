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
 *   rubric           { mustConclude, mustNotConclude }: judged by a separate no-tools model call that
 *                    sees only the question, the rubric and the answer. Substrings cannot tell "Renley is
 *                    the leak" from "no evidence that Renley is the leak", and both mistakes were seen
 *                    with the real model (DECISIONS.md D28). A judge that errors or returns unparseable
 *                    JSON twice FAILS the question; it never passes by default.
 *   required         the suite fails if this question fails, whatever the total
 * Plus two implicit criteria: all citations valid (hard), and answered within
 * the step limit (a `limit` event is noted as a soft fail, not a failure).
 *
 * Every run's full answer, citations and tool trace are written to
 * .evals/<timestamp>.json (gitignored) so a FAIL can be read, not guessed at.
 *
 * Flags: --rejudge <dump.json> re-grades the saved answers of an earlier run without calling the agent
 * (for calibrating the judge against answers already read by a human); --only <id> runs one question; --runs N repeats each question N times
 * (a question passes only if every run passes — a stability check).
 */
import './_env.ts';
import fs from 'node:fs';
import { z } from 'zod';
import { createDb } from '../src/lib/db/index';
import { runAgent, type AgentEvent } from '../src/lib/ai/agent';
import { getProvider, isNetworkBlocked, DEFAULT_REASONING, type ChatProvider } from '../src/lib/ai/provider';

const Question = z.object({
  id: z.string(),
  question: z.string(),
  mustMentionAll: z.array(z.string()).default([]),
  mustMentionAny: z.array(z.array(z.string())).default([]),
  mustMentionAny2: z.array(z.array(z.string())).default([]),
  mustCiteAny: z.array(z.array(z.string())).default([]),
  mustNotClaim: z.array(z.string()).default([]),
  rubric: z.object({ mustConclude: z.string(), mustNotConclude: z.string() }).optional(),
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
  judge?: { pass: boolean; reason: string };
  tools: string[];
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
  if (q.rubric && !o.judge?.pass) failed.push(`rubric: ${o.judge?.reason ?? 'not judged'}`);
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
  const o: Outcome = { tools: [], answer: '', steps: 0, limited: false, valid: [], invalid: [] };
  const events: AgentEvent[] = [];
  const result = await runAgent({ db: h.db, provider, question: q.question, emit: (ev) => events.push(ev) });
  o.answer = result.answer;
  o.tools = result.trace.filter((t) => t.status !== 'start').map((t) => `${t.step}. ${t.label} → ${t.summary ?? t.status}`);
  o.steps = result.steps;
  o.limited = result.limited;
  o.valid = result.citations.valid;
  o.invalid = result.citations.invalid;
  if (result.error) o.error = result.error;
  return o;
}

const Verdict = z.object({ meets_must_conclude: z.boolean(), commits_must_not_conclude: z.boolean(), reason: z.string() });

/** One no-tools call, JSON verdict, one retry on unparseable output. Errors are a failed verdict, never a pass. */
async function judge(q: Question, answer: string): Promise<{ pass: boolean; reason: string }> {
  if (!answer.trim()) return { pass: false, reason: 'empty answer' };
  const messages = [
    { role: 'system' as const, content: 'You grade an intelligence analyst\'s written answer against a rubric. Judge only what the answer itself concludes (its bottom line and assessment), not what it lists as alternatives it discounted. Reply with one JSON object and nothing else: {"meets_must_conclude": boolean, "commits_must_not_conclude": boolean, "reason": "one sentence"}.' },
    { role: 'user' as const, content: `QUESTION:\n${q.question}\n\nMUST CONCLUDE:\n${q.rubric!.mustConclude}\n\nMUST NOT CONCLUDE:\n${q.rubric!.mustNotConclude}\n\nANSWER TO GRADE:\n${answer.slice(0, 8000)}` },
  ];
  let last = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let text = '';
      for await (const ev of provider.complete({ messages, tools: [], temperature: 0 })) if (ev.type === 'text') text += ev.delta;
      last = text;
      const m = text.match(/\{[\s\S]*\}/);
      const v = Verdict.safeParse(m ? JSON.parse(m[0]) : null);
      if (v.success) return { pass: v.data.meets_must_conclude && !v.data.commits_must_not_conclude, reason: v.data.reason };
    } catch (e) {
      last = (e as Error).message;
    }
  }
  return { pass: false, reason: `judge gave no usable verdict (${last.slice(0, 120)})` };
}

const rejudge = flag('--rejudge');
if (rejudge) {
  const saved = JSON.parse(fs.readFileSync(rejudge, 'utf8')) as { results: Array<{ id: string; answer: string }> };
  for (const r of saved.results) {
    const q = questions.find((x) => x.id === r.id);
    if (!q?.rubric) continue;
    const v = await judge(q, r.answer);
    console.log(`${v.pass ? 'PASS' : 'FAIL'}  ${r.id}  ${v.reason}`);
  }
  await h.close();
  process.exit(0);
}

interface Row { id: string; pass: boolean; required: boolean; steps: string; cites: string; failed: string[]; soft: string[] }
const rows: Row[] = [];
const dump: Array<{ id: string; run: number; pass: boolean; failed: string[]; ms: number } & Outcome> = [];

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
    if (q.rubric && !o.error) o.judge = await judge(q, o.answer);
    const s = score(q, o);
    outcomes.push(o);
    scores.push(s);
    dump.push({ id: q.id, run: i + 1, pass: s.pass, failed: s.failed, ms: Date.now() - t0, ...o });
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

fs.mkdirSync('.evals', { recursive: true });
const dumpPath = `.evals/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
fs.writeFileSync(dumpPath, JSON.stringify({ model: provider.model, reasoning: process.env.OPENROUTER_REASONING ?? DEFAULT_REASONING, driver: h.driver, results: dump }, null, 2));
console.log(`\nanswers and traces: ${dumpPath}`);

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
