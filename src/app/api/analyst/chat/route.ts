/**
 * POST /api/analyst/chat — runs the analyst agent and streams its events as
 * Server-Sent Events (`data: <AgentEvent JSON>\n\n`). Errors inside the run
 * are events too, so the client always gets a well-formed stream; only a bad
 * body is a plain 400 (via handle()). The proxy gates this behind the cookie.
 */
import { getDb } from '@/lib/db';
import { handle } from '@/lib/api';
import { runAgent, type AgentEvent } from '@/lib/ai/agent';
import { getProvider } from '@/lib/ai/provider';
import { ChatRequestBody, parseBody } from '@/lib/ai/request';
import { AGENT_BUDGET_MS } from '@/lib/ai/limits';

export const dynamic = 'force-dynamic';
// Literal on purpose: Next reads segment config statically. Keep equal to AGENT_MAX_DURATION_S.
export const maxDuration = 300;

export const POST = handle(async (req) => {
  const body = await parseBody(ChatRequestBody, req);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (ev: AgentEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          open = false; // client disconnected; the agent stops at its next abort check
        }
      };
      try {
        const [db, provider] = [await getDb(), getProvider()];
        await runAgent({
          db,
          provider,
          question: body.question,
          selection: body.selection ?? null,
          history: body.history,
          budgetMs: AGENT_BUDGET_MS,
          signal: req.signal,
          emit: send,
        });
      } catch (e) {
        // runAgent catches its own errors; this covers getDb()/getProvider().
        send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      } finally {
        open = false;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
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
