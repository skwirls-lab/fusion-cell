import { describe, it, expect } from 'vitest';
import { parseSseChunk } from '@/components/analyst/sse';

const frame = (ev: unknown) => `data: ${JSON.stringify(ev)}\n\n`;

describe('parseSseChunk', () => {
  it('parses whole frames and leaves nothing behind', () => {
    const { events, rest } = parseSseChunk('', frame({ type: 'token', delta: 'a' }) + frame({ type: 'limit', reason: 'steps' }));
    expect(events).toEqual([{ type: 'token', delta: 'a' }, { type: 'limit', reason: 'steps' }]);
    expect(rest).toBe('');
  });

  it('handles a frame split across chunk boundaries', () => {
    const full = frame({ type: 'token', delta: 'hello world' }) + frame({ type: 'done', answer: 'x', steps: 1, model: 'm' });
    const cut = 20; // mid-JSON
    const first = parseSseChunk('', full.slice(0, cut));
    expect(first.events).toEqual([]);
    expect(first.rest).toBe(full.slice(0, cut));
    const second = parseSseChunk(first.rest, full.slice(cut));
    expect(second.events).toEqual([
      { type: 'token', delta: 'hello world' },
      { type: 'done', answer: 'x', steps: 1, model: 'm' },
    ]);
    expect(second.rest).toBe('');
  });

  it('handles the split landing between the two newlines', () => {
    const full = frame({ type: 'token', delta: 'a' });
    const first = parseSseChunk('', full.slice(0, full.length - 1));
    expect(first.events).toEqual([]);
    const second = parseSseChunk(first.rest, full.slice(full.length - 1));
    expect(second.events).toEqual([{ type: 'token', delta: 'a' }]);
  });

  it('accepts CRLF, multi-line data and skips comments and bad JSON', () => {
    const text = ': keep-alive\r\n\r\ndata: {"type":"token",\r\ndata: "delta":"x"}\r\n\r\ndata: not json\r\n\r\n';
    const { events, rest } = parseSseChunk('', text);
    expect(events).toEqual([{ type: 'token', delta: 'x' }]);
    expect(rest).toBe('');
  });
});
