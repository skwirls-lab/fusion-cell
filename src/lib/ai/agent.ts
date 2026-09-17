/**
 * The analyst agent loop: system prompt + history + question, then up to
 * `maxSteps` tool turns, then a final answer with citation validation. Every
 * observable thing (tool trace, UI highlights, answer tokens, limits, errors)
 * is pushed through `emit`, which the chat route turns into SSE and the tests
 * collect into an array. The full transcript is returned for auditing.
 */
import type { Db } from '../db';
import { existingReportNumbers } from '../db/queries';
import type { ChatMessage, ChatProvider, ProviderEvent, ToolCallRecord, Usage } from './provider';
import { SYSTEM_PROMPT, FORCE_ANSWER_NUDGE, EMPTY_ANSWER_NUDGE, buildUserContext, type SelectionContext } from './prompt';
import { TOOLS, toToolSpecs, stringifyResult, type AnalystTool, type ToolContext } from './tools';
import { DEFAULT_MAX_STEPS } from './limits';

export type TraceStatus = 'start' | 'ok' | 'error';

export type AgentEvent =
  | { type: 'trace'; step: number; tool: string; label: string; args: unknown; status: TraceStatus; ms?: number; summary?: string }
  | { type: 'ui'; action: 'highlight'; entityIds: string[]; eventIds: string[]; edgeIds: string[] }
  | { type: 'token'; delta: string }
  | { type: 'citations'; valid: string[]; invalid: string[] }
  | { type: 'limit'; reason: 'steps' | 'tokens' | 'time' }
  | { type: 'done'; answer: string; steps: number; model: string; usage?: unknown }
  | { type: 'error'; message: string };

export type TraceEvent = Extract<AgentEvent, { type: 'trace' }>;

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface RunAgentOptions {
  db: Db;
  provider: ChatProvider;
  question: string;
  selection?: SelectionContext | null;
  history?: HistoryTurn[];
  maxSteps?: number;
  /** Wall-clock budget for tool turns. Once spent, the next turn is the forced final answer, so a platform time limit cuts off nothing. */
  budgetMs?: number;
  now?: () => number;
  temperature?: number;
  tools?: AnalystTool[];
  /** Client went away: stop between steps, emit nothing more. */
  signal?: AbortSignal;
  emit: (ev: AgentEvent) => void;
}

export interface AgentResult {
  answer: string;
  steps: number;
  limited: boolean;
  citations: { valid: string[]; invalid: string[] };
  messages: ChatMessage[];
  trace: TraceEvent[];
  usage?: Usage;
  error?: string;
}

export { DEFAULT_MAX_STEPS };
export const CITATION_RE = /\[(R-\d{4})\]/g;

/**
 * Models drift from the [R-0042] format: "(R-0042)", "R-0042", "[R-0019, R-0042]", "[R-0019; R-0042]".
 * Every report number in the answer is a citation and must face validation, so they are all rewritten
 * to the canonical form. Without this an unbracketed fabricated number would escape the check entirely.
 */
export function normalizeCitations(text: string): string {
  return text
    .replace(/[\[(]\s*((?:R-\d{4}\s*[,;&]?\s*(?:and\s+)?)+)[\])]/g, (_, inner: string) => (inner.match(/R-\d{4}/g) ?? []).map((n) => `[${n}]`).join(' '))
    .replace(/(?<![\[\w-])(R-\d{4})(?![\]\w])/g, '[$1]');
}

interface Turn {
  text: string;
  deltas: string[];
  toolCalls: Array<{ id: string; name: string; argumentsJson: string }>;
  finishReason: string;
  usage?: Usage;
}

/** Drain one provider call. Text is buffered per turn so narration before a tool call is never mistaken for the answer. */
async function collectTurn(events: AsyncIterable<ProviderEvent>, onText?: (delta: string) => void): Promise<Turn> {
  const turn: Turn = { text: '', deltas: [], toolCalls: [], finishReason: 'stop' };
  for await (const ev of events) {
    if (ev.type === 'text') {
      turn.text += ev.delta;
      turn.deltas.push(ev.delta);
      onText?.(ev.delta);
    } else if (ev.type === 'tool_call') {
      turn.toolCalls.push({ id: ev.id, name: ev.name, argumentsJson: ev.argumentsJson });
    } else {
      turn.finishReason = ev.finishReason;
      turn.usage = ev.usage;
    }
  }
  return turn;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  const { db, provider, emit, signal } = opts;
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  const now = opts.now ?? Date.now;
  const startedAt = now();
  const outOfTime = () => opts.budgetMs !== undefined && now() - startedAt >= opts.budgetMs;
  const tools = opts.tools ?? TOOLS;
  const specs = toToolSpecs(tools);
  const ctx: ToolContext = { seenReportNumbers: new Set() };
  const trace: TraceEvent[] = [];
  const callsMade = new Map<string, number>();
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(opts.history ?? []).map((h): ChatMessage => ({ role: h.role, content: h.content })),
    { role: 'user', content: buildUserContext(opts.question, opts.selection) },
  ];
  const result: AgentResult = { answer: '', steps: 0, limited: false, citations: { valid: [], invalid: [] }, messages, trace };

  const send = (ev: AgentEvent) => {
    if (ev.type === 'trace') trace.push(ev);
    emit(ev);
  };
  const checkAborted = () => {
    if (signal?.aborted) throw new Error('aborted');
  };

  const execute = async (call: Turn['toolCalls'][number], step: number): Promise<string> => {
    const tool = tools.find((t) => t.name === call.name);
    if (!tool) {
      send({ type: 'trace', step, tool: call.name, label: `Unknown tool "${call.name}"`, args: call.argumentsJson, status: 'error', summary: 'unknown_tool' });
      return JSON.stringify({ error: 'unknown_tool', name: call.name, available: tools.map((t) => t.name) });
    }
    let raw: unknown;
    try {
      raw = call.argumentsJson.trim() ? JSON.parse(call.argumentsJson) : {};
    } catch {
      send({ type: 'trace', step, tool: tool.name, label: `${tool.name}: arguments were not valid JSON`, args: call.argumentsJson, status: 'error', summary: 'invalid_json' });
      return JSON.stringify({ error: 'invalid_json', message: 'Tool arguments must be a JSON object. Call again with valid JSON.' });
    }
    const parsed = tool.schema.safeParse(raw);
    if (!parsed.success) {
      send({ type: 'trace', step, tool: tool.name, label: `${tool.name}: invalid arguments`, args: raw, status: 'error', summary: 'invalid_arguments' });
      return JSON.stringify({ error: 'invalid_arguments', issues: parsed.error.issues });
    }
    const args = parsed.data;
    const label = tool.label(args);
    // Seen live: a cheap model re-runs the identical call several times and burns its step budget.
    // The repeat gets a pointer instead of the same payload again (highlight_in_ui is idempotent UI state).
    const callKey = `${tool.name}:${JSON.stringify(args)}`;
    const firstStep = callsMade.get(callKey);
    if (firstStep !== undefined && tool.name !== 'highlight_in_ui') {
      send({ type: 'trace', step, tool: tool.name, label, args, status: 'ok', ms: 0, summary: `duplicate of step ${firstStep}` });
      return JSON.stringify({ duplicate_call: true, first_made_at_step: firstStep, note: 'You already made this exact call; its result is above and has not changed. Do not repeat it. Read specific reports with get_report, follow a different lead, or write the final answer.' });
    }
    callsMade.set(callKey, step);
    send({ type: 'trace', step, tool: tool.name, label, args, status: 'start' });
    const t0 = Date.now();
    try {
      const out = await tool.run(db, args, ctx);
      send({ type: 'trace', step, tool: tool.name, label, args, status: 'ok', ms: Date.now() - t0, summary: tool.summarize(out) });
      if (tool.name === 'highlight_in_ui') {
        const h = args as { entity_ids: string[]; event_ids: string[]; edge_ids: string[] };
        send({ type: 'ui', action: 'highlight', entityIds: h.entity_ids, eventIds: h.event_ids, edgeIds: h.edge_ids });
      }
      return stringifyResult(out);
    } catch (e) {
      send({ type: 'trace', step, tool: tool.name, label, args, status: 'error', ms: Date.now() - t0, summary: errMsg(e) });
      return JSON.stringify({ error: 'tool_failed', message: errMsg(e) });
    }
  };

  try {
    let finalTurn: Turn | null = null;

    while (!finalTurn) {
      checkAborted();
      if (result.steps > 0 && outOfTime()) {
        result.limited = true;
        send({ type: 'limit', reason: 'time' });
        break;
      }
      const turn = await collectTurn(provider.complete({ messages, tools: specs, temperature: opts.temperature, signal }));
      if (turn.usage) result.usage = turn.usage;

      if (!turn.toolCalls.length) {
        finalTurn = turn;
        for (const d of turn.deltas) send({ type: 'token', delta: d });
        break;
      }
      if (result.steps >= maxSteps) {
        // The model wants more tools than it may have. Its unexecuted request is
        // dropped (a tool_calls message with no results is invalid) and it is
        // told to answer with what it has.
        result.limited = true;
        send({ type: 'limit', reason: 'steps' });
        break;
      }

      const step = ++result.steps;
      const toolCalls: ToolCallRecord[] = turn.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.argumentsJson } }));
      messages.push({ role: 'assistant', content: turn.text || null, tool_calls: toolCalls });
      for (const call of turn.toolCalls) {
        checkAborted();
        const content = await execute(call, step);
        messages.push({ role: 'tool', tool_call_id: call.id, content });
      }
    }

    // Tools are withheld on these calls, so nothing can precede a tool call: stream live.
    const answerWithoutTools = async (nudge: string): Promise<Turn> => {
      checkAborted();
      // A user turn, not a system one: after tool results some chat templates treat a late
      // system message as text to continue (seen live: the answer opened with half the nudge).
      messages.push({ role: 'user', content: nudge });
      const turn = await collectTurn(
        provider.complete({ messages, tools: [], temperature: opts.temperature, signal }),
        (delta) => send({ type: 'token', delta }),
      );
      if (turn.usage) result.usage = turn.usage;
      return turn;
    };

    if (!finalTurn) finalTurn = await answerWithoutTools(FORCE_ANSWER_NUDGE);
    // Seen live: a turn that ends with no text and no tool calls. Ask once more rather than fail the question.
    if (!finalTurn.text.trim()) finalTurn = await answerWithoutTools(EMPTY_ANSWER_NUDGE);

    result.answer = normalizeCitations(finalTurn.text.trim());
    messages.push({ role: 'assistant', content: result.answer });

    // Citation validation: cited ⊆ (returned by a tool in this run ∩ exists in DB).
    const cited = [...new Set([...result.answer.matchAll(CITATION_RE)].map((m) => m[1]))];
    const existing = await existingReportNumbers(db, cited);
    result.citations = {
      valid: cited.filter((n) => ctx.seenReportNumbers.has(n) && existing.has(n)),
      invalid: cited.filter((n) => !(ctx.seenReportNumbers.has(n) && existing.has(n))),
    };
    send({ type: 'citations', ...result.citations });

    if (!result.answer) send({ type: 'error', message: 'The model returned no answer text.' });
    send({ type: 'done', answer: result.answer, steps: result.steps, model: provider.model, usage: result.usage });
  } catch (e) {
    result.error = errMsg(e);
    if (!signal?.aborted) send({ type: 'error', message: result.error });
  }
  return result;
}
