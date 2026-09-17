/**
 * GET  /api/briefs — the list (newest edit first).
 * POST /api/briefs — drafts a brief and streams progress as SSE, framed exactly
 * like /api/analyst/chat (`data: <event JSON>\n\n`): the analyst's trace events
 * while evidence is gathered, one more trace step for the structuring call, a
 * `citations` event, then `{ type: 'brief', id, title, markdown }` once the row
 * is saved — or `{ type: 'error' }`. Only a bad body or an unknown subject
 * entity is a plain JSON status; everything after the stream opens is an event.
 */
import { getDb } from '@/lib/db';
import { handle, json } from '@/lib/api';
import { createBrief, listBriefs, entityHeadsByIds } from '@/lib/db/queries';
import { draftBrief, type BriefEvent } from '@/lib/ai/brief';
import { getProvider } from '@/lib/ai/provider';
import { parseBody } from '@/lib/ai/request';
import { DraftBriefBody } from './schemas';

export const dynamic = 'force-dynamic';
// Literal on purpose: Next reads segment config statically. Keep equal to AGENT_MAX_DURATION_S.
export const maxDuration = 300;

export const GET = handle(async () => {
  const db = await getDb();
  return json({ briefs: await listBriefs(db) });
});

export const POST = handle(async (req) => {
  const body = await parseBody(DraftBriefBody, req);
  const db = await getDb();
  if (body.subject?.entityId) {
    const [head] = await entityHeadsByIds(db, [body.subject.entityId]);
    if (!head) return json({ error: 'not_found', entityId: body.subject.entityId }, { status: 404 });
  }
  if (body.template === 'entity_profile' && !body.subject?.entityId) {
    return json({ error: 'invalid_request', message: 'entity_profile requires subject.entityId' }, { status: 400 });
  }
  const encoder = new TextEncoder();
  // The reader going away must stop the draft (and the billing) even if req.signal never fires.
  const gone = new AbortController();
  const signal = AbortSignal.any([req.signal, gone.signal]);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (ev: BriefEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          open = false;
        }
      };
      try {
        const draft = await draftBrief({
          db,
          provider: getProvider(),
          template: body.template,
          subject: body.subject,
          seedAnswer: body.seedAnswer,
          signal,
          emit: send,
        });
        const saved = await createBrief(db, {
          title: draft.title,
          template: body.template,
          content: draft.content,
          markdown: draft.markdown,
          subjectEntityId: draft.subjectEntity?.id ?? null,
          topic: body.subject?.topic ?? '',
          citations: draft.citations,
        });
        send({ type: 'brief', id: saved.id, title: saved.title, markdown: saved.markdown });
      } catch (e) {
        if (!signal.aborted) send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      } finally {
        open = false;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() { gone.abort(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});
