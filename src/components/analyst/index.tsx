'use client';

/**
 * AI analyst chat panel. Talks to POST /api/analyst/chat over SSE and mirrors
 * the agent's events: tool trace (collapsible), UI highlights (into the shared
 * selection store), streamed markdown with citation chips, limit notices.
 * Conversation history lives here and is sent back as text turns only.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Markdown, { type Components } from 'react-markdown';
import { useSelection } from '@/stores/selection';
import { useEntityProfile } from '@/lib/client/api';
import type { AgentEvent } from '@/lib/ai/agent';
import { DEFAULT_MAX_STEPS } from '@/lib/ai/limits';
import { parseSseChunk } from './sse';
import { DraftBriefButton } from '@/components/brief/DraftBriefButton';

// ---- local state shapes ------------------------------------------------------------

interface TraceStep {
  step: number;
  tool: string;
  label: string;
  status: 'start' | 'ok' | 'error';
  ms?: number;
  summary?: string;
}

interface UserTurn { id: number; role: 'user'; content: string }
interface AssistantTurn {
  id: number;
  role: 'assistant';
  content: string;
  trace: TraceStep[];
  citations: { valid: string[]; invalid: string[] } | null;
  limited: boolean;
  steps: number | null;
  model: string | null;
  error: string | null;
  streaming: boolean;
}
type Turn = UserTurn | AssistantTurn;

const CITATION_RE = /\[(R-\d{4})\]/g;
const CITE_HREF = '#cite-';

/** Fold one agent event into an in-flight assistant turn. Pure, so it is easy to reason about. */
export function applyEvent(turn: AssistantTurn, ev: AgentEvent): AssistantTurn {
  switch (ev.type) {
    case 'trace': {
      const trace = [...turn.trace];
      const i = ev.status === 'start' ? -1 : trace.findLastIndex((t) => t.status === 'start' && t.tool === ev.tool && t.step === ev.step);
      const row: TraceStep = { step: ev.step, tool: ev.tool, label: ev.label, status: ev.status, ms: ev.ms, summary: ev.summary };
      if (i >= 0) trace[i] = row; else trace.push(row);
      return { ...turn, trace };
    }
    case 'token': return { ...turn, content: turn.content + ev.delta };
    case 'citations': return { ...turn, citations: { valid: ev.valid, invalid: ev.invalid } };
    case 'limit': return { ...turn, limited: true };
    case 'done': return { ...turn, content: ev.answer || turn.content, steps: ev.steps, model: ev.model, streaming: false };
    case 'error': return { ...turn, error: ev.message, streaming: false };
    case 'ui': return turn;
  }
}

// ---- rendering helpers ------------------------------------------------------------

function CitationChip({ number, invalid }: { number: string; invalid: boolean }) {
  const openReport = useSelection((s) => s.openReport);
  return (
    <button
      type="button"
      data-testid="citation-chip"
      data-citation={number}
      data-invalid={invalid || undefined}
      title={invalid ? 'not returned by any tool in this conversation' : `Open report ${number}`}
      onClick={() => openReport(number)}
      className={
        'mx-0.5 inline-block rounded border px-1 font-mono text-[10px] leading-4 align-baseline ' +
        (invalid
          ? 'border-hegemony/60 bg-hegemony/10 text-hegemony line-through decoration-hegemony/70'
          : 'border-concord/40 bg-concord/10 text-concord hover:bg-concord/25')
      }
    >
      {number}
    </button>
  );
}

function AnswerMarkdown({ text, invalid }: { text: string; invalid: Set<string> }) {
  // Citations become links to a sentinel href, which the `a` override turns into chips.
  const source = useMemo(() => text.replace(CITATION_RE, (_, n: string) => `[${n}](${CITE_HREF}${n})`), [text]);
  const components = useMemo<Components>(() => ({
    a: ({ href, children }) => {
      if (href?.startsWith(CITE_HREF)) {
        const n = href.slice(CITE_HREF.length);
        return <CitationChip number={n} invalid={invalid.has(n)} />;
      }
      return <a href={href} target="_blank" rel="noreferrer" className="text-concord underline">{children}</a>;
    },
    p: ({ children }) => <p className="my-1.5">{children}</p>,
    ul: ({ children }) => <ul className="my-1.5 list-disc pl-4">{children}</ul>,
    ol: ({ children }) => <ol className="my-1.5 list-decimal pl-4">{children}</ol>,
    li: ({ children }) => <li className="my-0.5">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
    h1: ({ children }) => <h3 className="mt-2 text-[12px] font-semibold uppercase tracking-wide text-muted">{children}</h3>,
    h2: ({ children }) => <h3 className="mt-2 text-[12px] font-semibold uppercase tracking-wide text-muted">{children}</h3>,
    h3: ({ children }) => <h3 className="mt-2 text-[12px] font-semibold uppercase tracking-wide text-muted">{children}</h3>,
    code: ({ children }) => <code className="rounded bg-panel-2 px-1 font-mono text-[11px]">{children}</code>,
  }), [invalid]);
  return <Markdown components={components}>{source}</Markdown>;
}

const DOT: Record<TraceStep['status'], string> = {
  start: 'bg-muted animate-pulse',
  ok: 'bg-concord',
  error: 'bg-hegemony',
};

function TraceBlock({ trace, streaming }: { trace: TraceStep[]; streaming: boolean }) {
  if (!trace.length) return null;
  return (
    <details className="mb-2 rounded border border-border bg-panel-2/60 text-[11px]" open={streaming} data-testid="analyst-trace">
      <summary className="cursor-pointer select-none px-2 py-1 text-muted hover:text-text">
        Investigation trace · {trace.length} {trace.length === 1 ? 'step' : 'steps'}
      </summary>
      <ol className="px-2 pb-1.5">
        {trace.map((t, i) => (
          <li key={i} className="flex items-baseline gap-2 py-0.5">
            <span className={`inline-block h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${DOT[t.status]}`} aria-label={t.status} />
            <span className="min-w-0 flex-1 truncate text-text" title={t.label}>{t.label}</span>
            {t.summary && <span className={'shrink-0 ' + (t.status === 'error' ? 'text-hegemony' : 'text-muted')}>{t.summary}</span>}
            {t.ms !== undefined && <span className="shrink-0 font-mono text-muted">{t.ms}ms</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}

function AssistantBubble({ turn }: { turn: AssistantTurn }) {
  const invalid = useMemo(() => new Set(turn.citations?.invalid ?? []), [turn.citations]);
  return (
    <div className="pr-2" data-testid="analyst-answer" data-streaming={turn.streaming || undefined}>
      <TraceBlock trace={turn.trace} streaming={turn.streaming} />
      {turn.limited && (
        <div className="mb-2 rounded border border-banner/60 bg-banner/10 px-2 py-1 text-[11px] text-banner" role="status">
          Step limit reached — answer is based on partial investigation
        </div>
      )}
      {turn.content ? (
        <div className="text-[12.5px] leading-relaxed text-text">
          <AnswerMarkdown text={turn.content} invalid={invalid} />
        </div>
      ) : turn.streaming ? (
        <div className="text-[12px] text-muted">{turn.trace.length ? 'Investigating…' : 'Thinking…'}</div>
      ) : null}
      {turn.error && (
        <div className="mt-2 rounded border border-hegemony/60 bg-hegemony/10 px-2 py-1 text-[11px] text-hegemony" role="alert">
          {turn.error}
        </div>
      )}
      {!turn.streaming && (turn.steps !== null || turn.citations) && (
        <div className="mt-2 flex flex-wrap gap-x-3 text-[10px] text-muted">
          {turn.steps !== null && <span>Steps: {turn.steps}/{DEFAULT_MAX_STEPS}{turn.model ? ` · ${turn.model}` : ''}</span>}
          {turn.citations && (
            <span>
              Citations: {turn.citations.valid.length} valid
              {turn.citations.invalid.length > 0 && <span className="text-hegemony"> · {turn.citations.invalid.length} invalid</span>}
            </span>
          )}
          {turn.content && !turn.error && turn.citations && <DraftBriefButton text={turn.content} citations={turn.citations.valid} />}
        </div>
      )}
    </div>
  );
}

// ---- the panel --------------------------------------------------------------------

const ALWAYS_PROMPTS = [
  'Who is LANTERN, and what are they enabling?',
  'What threats to Convoy 7 exist?',
  'Summarize Hegemony activity near Tessaly Gate',
];

export function AnalystPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const idRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const selectedKind = useSelection((s) => s.selectedKind);
  const selectedId = useSelection((s) => s.selectedId);
  const prefill = useSelection((s) => s.analystPrefill);
  const setAnalystPrefill = useSelection((s) => s.setAnalystPrefill);
  const { data: profile } = useEntityProfile(selectedKind === 'entity' ? selectedId : null);
  const selectionName = selectedKind === 'entity' && profile?.entity.id === selectedId ? profile.entity.name : undefined;

  useEffect(() => {
    if (prefill === null) return;
    setInput(prefill);
    setAnalystPrefill(null);
    textareaRef.current?.focus();
  }, [prefill, setAnalystPrefill]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const suggestions = useMemo(() => {
    const name = selectionName ?? (selectedKind === 'entity' ? selectedId : null);
    const contextual = name ? [`Tell me about ${name}`, `Who is ${name} connected to and why?`] : [];
    return [...contextual, ...ALWAYS_PROMPTS];
  }, [selectionName, selectedKind, selectedId]);

  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || streaming) return;
    const sel = useSelection.getState();
    sel.clearHighlights('ai');
    const history = turns
      .filter((t) => t.role === 'user' || (t.content && !t.error))
      .map((t) => ({ role: t.role, content: t.content }))
      .slice(-20);
    const userTurn: UserTurn = { id: ++idRef.current, role: 'user', content: q };
    const assistantId = ++idRef.current;
    const pending: AssistantTurn = {
      id: assistantId, role: 'assistant', content: '', trace: [], citations: null,
      limited: false, steps: null, model: null, error: null, streaming: true,
    };
    setTurns((prev) => [...prev, userTurn, pending]);
    setInput('');
    setStreaming(true);

    const patch = (fn: (t: AssistantTurn) => AssistantTurn) =>
      setTurns((prev) => prev.map((t) => (t.id === assistantId && t.role === 'assistant' ? fn(t) : t)));

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch('/api/analyst/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: q,
          selection: sel.selectedKind && sel.selectedId ? { kind: sel.selectedKind, id: sel.selectedId, name: selectionName } : null,
          history,
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '');
        throw new Error(`Analyst request failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const parsed = parseSseChunk(buffer, decoder.decode(value, { stream: true }));
        buffer = parsed.rest;
        for (const ev of parsed.events) {
          if (ev.type === 'ui') {
            useSelection.getState().setHighlights({ entityIds: ev.entityIds, eventIds: ev.eventIds, edgeIds: ev.edgeIds }, 'ai');
          }
          patch((t) => applyEvent(t, ev));
        }
      }
      patch((t) => (t.streaming ? { ...t, streaming: false, error: t.content ? t.error : (t.error ?? 'The stream ended without an answer.') } : t));
    } catch (e) {
      const aborted = ac.signal.aborted;
      patch((t) => ({ ...t, streaming: false, error: aborted ? (t.content ? null : 'Stopped.') : (e instanceof Error ? e.message : String(e)) }));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setStreaming(false);
    }
  }, [streaming, turns, selectionName]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void ask(input);
    }
  };

  const promptRow = (
    <div className="flex flex-wrap gap-1" data-testid="analyst-suggestions">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          disabled={streaming}
          onClick={() => void ask(s)}
          className="rounded-full border border-border bg-panel-2 px-2 py-0.5 text-[11px] text-muted hover:border-concord/50 hover:text-text disabled:opacity-50"
        >
          {s}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="analyst-panel">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {turns.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] leading-relaxed text-muted">
              Ask a question about the Meridian Reach picture. The analyst retrieves reports and graph
              data with tools, shows every step it took, cites report numbers you can open, and highlights
              the entities it identifies on the map and link chart. It proposes; you decide.
            </p>
            {promptRow}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {turns.map((t) =>
              t.role === 'user' ? (
                <div key={t.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-lg rounded-br-sm bg-panel-2 px-3 py-1.5 text-[12px] text-muted whitespace-pre-wrap" data-testid="analyst-user">
                    {t.content}
                  </div>
                </div>
              ) : (
                <AssistantBubble key={t.id} turn={t} />
              ),
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border">
        <div className="h-0.5 w-full overflow-hidden bg-transparent" aria-hidden>
          {streaming && <div className="h-full w-1/3 animate-pulse bg-concord" data-testid="analyst-progress" />}
        </div>
        <div className="flex flex-col gap-2 p-2">
          {turns.length > 0 && promptRow}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder="Ask the analyst… (Enter to send, Shift+Enter for a new line)"
              aria-label="Ask the analyst"
              data-testid="analyst-input"
              className="min-h-[3.25rem] flex-1 resize-none rounded border border-border bg-bg px-2 py-1.5 text-[12px] text-text placeholder:text-muted/70 focus:border-concord/60 focus:outline-none"
            />
            {streaming ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                data-testid="analyst-stop"
                className="h-8 rounded border border-hegemony/60 px-3 text-[12px] text-hegemony hover:bg-hegemony/10"
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void ask(input)}
                disabled={!input.trim()}
                data-testid="analyst-send"
                className="h-8 rounded bg-concord px-3 text-[12px] font-medium text-bg hover:bg-concord/90 disabled:opacity-40"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnalystPanel;
