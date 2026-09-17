/**
 * Body contract for POST /api/analyst/chat and a JSON-body parser that fails
 * the same way parseQuery does (ZodError → 400 via handle()).
 */
import { z, ZodError, type ZodType } from 'zod';

export const ChatSelection = z.object({
  kind: z.enum(['entity', 'event']),
  id: z.string().min(1).max(200),
  name: z.string().max(200).optional(),
});

export const ChatHistoryTurn = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(20_000),
});

export const ChatRequestBody = z.object({
  question: z.string().trim().min(1).max(2000),
  selection: ChatSelection.nullable().optional(),
  history: z.array(ChatHistoryTurn).max(20).default([]),
});

export type ChatRequest = z.output<typeof ChatRequestBody>;

export async function parseBody<T extends ZodType>(schema: T, req: Request): Promise<z.output<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ZodError([{ code: 'custom', path: [], message: 'body must be a JSON object', input: undefined }]);
  }
  return schema.parse(raw);
}
