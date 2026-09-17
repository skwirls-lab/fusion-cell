/**
 * Dependency-free twin of scripts/smoke-model.ts (P0.2). Same five checks, same
 * candidate list, same pass rule — but it talks to OpenRouter's HTTP API with
 * Node's built-in fetch and hand-rolled SSE parsing, so it runs with no
 * node_modules at all:
 *
 *   node scripts/smoke-model-raw.mjs
 *
 * It exists for environments where the npm registry is unreachable (see
 * KNOWN_ISSUES.md B3). It is a real check against the real endpoint, but it does
 * NOT exercise src/lib/ai/provider.ts — smoke-model.ts remains the P0.2 gate and
 * must be run wherever dependencies can be installed.
 *
 * Node >= 22.21 honours HTTPS_PROXY when NODE_USE_ENV_PROXY=1 is set; the script
 * sets it for itself. Exit codes: 0 pass · 2 every candidate failed · 3 network.
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

if (process.env.HTTPS_PROXY && process.env.NODE_USE_ENV_PROXY !== '1') {
  const r = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' },
  });
  process.exit(r.status ?? 1);
}

const ENV_FILE = '.env.local';
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2].trim();
    const q = v.match(/^(["'`])([\s\S]*?)\1/);
    if (q) v = q[2];                       // quoted: keep verbatim
    else v = v.replace(/\s+#.*$/, '').trim(); // unquoted: drop an inline comment, like dotenv
    process.env[m[1]] = v;
  }
}

const API_KEY = process.env.OPENROUTER_API_KEY;
const BASE_URL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
if (!API_KEY) { console.error('OPENROUTER_API_KEY is not set'); process.exit(2); }
if (/[^\x21-\x7e]/.test(API_KEY) || API_KEY.length < 32) {
  console.error(`OPENROUTER_API_KEY is malformed (length ${API_KEY.length}${/[^\x21-\x7e]/.test(API_KEY) ? ', contains non-ASCII characters' : ''}) — a key pasted from a redacted display ("sk-or-v1-…") looks like this. Re-copy the full key.`);
  process.exit(2);
}

// Keep in step with scripts/smoke-model.ts. OpenRouter ids carry a vendor
// prefix; the bare id the human gave us is tried as written, then prefixed.
const configured = process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-v4-flash-0731';
// --no-fallback: test only the configured model, never a pricier one.
const NO_FALLBACK = process.argv.includes('--no-fallback');
const MODEL_CANDIDATES = [...new Set(NO_FALLBACK ? [configured] : [
  configured,
  configured.includes('/') ? configured : `deepseek/${configured}`,
  'deepseek/deepseek-v4-pro',
  'anthropic/claude-sonnet-4',
  'openai/gpt-4o-mini',
])];

const NUMBERS = { alpha: 17, beta: 25 };
const EXPECTED_SUM = NUMBERS.alpha + NUMBERS.beta;
const TOY_TOOLS = [
  { type: 'function', function: { name: 'get_number', description: 'Look up the secret number registered under a name.',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } } },
  { type: 'function', function: { name: 'add', description: 'Add two numbers and return the sum.',
    parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'], additionalProperties: false } } },
];

/** One streaming chat completion; returns text, chunk count, completed tool calls. */
async function complete(model, messages, tools = []) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json',
      'HTTP-Referer': 'https://fusion-cell.local', 'X-Title': 'Fusion Cell smoke test' },
    body: JSON.stringify({ model, messages, temperature: 0, stream: true, ...(tools.length ? { tools } : {}) }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const out = { text: '', chunks: 0, toolCalls: [], finishReason: null };
  const calls = new Map(); // index -> {id,name,args}
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let json; try { json = JSON.parse(data); } catch { continue; }
      if (json.error) throw new Error(`stream error: ${JSON.stringify(json.error).slice(0, 300)}`);
      const choice = json.choices?.[0]; if (!choice) continue;
      const d = choice.delta ?? {};
      if (typeof d.content === 'string' && d.content.length) { out.text += d.content; out.chunks++; }
      for (const tc of d.tool_calls ?? []) {
        const idx = tc.index ?? 0;
        const cur = calls.get(idx) ?? { id: '', name: '', args: '' };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        calls.set(idx, cur);
      }
      if (choice.finish_reason) out.finishReason = choice.finish_reason;
    }
  }
  out.toolCalls = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, c], i) => ({ id: c.id || `call_${i}`, name: c.name, argumentsJson: c.args }));
  return out;
}

const CHECKS = [
  { name: '1 plain completion returns text', run: async (m) => {
    const r = await complete(m, [{ role: 'user', content: 'Reply with the single word: ready' }]);
    if (!r.text.trim()) throw new Error('empty completion');
  } },
  { name: '2 three-step tool loop reaches the correct sum', run: async (m, log) => {
    const messages = [
      { role: 'system', content: 'You must use the tools to answer. Never guess a number.' },
      { role: 'user', content: 'Use get_number to fetch the numbers registered under "alpha" and "beta", then use add to sum them. Reply with the sum as digits.' },
    ];
    let calls = 0, sawAdd = false;
    for (let turn = 0; turn < 6; turn++) {
      const r = await complete(m, messages, TOY_TOOLS);
      if (!r.toolCalls.length) {
        if (!sawAdd) throw new Error(`model answered without calling add (after ${calls} tool calls): ${r.text.slice(0, 120)}`);
        if (!r.text.replace(/,/g, '').includes(String(EXPECTED_SUM))) throw new Error(`final answer lacks ${EXPECTED_SUM}: ${r.text.slice(0, 120)}`);
        log(`tool calls: ${calls}, turns: ${turn + 1}, answer: ${r.text.trim().slice(0, 60)}`);
        return;
      }
      messages.push({ role: 'assistant', content: r.text || null, tool_calls: r.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.argumentsJson } })) });
      for (const c of r.toolCalls) {
        calls++;
        let args; try { args = JSON.parse(c.argumentsJson); } catch { throw new Error(`tool args not JSON: ${c.argumentsJson}`); }
        let result;
        if (c.name === 'get_number') result = { value: NUMBERS[String(args.name).toLowerCase()] ?? null };
        else if (c.name === 'add') { sawAdd = true; result = { sum: Number(args.a) + Number(args.b) }; }
        else result = { error: `unknown tool ${c.name}` };
        messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result) });
      }
    }
    throw new Error('tool loop did not finish in 6 turns');
  } },
  { name: '3 streaming yields more than one chunk', run: async (m, log) => {
    const r = await complete(m, [{ role: 'user', content: 'Count from one to thirty in words, separated by commas.' }]);
    log(`${r.chunks} chunks`);
    if (r.chunks < 2) throw new Error(`only ${r.chunks} chunk(s)`);
  } },
  { name: '4 structured JSON validates against the schema', run: async (m) => {
    const r = await complete(m, [
      { role: 'system', content: 'Reply with a single JSON object and nothing else. No markdown fences.' },
      { role: 'user', content: 'Give me {"name": string, "hops": integer, "tags": string[]} describing a fictional courier vessel.' },
    ]);
    const match = r.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`no JSON object in: ${r.text.slice(0, 120)}`);
    const o = JSON.parse(match[0]);
    const problems = [];
    if (typeof o.name !== 'string') problems.push('name not a string');
    if (!Number.isInteger(o.hops)) problems.push('hops not an integer');
    if (!Array.isArray(o.tags) || !o.tags.length || o.tags.some((t) => typeof t !== 'string')) problems.push('tags not a non-empty string[]');
    if (problems.length) throw new Error(`schema mismatch: ${problems.join('; ')}`);
  } },
  { name: '5 tool arguments parse as JSON on every call', run: async (m, log) => {
    const r = await complete(m, [{ role: 'user', content: 'Fetch the numbers registered under "alpha" and under "beta" using get_number.' }], TOY_TOOLS);
    if (!r.toolCalls.length) throw new Error('no tool calls emitted');
    const bad = r.toolCalls.filter((c) => { try { JSON.parse(c.argumentsJson); return false; } catch { return true; } });
    for (const c of bad) log(`unparseable args for ${c.name}: ${c.argumentsJson}`);
    if (bad.length) throw new Error(`${bad.length}/${r.toolCalls.length} calls had unparseable arguments`);
    log(`${r.toolCalls.length} calls, all parse`);
  } },
];

function isNetworkBlocked(e) {
  const texts = []; const seen = new Set(); let cur = e;
  while (cur && typeof cur === 'object' && !seen.has(cur)) { seen.add(cur); if (typeof cur.message === 'string') texts.push(cur.message); if (typeof cur.code === 'string') texts.push(cur.code); cur = cur.cause; }
  return /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|not in allowlist|host_not_allowed|CONNECT|proxy-407|fetch failed|tunnel/i.test(texts.join(' | '));
}

function writeModel(model) {
  const line = `OPENROUTER_MODEL=${model}`;
  if (!fs.existsSync(ENV_FILE)) { fs.writeFileSync(ENV_FILE, `${line}\n`); return; }
  const text = fs.readFileSync(ENV_FILE, 'utf8');
  const re = /^OPENROUTER_MODEL=.*$/m;
  fs.writeFileSync(ENV_FILE, re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, '\n')}${line}\n`);
}

const failures = {};
for (const model of MODEL_CANDIDATES) {
  console.log(`\n=== "${model}" ===`);
  const failed = [];
  for (const check of CHECKS) {
    const notes = [];
    const t0 = Date.now();
    try {
      await check.run(model, (s) => notes.push(s));
      console.log(`PASS  ${check.name}  [${model}]  ${Date.now() - t0}ms${notes.length ? `  (${notes.join('; ')})` : ''}`);
    } catch (e) {
      if (isNetworkBlocked(e)) { console.error(`\nnetwork blocked — run this from a machine that can reach openrouter.ai\n(${e.message})`); process.exit(3); }
      failed.push(check.name);
      console.log(`FAIL  ${check.name}  [${model}]  ${e.message}${notes.length ? `  (${notes.join('; ')})` : ''}`);
      if (/HTTP 401/.test(e.message)) { console.error('\nOpenRouter rejected the API key (401) — fix OPENROUTER_API_KEY before anything else'); process.exit(2); }
      if (/HTTP 404/.test(e.message) || (/HTTP 400/.test(e.message) && /model/i.test(e.message))) {
        console.log(`      OpenRouter rejected the model id "${model}" (see the message above) — skipping its remaining checks`);
        failed.push('(rejected model id)'); break;
      }
    }
  }
  if (!failed.length) {
    writeModel(model);
    console.log(`\nP0.2 (raw) PASS — OPENROUTER_MODEL=${model} written to ${ENV_FILE}`);
    process.exit(0);
  }
  failures[model] = failed;
}
console.error(`\nP0.2 (raw) FAIL — no candidate passed every check${NO_FALLBACK ? ' (fallbacks disabled)' : ''}:`);
for (const [m, f] of Object.entries(failures)) console.error(`  ${m}: failed ${f.join(', ')}`);
process.exit(2);
