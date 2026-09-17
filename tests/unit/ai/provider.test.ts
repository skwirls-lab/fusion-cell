/**
 * OpenRouterProvider against a local HTTP server speaking the OpenAI SSE wire
 * format: the stall guard (silent stream → abort → one retry) and the
 * OPENROUTER_REASONING mapping. No network, no real model.
 */
import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ModelStallError, OpenRouterProvider, reasoningParam, type ProviderEvent } from '@/lib/ai/provider';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, body: Record<string, unknown>) => void;

let server: http.Server | undefined;
afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((r) => (server ? server.close(r) : r(null)));
  server = undefined;
});

async function serve(handlers: Handler[]): Promise<{ url: string; bodies: Array<Record<string, unknown>> }> {
  const bodies: Array<Record<string, unknown>> = [];
  let n = 0;
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw) as Record<string, unknown>;
      bodies.push(body);
      handlers[Math.min(n++, handlers.length - 1)](req, res, body);
    });
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, bodies };
}

const sseHead = (res: http.ServerResponse) => res.writeHead(200, { 'content-type': 'text/event-stream' });
const chunk = (delta: object, finish: string | null = null) =>
  `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 0, model: 'm', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;

const answers: Handler = (_req, res) => {
  sseHead(res);
  res.write(chunk({ role: 'assistant', content: 'hello ' }));
  res.write(chunk({ content: 'world' }, 'stop'));
  res.end('data: [DONE]\n\n');
};
const hangsSilently: Handler = (_req, res) => { sseHead(res); res.write(': keep-alive\n\n'); };
const neverStops: Handler = (_req, res) => {
  sseHead(res);
  const t = setInterval(() => { if (res.writableEnded || res.destroyed) clearInterval(t); else res.write(chunk({ content: ' ' })); }, 20);
  res.on('close', () => clearInterval(t));
};
const hangsAfterText: Handler = (_req, res) => { sseHead(res); res.write(chunk({ role: 'assistant', content: 'partial' })); };

async function drain(it: AsyncIterable<ProviderEvent>) {
  const out: ProviderEvent[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

const make = (url: string, extra: { reasoning?: string } = {}) =>
  new OpenRouterProvider({ apiKey: 'test', model: 'm', baseURL: url, stallMs: 150, ...extra });

describe('OpenRouterProvider stall guard', () => {
  it('retries once when a stream goes silent before yielding anything', async () => {
    const { url, bodies } = await serve([hangsSilently, answers]);
    const events = await drain(make(url).complete({ messages: [{ role: 'user', content: 'hi' }], tools: [] }));
    expect(events.filter((e) => e.type === 'text').map((e) => (e as { delta: string }).delta).join('')).toBe('hello world');
    expect(events.at(-1)).toMatchObject({ type: 'done', finishReason: 'stop' });
    expect(bodies).toHaveLength(2);
  });

  it('throws ModelStallError when the retry stalls too', async () => {
    const { url, bodies } = await serve([hangsSilently]);
    await expect(drain(make(url).complete({ messages: [{ role: 'user', content: 'hi' }], tools: [] }))).rejects.toBeInstanceOf(ModelStallError);
    expect(bodies).toHaveLength(2);
  });

  it('does not retry once text has been yielded (a retry would duplicate it)', async () => {
    const { url, bodies } = await serve([hangsAfterText, answers]);
    const seen: ProviderEvent[] = [];
    await expect((async () => {
      for await (const ev of make(url).complete({ messages: [{ role: 'user', content: 'hi' }], tools: [] })) seen.push(ev);
    })()).rejects.toBeInstanceOf(ModelStallError);
    expect(seen).toEqual([{ type: 'text', delta: 'partial' }]);
    expect(bodies).toHaveLength(1);
  });

  it('a stream that never goes silent is still cut off at the call deadline', async () => {
    const { url, bodies } = await serve([neverStops]);
    const p = new OpenRouterProvider({ apiKey: 'test', model: 'm', baseURL: url, stallMs: 150, callDeadlineMs: 300 });
    const t0 = Date.now();
    const err = await drain(p.complete({ messages: [{ role: 'user', content: 'hi' }], tools: [] })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModelStallError);
    expect((err as Error).message).toMatch(/still generating/);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(bodies).toHaveLength(1); // text had been yielded, so no retry
    expect(bodies[0].max_tokens).toBeGreaterThan(0);
  });

  it('a call that overruns before yielding anything (a tool-call turn) is NOT retried', async () => {
    const reasoningForever: Handler = (_req, res) => {
      sseHead(res);
      const t = setInterval(() => { if (res.destroyed) clearInterval(t); else res.write(chunk({ reasoning: 'hmm ' } as object)); }, 20);
      res.on('close', () => clearInterval(t));
    };
    const { url, bodies } = await serve([reasoningForever, answers]);
    const p = new OpenRouterProvider({ apiKey: 'test', model: 'm', baseURL: url, stallMs: 150, callDeadlineMs: 5000 });
    const err = await drain(p.complete({ messages: [{ role: 'user', content: 'hi' }], tools: [], deadlineMs: 250 })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModelStallError);
    expect((err as ModelStallError).overran).toBe(true); // the per-request deadline won over the provider default
    expect(bodies).toHaveLength(1);
  });

  it('a caller abort is not a stall and is not retried', async () => {
    const { url, bodies } = await serve([hangsSilently, answers]);
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 30);
    const err = await drain(make(url).complete({ messages: [{ role: 'user', content: 'hi' }], tools: [], signal: ac.signal })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ModelStallError);
    expect(bodies).toHaveLength(1);
  });
});

describe('reasoning setting', () => {
  it('maps OPENROUTER_REASONING values to the request parameter', () => {
    expect(reasoningParam('off')).toEqual({ enabled: false });
    expect(reasoningParam(' LOW ')).toEqual({ effort: 'low' });
    expect(reasoningParam('high')).toEqual({ effort: 'high' });
    expect(reasoningParam(undefined)).toBeUndefined();
    expect(reasoningParam('default')).toBeUndefined();
  });

  it('is sent in the request body only when set', async () => {
    const { url, bodies } = await serve([answers]);
    await drain(make(url, { reasoning: 'off' }).complete({ messages: [{ role: 'user', content: 'hi' }], tools: [] }));
    await drain(make(url, { reasoning: '' }).complete({ messages: [{ role: 'user', content: 'hi' }], tools: [] }));
    expect(bodies[0].reasoning).toEqual({ enabled: false });
    expect('reasoning' in bodies[1]).toBe(false);
  });
});
