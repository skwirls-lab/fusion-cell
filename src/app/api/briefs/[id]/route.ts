/** GET / PATCH / DELETE one brief. PATCH is a new version (version++, updated_at). */
import { getDb } from '@/lib/db';
import { handle, json } from '@/lib/api';
import { deleteBrief, getBrief, updateBrief } from '@/lib/db/queries';
import { parseBody } from '@/lib/ai/request';
import { PatchBriefBody } from '../schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const brief = await getBrief(await getDb(), id);
  if (!brief) return json({ error: 'not_found', id }, { status: 404 });
  return json(brief);
});

export const PATCH = handle(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const patch = await parseBody(PatchBriefBody, req);
  const brief = await updateBrief(await getDb(), id, patch);
  if (!brief) return json({ error: 'not_found', id }, { status: 404 });
  return json(brief);
});

export const DELETE = handle(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const ok = await deleteBrief(await getDb(), id);
  if (!ok) return json({ error: 'not_found', id }, { status: 404 });
  return json({ ok: true });
});
