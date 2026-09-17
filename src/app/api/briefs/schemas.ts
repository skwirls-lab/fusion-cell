/** Body contracts for the /api/briefs routes. ZodError → 400 via handle(). */
import { z } from 'zod';
import { BriefTemplateSchema } from '@/lib/ai/brief';

export const BriefSubjectBody = z.object({
  entityId: z.string().trim().min(1).max(200).optional(),
  topic: z.string().trim().max(300).optional(),
  question: z.string().trim().max(2000).optional(),
});

export const DraftBriefBody = z.object({
  template: BriefTemplateSchema,
  subject: BriefSubjectBody.optional(),
  seedAnswer: z.object({
    text: z.string().trim().min(1).max(40_000),
    citations: z.array(z.string().regex(/^R-\d{4}$/i)).max(200).default([]),
  }).optional(),
});

export const PatchBriefBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  markdown: z.string().max(200_000).optional(),
}).refine((b) => b.title !== undefined || b.markdown !== undefined, { message: 'title or markdown is required' });

export const ManualBriefBody = z.object({
  title: z.string().trim().min(1).max(200),
  template: BriefTemplateSchema,
  markdown: z.string().min(1).max(200_000),
  citations: z.array(z.string().regex(/^R-\d{4}$/)).max(200).default([]),
  topic: z.string().trim().max(300).default(''),
  subjectEntityId: z.string().trim().min(1).max(200).optional(),
  content: z.unknown().optional(),
});
