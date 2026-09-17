/** POST /api/ingest/:id/commit — apply the analyst's decisions in one transaction (P6.4). */
import { getDb } from '@/lib/db';
import { handle, json } from '@/lib/api';
import { parseBody } from '@/lib/ai/request';
import { commitIngest, CommitError, type CommitErrorCode } from '@/lib/ingest/commit';
import { CommitBody } from '@/lib/ingest/types';

export const dynamic = 'force-dynamic';

const STATUS: Record<CommitErrorCode, number> = {
  not_found: 404, no_extraction: 409, already_committed: 409, discarded: 409, bad_decision: 400,
};

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { decisions } = await parseBody(CommitBody, req);
  const db = await getDb();
  try {
    return json(await commitIngest(db, id, decisions));
  } catch (e) {
    if (e instanceof CommitError) return json({ error: e.code, message: e.message }, { status: STATUS[e.code] });
    throw e;
  }
});
