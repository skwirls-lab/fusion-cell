/**
 * Client side of POST /api/briefs: sends the draft request and folds the SSE
 * frames (same framing as the analyst stream) into `onEvent`. Resolves with the
 * final `brief` event; rejects on an `error` event, a non-2xx, or a stream that
 * ends without a brief.
 */
import type { BriefEvent } from '@/lib/ai/brief';
import { parseSseChunk } from '@/components/analyst/sse';

export interface DraftRequest {
  template: 'daily_summary' | 'threat_assessment' | 'entity_profile';
  subject?: { entityId?: string; topic?: string; question?: string };
  seedAnswer?: { text: string; citations: string[] };
}

export type BriefDone = Extract<BriefEvent, { type: 'brief' }>;

export async function streamBrief(body: DraftRequest, onEvent: (ev: BriefEvent) => void, signal?: AbortSignal): Promise<BriefDone> {
  const res = await fetch('/api/briefs', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let detail = '';
    try {
      const j = (await res.json()) as { error?: string; message?: string };
      detail = j.message ?? j.error ?? '';
    } catch { /* not JSON */ }
    throw new Error(`Brief request failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done: BriefDone | null = null;
  let error: string | null = null;
  for (;;) {
    const { value, done: eof } = await reader.read();
    if (eof) break;
    const parsed = parseSseChunk(buffer, decoder.decode(value, { stream: true }));
    buffer = parsed.rest;
    for (const raw of parsed.events) {
      const ev = raw as BriefEvent;
      onEvent(ev);
      if (ev.type === 'brief') done = ev;
      else if (ev.type === 'error') error = ev.message;
    }
  }
  if (done) return done;
  throw new Error(error ?? 'The stream ended without a brief.');
}
