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
import { SYSTEM_PROMPT, FORCE_ANSWER_NUDGE, buildUserContext, type SelectionContext } from './prompt';
import { TOOLS, toToolSpecs, stringifyResult, type AnalystTool, type ToolContext } from './tools';
import { DEFAULT_MAX_STEPS } from './limits';

export type TraceStatus = 'start' | 'ok' | 'error';

export type AgentEvent =
  | { type: 'trace'; step: number; tool: string; label: string; args: unknown; status: TraceStatus; ms?: number; summary?: string }
  | { type: 'ui'; action: 'highlight'; entityIds: string[]; eventIds: string[]; edgeIds: string[] }
  | { type: 'token'; delta: string }
  | { type: 'citations'; valid: string[]; invalid: string[] }
  | { type: 'limit'; reason: 'steps' | 'tokens' }
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
  const tools = opts.tools ?? TOOLS;
  const specs = toToolSpecs(tools);
  const ctx: ToolContext = { seenReportNumbers: new Set() };
  const trace: TraceEvent[] = [];
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

    if (!finalTurn) {
      checkAborted();
      messages.push({ role: 'system', content: FORCE_ANSWER_NUDGE });
      // Tools are withheld, so nothing here can precede a tool call: stream live.
      finalTurn = await collectTurn(
        provider.complete({ messages, tools: [], temperature: opts.temperature, signal }),
        (delta) => send({ type: 'token', delta }),
      );
      if (finalTurn.usage) result.usage = finalTurn.usage;
    }

    result.answer = finalTurn.text.trim();
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
