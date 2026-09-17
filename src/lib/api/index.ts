/**
 * Route-handler plumbing shared by every /api route: query parsing against
 * the Zod contract, and one error boundary so a bad input is a typed 400 and
 * anything else is a typed 500 (stack goes to the server log, never the body).
 */
import { ZodError, type ZodType, type z } from 'zod';

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

/** URLSearchParams -> plain object -> schema. Repeated keys keep the last value. */
export function parseQuery<T extends ZodType>(schema: T, req: Request): z.output<T> {
  const obj: Record<string, string> = {};
  for (const [k, v] of new URL(req.url).searchParams) obj[k] = v;
  return schema.parse(obj);
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

export function handle<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ZodError) {
        return json({ error: 'invalid_request', issues: e.issues }, { status: 400 });
      }
      console.error(e instanceof Error ? (e.stack ?? e.message) : e);
      return json(
        { error: 'internal_error', message: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
  };
}
