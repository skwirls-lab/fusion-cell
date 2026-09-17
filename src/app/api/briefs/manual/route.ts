/**
 * POST /api/briefs/manual — DEV-ONLY test seam. Inserts a brief row exactly as
 * the drafting route would after Steps A–C, without calling any model. It exists
 * so the editor / versioning / preview / print flows can be end-to-end tested in
 * an environment where the model is unreachable. It skips generation entirely:
 * nothing about draftBrief, runAgent, or the structuring call is exercised here
 * (those are covered by tests/unit/brief/draft.test.ts with a scripted model).
 * 404 in production so it is not a write path anyone can reach.
 */
import { getDb } from '@/lib/db';
import { handle, json } from '@/lib/api';
import { createBrief } from '@/lib/db/queries';
import { parseBody } from '@/lib/ai/request';
import { ManualBriefBody } from '../schemas';

export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  if (process.env.NODE_ENV === 'production') return json({ error: 'not_found' }, { status: 404 });
  const body = await parseBody(ManualBriefBody, req);
  const brief = await createBrief(await getDb(), {
    title: body.title,
    template: body.template,
    content: body.content ?? { source: 'manual' },
    markdown: body.markdown,
    subjectEntityId: body.subjectEntityId ?? null,
    topic: body.topic,
    citations: body.citations,
  });
  return json(brief, { status: 201 });
});
