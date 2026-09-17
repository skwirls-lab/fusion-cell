/**
 * The one place a model is called. A thin streaming interface over OpenAI-shaped
 * chat completions so the agent loop is testable without a network:
 *
 *   OpenRouterProvider — the real thing (openai SDK pointed at openrouter.ai).
 *   ScriptedProvider   — replays scripted turns; used by every unit test.
 *
 * Tool-call deltas are accumulated here and emitted once complete, so the loop
 * never sees a half-streamed JSON argument string.
 */
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam, ChatCompletionTool, ChatCompletionChunk,
} from 'openai/resources/chat/completions';

export type JsonSchema = Record<string, unknown>;

export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ToolCallRecord {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCallRecord[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export type ProviderEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; argumentsJson: string } // emitted once complete
  | { type: 'done'; finishReason: string; usage?: Usage };

export interface CompleteRequest {
  messages: ChatMessage[];
  tools: ToolSpec[];
  temperature?: number;
}

export interface ChatProvider {
  /** Model id, for the audit trail and the UI footer. */
  readonly model: string;
  complete(req: CompleteRequest): AsyncIterable<ProviderEvent>;
}

// ---- OpenRouter ----------------------------------------------------------------

export interface OpenRouterOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

const toOpenAiTool = (t: ToolSpec): ChatCompletionTool => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.parameters },
});

// ChatMessage is a strict subset of the SDK's union; the mapping is explicit so
// a future shape change fails here, in one place, not deep inside the SDK.
function toOpenAiMessage(m: ChatMessage): ChatCompletionMessageParam {
  switch (m.role) {
    case 'system': return { role: 'system', content: m.content };
    case 'user': return { role: 'user', content: m.content };
    case 'assistant': return m.tool_calls?.length
      ? { role: 'assistant', content: m.content, tool_calls: m.tool_calls }
      : { role: 'assistant', content: m.content ?? '' };
    case 'tool': return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content };
  }
}

export class OpenRouterProvider implements ChatProvider {
  readonly model: string;
  private readonly client: OpenAI;

  constructor(opts: OpenRouterOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
    this.model = opts.model ?? process.env.OPENROUTER_MODEL ?? '';
    if (!this.model) throw new Error('OPENROUTER_MODEL is not set');
    this.client = new OpenAI({
      apiKey,
      baseURL: opts.baseURL ?? 'https://openrouter.ai/api/v1',
      defaultHeaders: { 'HTTP-Referer': 'https://fusion-cell.local', 'X-Title': 'Fusion Cell' },
      maxRetries: 1,
    });
  }

  async *complete(req: CompleteRequest): AsyncIterable<ProviderEvent> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: req.messages.map(toOpenAiMessage),
      tools: req.tools.length ? req.tools.map(toOpenAiTool) : undefined,
      temperature: req.temperature,
      stream: true,
      stream_options: { include_usage: true },
    });

    const pending = new Map<number, { id: string; name: string; args: string }>();
    let finishReason = 'stop';
    let usage: Usage | undefined;

    for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        };
      }
      const choice = chunk.choices[0];
      if (!choice) continue;
      if (choice.delta.content) yield { type: 'text', delta: choice.delta.content };
      for (const tc of choice.delta.tool_calls ?? []) {
        const cur = pending.get(tc.index) ?? { id: '', name: '', args: '' };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        pending.set(tc.index, cur);
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    for (const [index, tc] of [...pending.entries()].sort((a, b) => a[0] - b[0])) {
      yield { type: 'tool_call', id: tc.id || `call_${index}`, name: tc.name, argumentsJson: tc.args };
    }
    yield { type: 'done', finishReason, usage };
  }
}

// ---- Scripted (tests) -----------------------------------------------------------

export type ScriptedToolCall = { name: string; args: unknown } | { name: string; rawArgs: string };
export type ScriptedTurn = { toolCalls: ScriptedToolCall[] } | { text: string };

/**
 * Replays `turns` in order, one per complete() call, and records every request
 * it received so tests can inspect the transcript the loop built.
 */
export class ScriptedProvider implements ChatProvider {
  readonly model = 'scripted';
  readonly requests: CompleteRequest[] = [];
  private cursor = 0;
  private calls = 0;

  constructor(private readonly turns: ScriptedTurn[]) {}

  async *complete(req: CompleteRequest): AsyncIterable<ProviderEvent> {
    this.requests.push({ ...req, messages: [...req.messages] }); // snapshot: the loop mutates its array
    const turn = this.turns[this.cursor++];
    if (!turn) throw new Error(`ScriptedProvider: script exhausted after ${this.turns.length} turns`);
    if ('text' in turn) {
      // Two-plus chunks so consumers are exercised on partial text.
      const mid = Math.ceil(turn.text.length / 2);
      for (const delta of [turn.text.slice(0, mid), turn.text.slice(mid)]) if (delta) yield { type: 'text', delta };
      yield { type: 'done', finishReason: 'stop' };
      return;
    }
    for (const tc of turn.toolCalls) {
      const argumentsJson = 'rawArgs' in tc ? tc.rawArgs : JSON.stringify(tc.args);
      yield { type: 'tool_call', id: `call_${++this.calls}`, name: tc.name, argumentsJson };
    }
    yield { type: 'done', finishReason: 'tool_calls' };
  }
}

/** The production provider, configured from the environment. */
export function getProvider(): ChatProvider {
  return new OpenRouterProvider();
}

/**
 * True when the failure is the network refusing to carry the request at all
 * (no route, DNS, or a proxy that answers CONNECT with 403) as opposed to the
 * model or the API answering. Scripts use this to exit 3 instead of failing a gate.
 */
export function isNetworkBlocked(e: unknown): boolean {
  const seen = new Set<unknown>();
  const texts: string[] = [];
  let cur: unknown = e;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const o = cur as { message?: unknown; code?: unknown; cause?: unknown; status?: unknown };
    if (typeof o.message === 'string') texts.push(o.message);
    if (typeof o.code === 'string') texts.push(o.code);
    if (o.status === 407) texts.push('proxy-407');
    cur = o.cause;
  }
  const t = texts.join(' | ');
  // "Host not in allowlist" is what this sandbox's egress proxy returns (as a 403);
  // a bare 403 is deliberately not matched because OpenRouter uses it for real errors.
  return /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|not in allowlist|CONNECT|proxy-407|fetch failed|Connection error|tunnel/i.test(t);
}
