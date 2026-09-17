/**
 * P0.2 gate: prove, against the real OpenRouter endpoint, that a model can do
 * what the analyst needs. Five checks per candidate; the first model that
 * passes all five is written to .env.local as OPENROUTER_MODEL.
 *
 * Exit codes: 0 pass · 2 every candidate failed · 3 network blocked (run from
 * a machine that can reach openrouter.ai; nothing here is a code defect).
 */
import './_env.ts';
import fs from 'node:fs';
import { z } from 'zod';
import { OpenRouterProvider, isNetworkBlocked, type ChatMessage, type ToolSpec } from '../src/lib/ai/provider';

// The human's model first (BUILD.md §1 / DECISIONS D4), then the same id with
// its vendor prefix — OpenRouter lists it as deepseek/deepseek-v4-flash-0731
// (D26) — then progressively more capable fallbacks, all confirmed present in
// GET /models on 2026-09-17. An unlisted id answers 404 and the loop moves on.
const configured = process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-v4-flash-0731';
const MODEL_CANDIDATES = [...new Set([
  configured,
  configured.includes('/') ? configured : `deepseek/${configured}`,
  'deepseek/deepseek-v4-pro',
  'anthropic/claude-sonnet-4',
  'openai/gpt-4o-mini',
])];

const ENV_FILE = '.env.local';
const NUMBERS: Record<string, number> = { alpha: 17, beta: 25 };
const EXPECTED_SUM = NUMBERS.alpha + NUMBERS.beta;

const TOY_TOOLS: ToolSpec[] = [
  {
    name: 'get_number',
    description: 'Look up the secret number registered under a name.',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false },
  },
  {
    name: 'add',
    description: 'Add two numbers and return the sum.',
    parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'], additionalProperties: false },
  },
];

interface Collected { text: string; chunks: number; toolCalls: Array<{ id: string; name: string; argumentsJson: string }> }

async function collect(p: OpenRouterProvider, messages: ChatMessage[], tools: ToolSpec[] = []): Promise<Collected> {
  const out: Collected = { text: '', chunks: 0, toolCalls: [] };
  for await (const ev of p.complete({ messages, tools, temperature: 0 })) {
    if (ev.type === 'text') { out.text += ev.delta; out.chunks++; }
    else if (ev.type === 'tool_call') out.toolCalls.push({ id: ev.id, name: ev.name, argumentsJson: ev.argumentsJson });
  }
  return out;
}

type Check = { name: string; run: (p: OpenRouterProvider, log: (s: string) => void) => Promise<void> };

const CHECKS: Check[] = [
  {
    name: '1 plain completion returns text',
    run: async (p) => {
      const r = await collect(p, [{ role: 'user', content: 'Reply with the single word: ready' }]);
      if (!r.text.trim()) throw new Error('empty completion');
    },
  },
  {
    name: '2 three-step tool loop reaches the correct sum',
    run: async (p, log) => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You must use the tools to answer. Never guess a number.' },
        { role: 'user', content: 'Use get_number to fetch the numbers registered under "alpha" and "beta", then use add to sum them. Reply with the sum as digits.' },
      ];
      let calls = 0;
      let sawAdd = false;
      for (let turn = 0; turn < 6; turn++) {
        const r = await collect(p, messages, TOY_TOOLS);
        if (!r.toolCalls.length) {
          if (!sawAdd) throw new Error(`model answered without calling add (after ${calls} tool calls): ${r.text.slice(0, 120)}`);
          if (!r.text.replace(/,/g, '').includes(String(EXPECTED_SUM))) throw new Error(`final answer lacks ${EXPECTED_SUM}: ${r.text.slice(0, 120)}`);
          log(`tool calls: ${calls}, answer: ${r.text.trim().slice(0, 60)}`);
          return;
        }
        messages.push({ role: 'assistant', content: r.text || null, tool_calls: r.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.argumentsJson } })) });
        for (const c of r.toolCalls) {
          calls++;
          let args: Record<string, unknown>;
          try { args = JSON.parse(c.argumentsJson) as Record<string, unknown>; }
          catch { throw new Error(`tool args not JSON: ${c.argumentsJson}`); }
          let result: unknown;
          if (c.name === 'get_number') result = { value: NUMBERS[String(args.name).toLowerCase()] ?? null };
          else if (c.name === 'add') { sawAdd = true; result = { sum: Number(args.a) + Number(args.b) }; }
          else result = { error: `unknown tool ${c.name}` };
          messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result) });
        }
      }
      throw new Error('tool loop did not finish in 6 turns');
    },
  },
  {
    name: '3 streaming yields more than one chunk',
    run: async (p, log) => {
      const r = await collect(p, [{ role: 'user', content: 'Count from one to thirty in words, separated by commas.' }]);
      log(`${r.chunks} chunks`);
      if (r.chunks < 2) throw new Error(`only ${r.chunks} chunk(s)`);
    },
  },
  {
    name: '4 structured JSON validates against a Zod schema',
    run: async (p) => {
      const Schema = z.object({ name: z.string(), hops: z.number().int(), tags: z.array(z.string()).min(1) });
      const r = await collect(p, [
        { role: 'system', content: 'Reply with a single JSON object and nothing else. No markdown fences.' },
        { role: 'user', content: 'Give me {"name": string, "hops": integer, "tags": string[]} describing a fictional courier vessel.' },
      ]);
      const m = r.text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error(`no JSON object in: ${r.text.slice(0, 120)}`);
      const parsed = Schema.safeParse(JSON.parse(m[0]));
      if (!parsed.success) throw new Error(`schema mismatch: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    },
  },
  {
    name: '5 tool arguments parse as JSON on every call',
    run: async (p, log) => {
      // Parallel-call friendly prompt; every emitted call must carry parseable args.
      const r = await collect(p, [
        { role: 'user', content: 'Fetch the numbers registered under "alpha" and under "beta" using get_number.' },
      ], TOY_TOOLS);
      if (!r.toolCalls.length) throw new Error('no tool calls emitted');
      const bad = r.toolCalls.filter((c) => { try { JSON.parse(c.argumentsJson); return false; } catch { return true; } });
      for (const c of bad) log(`unparseable args for ${c.name}: ${c.argumentsJson}`);
      if (bad.length) throw new Error(`${bad.length}/${r.toolCalls.length} calls had unparseable arguments`);
      log(`${r.toolCalls.length} calls, all parse`);
    },
  },
];

function writeModel(model: string) {
  const line = `OPENROUTER_MODEL=${model}`;
  if (!fs.existsSync(ENV_FILE)) { fs.writeFileSync(ENV_FILE, `${line}\n`); return; }
  const text = fs.readFileSync(ENV_FILE, 'utf8');
  const re = /^OPENROUTER_MODEL=.*$/m;
  fs.writeFileSync(ENV_FILE, re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, '\n')}${line}\n`);
}

const failures: Record<string, string[]> = {};

for (const model of MODEL_CANDIDATES) {
  console.log(`\n=== ${model} ===`);
  let provider: OpenRouterProvider;
  try {
    provider = new OpenRouterProvider({ model });
  } catch (e) {
    console.error(`FAIL: ${(e as Error).message}`);
    process.exit(2);
  }
  const failed: string[] = [];
  for (const check of CHECKS) {
    const notes: string[] = [];
    try {
      await check.run(provider, (s) => notes.push(s));
      console.log(`PASS  ${check.name}  [${model}]${notes.length ? `  (${notes.join('; ')})` : ''}`);
    } catch (e) {
      if (isNetworkBlocked(e)) {
        console.error(`\nnetwork blocked — run this from a machine that can reach openrouter.ai\n(${(e as Error).message})`);
        process.exit(3);
      }
      failed.push(check.name);
      console.log(`FAIL  ${check.name}  [${model}]  ${(e as Error).message}${notes.length ? `  (${notes.join('; ')})` : ''}`);
    }
  }
  if (!failed.length) {
    writeModel(model);
    console.log(`\nP0.2 PASS — OPENROUTER_MODEL=${model} written to ${ENV_FILE}`);
    process.exit(0);
  }
  failures[model] = failed;
}

console.error('\nP0.2 FAIL — no candidate passed every check:');
for (const [m, f] of Object.entries(failures)) console.error(`  ${m}: failed ${f.join(', ')}`);
console.error('If every candidate failed check 2, escalate: the core tool loop is not achievable with the available models.');
process.exit(2);
