/**
 * Pure SSE frame parser for the analyst stream. Frames are `data: <json>\n\n`;
 * a fetch chunk can end mid-frame, so the caller keeps `rest` and feeds it
 * back with the next chunk.
 */
import type { AgentEvent } from '@/lib/ai/agent';

export interface SseParseResult {
  events: AgentEvent[];
  rest: string;
}

export function parseSseChunk(buffer: string, chunk: string): SseParseResult {
  const text = (buffer + chunk).replace(/\r\n/g, '\n');
  const frames = text.split('\n\n');
  const rest = frames.pop() ?? '';
  const events: AgentEvent[] = [];
  for (const frame of frames) {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data) continue; // comment or keep-alive frame
    try {
      events.push(JSON.parse(data) as AgentEvent);
    } catch {
      // A frame that is not JSON is a server bug, not a user problem; skip it rather than kill the stream.
    }
  }
  return { events, rest };
}
