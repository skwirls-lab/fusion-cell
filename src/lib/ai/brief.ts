/**
 * Brief drafting (BUILD.md P6.5, PRD §5.8). A brief is "run the analyst on a
 * templated question, then structure the result":
 *
 *   Step A  evidence   runAgent (the real analyst loop, real tools) — or, when
 *                      the caller hands over an existing analyst answer with
 *                      its validated citations, that answer as-is.
 *   Step B  structure  one no-tools model call that turns the analysis into a
 *                      BriefContent JSON object; Zod-validated, retried once.
 *   Step C  render     deterministic markdown the analyst then edits.
 *
 * Citation rule, same as the analyst's: the brief may only cite report numbers
 * that a tool returned in Step A (or that the seed answer's valid list holds)
 * AND that exist in the database. Anything else is stripped and reported.
 */
import { z } from 'zod';
import type { Db } from '../db';
import { entityHeadsByIds, existingReportNumbers } from '../db/queries';
import { BRIEF_TEMPLATES } from '../db/schema';
import { runAgent, CITATION_RE, type AgentEvent } from './agent';
import type { ChatMessage, ChatProvider } from './provider';
import { BRIEF_AGENT_BUDGET_MS } from './limits';

export type BriefTemplate = (typeof BRIEF_TEMPLATES)[number];
export const BriefTemplateSchema = z.enum(BRIEF_TEMPLATES);

export const TEMPLATE_LABEL: Record<BriefTemplate, string> = {
  daily_summary: 'Daily Intelligence Summary',
  threat_assessment: 'Threat Assessment',
  entity_profile: 'Entity Profile',
};

// ---- content contract -------------------------------------------------------------

const REPORT_NUMBER_RE = /R-\d{4}/gi;
const BLUF_MAX_WORDS = 80;
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Model output may write "R-0019", "[R-0019]" or "r-0019"; only the number survives. */
const citationList = z.array(z.string()).default([]).transform((xs) =>
  [...new Set(xs.flatMap((x) => [...x.matchAll(REPORT_NUMBER_RE)].map((m) => m[0].toUpperCase())))],
);

export const Confidence = z.enum(['low', 'moderate', 'high']);

export const BriefContentSchema = z.object({
  bluf: z.string().trim().min(1).refine((s) => wordCount(s) <= BLUF_MAX_WORDS, { message: `bluf must be ${BLUF_MAX_WORDS} words or fewer` }),
  key_judgments: z.array(z.object({
    statement: z.string().trim().min(1),
    confidence: Confidence,
    estimative: z.string().trim().default(''),
  })).min(1).max(12),
  evidence: z.array(z.object({
    point: z.string().trim().min(1),
    citations: citationList,
  })).min(1).max(40),
  indicators_and_warnings: z.array(z.string().trim().min(1)).max(20).optional(),
  intelligence_gaps: z.array(z.string().trim().min(1)).max(20).default([]),
  assumptions: z.array(z.string().trim().min(1)).max(20).default([]),
  entities_of_interest: z.array(z.object({ id: z.string().trim().min(1), name: z.string().trim().min(1) })).max(30).default([]),
});
export type BriefContent = z.output<typeof BriefContentSchema>;

export interface BriefSubject {
  entityId?: string;
  topic?: string;
  question?: string;
}

/** An analyst answer handed over from the chat panel: its text and the citations the agent already validated. */
export interface SeedAnswer {
  text: string;
  citations: string[];
}

export interface BriefMeta {
  title: string;
  template: BriefTemplate;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  subject: string;
}

export type BriefEvent = AgentEvent | { type: 'brief'; id: string; title: string; markdown: string };

export interface DraftBriefOptions {
  db: Db;
  provider: ChatProvider;
  template: BriefTemplate;
  subject?: BriefSubject;
  seedAnswer?: SeedAnswer;
  emit?: (ev: AgentEvent) => void;
  signal?: AbortSignal;
  /** Overrides today's date (tests, replay). */
  date?: string;
}

export interface DraftBriefResult {
  title: string;
  content: BriefContent;
  markdown: string;
  /** Report numbers the brief cites, all retrieved in Step A and present in the DB. */
  citations: string[];
  /** Report numbers the model produced that failed the citation rule (Step A answer or Step B content). */
  strippedCitations: string[];
  steps: number;
  model: string;
  subjectEntity: { id: string; name: string } | null;
  subjectLabel: string;
  /** The Step A analysis the brief was structured from, with invalid citations removed. */
  analysis: string;
}

// ---- templates -----------------------------------------------------------------------

export const TEMPLATE_QUESTION: Record<BriefTemplate, string> = {
  daily_summary: 'Summarize all significant activity in the Meridian Reach over the scenario window, by faction, with the most consequential developments first.',
  threat_assessment: 'Assess threats to Concord forces and convoys; identify actors, indicators, likely courses of action, and timing.',
  entity_profile: 'Produce a profile of {name}: who they are, affiliations, activity timeline, connections, and assessment.',
};

export function templateQuestion(template: BriefTemplate, subject: BriefSubject, entity: { id: string; name: string } | null): string {
  if (subject.question?.trim()) return subject.question.trim();
  switch (template) {
    case 'daily_summary':
      return TEMPLATE_QUESTION.daily_summary;
    case 'threat_assessment': {
      let q = TEMPLATE_QUESTION.threat_assessment;
      if (entity) q += ` Scope the assessment to ${entity.name} (entity id ${entity.id}).`;
      else if (subject.topic?.trim()) q += ` Scope the assessment to: ${subject.topic.trim()}.`;
      return q;
    }
    case 'entity_profile': {
      if (!entity) throw new Error('entity_profile requires subject.entityId');
      return TEMPLATE_QUESTION.entity_profile.replace('{name}', `${entity.name} (entity id ${entity.id})`);
    }
  }
}

export function briefTitle(template: BriefTemplate, subjectLabel: string, date: string): string {
  switch (template) {
    case 'daily_summary': return `Daily Intelligence Summary — ${date}`;
    case 'threat_assessment': return `Threat Assessment: ${subjectLabel}`;
    case 'entity_profile': return `Entity Profile: ${subjectLabel}`;
  }
}

function subjectLabelOf(template: BriefTemplate, subject: BriefSubject, entity: { id: string; name: string } | null): string {
  if (entity) return entity.name;
  if (subject.topic?.trim()) return subject.topic.trim();
  return template === 'daily_summary' ? 'Meridian Reach, scenario window' : 'Concord forces and convoys';
}

// ---- Step B: structure ---------------------------------------------------------------

const STRUCTURE_SYSTEM = `You convert an intelligence analyst's written answer into a structured brief. The material is from a fictional EXERCISE scenario (Meridian Reach).

Return ONLY one JSON object, no prose and no code fence, with exactly this shape:
{
  "bluf": string,                       // Bottom Line Up Front, at most ${BLUF_MAX_WORDS} words
  "key_judgments": [{ "statement": string, "confidence": "low"|"moderate"|"high", "estimative": string }],   // estimative = the probability phrase used (e.g. "likely", "almost certainly") and why
  "evidence": [{ "point": string, "citations": ["R-0042"] }],   // one factual point per item, each with the report numbers that support it
  "indicators_and_warnings": [string],  // optional: what to watch for
  "intelligence_gaps": [string],
  "assumptions": [string],
  "entities_of_interest": [{ "id": string, "name": string }]   // only ids that appear in the analysis
}

Rules:
- Use only what the analysis says. Do not add facts, names, or report numbers that are not in it.
- Cite only report numbers from the ALLOWED list given with the analysis; any other number will be removed.
- Keep the analyst's confidence and estimative language; do not upgrade a judgment.
- Separate evidence (what the reports say) from judgments (the analyst's assessment).`;

function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

async function completeText(provider: ChatProvider, messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  let text = '';
  for await (const ev of provider.complete({ messages, tools: [], temperature: 0.2, signal })) {
    if (ev.type === 'text') text += ev.delta;
  }
  return text;
}

async function structure(
  provider: ChatProvider, analysis: string, meta: { template: BriefTemplate; subject: string; allowed: string[] }, signal?: AbortSignal,
): Promise<BriefContent> {
  const user = [
    `Brief template: ${TEMPLATE_LABEL[meta.template]}`,
    `Subject: ${meta.subject}`,
    `ALLOWED report numbers: ${meta.allowed.length ? meta.allowed.join(', ') : '(none — leave citations empty)'}`,
    '',
    'Analysis:',
    analysis,
  ].join('\n');
  const messages: ChatMessage[] = [
    { role: 'system', content: STRUCTURE_SYSTEM },
    { role: 'user', content: user },
  ];

  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await completeText(provider, messages, signal);
    const raw = firstJsonObject(text);
    let parsed: unknown;
    try {
      if (raw === null) throw new Error('no JSON object in the response');
      parsed = JSON.parse(raw);
    } catch (e) {
      lastError = `Response was not a JSON object: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (parsed !== undefined) {
      const r = BriefContentSchema.safeParse(parsed);
      if (r.success) return r.data;
      lastError = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    }
    messages.push({ role: 'assistant', content: text });
    messages.push({ role: 'user', content: `That response did not validate: ${lastError}. Return the corrected JSON object only.` });
  }
  throw new Error(`Brief structuring failed after 2 attempts: ${lastError}`);
}

// ---- citation enforcement ----------------------------------------------------------

/** Removes every [R-xxxx] chip not in `allowed` from a text field. */
function stripCitationsInText(text: string, allowed: Set<string>, stripped: Set<string>): string {
  return text
    .replace(CITATION_RE, (whole, n: string) => {
      if (allowed.has(n)) return whole;
      stripped.add(n);
      return '';
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;:])/g, '$1')
    .trim();
}

/** Enforces the citation rule on a validated content object. Pure. */
export function enforceCitations(content: BriefContent, allowed: Set<string>): { content: BriefContent; citations: string[]; stripped: string[] } {
  const stripped = new Set<string>();
  const used = new Set<string>();
  const txt = (s: string) => stripCitationsInText(s, allowed, stripped);
  const out: BriefContent = {
    bluf: txt(content.bluf),
    key_judgments: content.key_judgments.map((j) => ({ ...j, statement: txt(j.statement), estimative: txt(j.estimative) })),
    evidence: content.evidence.map((e) => {
      const citations = e.citations.filter((n) => {
        if (allowed.has(n)) { used.add(n); return true; }
        stripped.add(n);
        return false;
      });
      return { point: txt(e.point), citations };
    }),
    indicators_and_warnings: content.indicators_and_warnings?.map(txt),
    intelligence_gaps: content.intelligence_gaps.map(txt),
    assumptions: content.assumptions.map(txt),
    entities_of_interest: content.entities_of_interest,
  };
  for (const s of [out.bluf, ...out.key_judgments.flatMap((j) => [j.statement, j.estimative]), ...out.evidence.map((e) => e.point), ...(out.indicators_and_warnings ?? []), ...out.intelligence_gaps, ...out.assumptions]) {
    for (const m of s.matchAll(CITATION_RE)) used.add(m[1]);
  }
  const sortNums = (xs: Iterable<string>) => [...xs].sort();
  return { content: out, citations: sortNums(used), stripped: sortNums(stripped) };
}

// ---- Step C: render ----------------------------------------------------------------

export const BRIEF_MARKING = 'EXERCISE – FICTIONAL DATA';

const bullets = (xs: string[], empty = 'None identified.') => (xs.length ? xs.map((x) => `- ${x}`) : [`- ${empty}`]);

/** Deterministic markdown for a brief. Pure: same content + meta → same string. */
export function renderBriefMarkdown(content: BriefContent, meta: BriefMeta): string {
  const lines: string[] = [
    `# ${meta.title}`,
    `**${BRIEF_MARKING}**`,
    '',
    `Template: ${TEMPLATE_LABEL[meta.template]} · Date: ${meta.date} · Subject: ${meta.subject}`,
    '',
    '## Bottom Line Up Front',
    content.bluf,
    '',
    '## Key Judgments',
    ...content.key_judgments.map((j, i) =>
      `${i + 1}. **[${j.confidence.toUpperCase()}]** ${j.statement}${j.estimative ? ` — ${j.estimative}` : ''}`),
    '',
    '## Evidence',
    ...content.evidence.map((e) => `- ${e.point}${e.citations.length ? ` ${e.citations.map((c) => `[${c}]`).join(' ')}` : ''}`),
    '',
  ];
  if (content.indicators_and_warnings?.length) {
    lines.push('## Indicators and Warnings', ...bullets(content.indicators_and_warnings), '');
  }
  lines.push(
    '## Intelligence Gaps', ...bullets(content.intelligence_gaps), '',
    '## Assumptions', ...bullets(content.assumptions, 'None stated.'), '',
    '## Entities of Interest', ...bullets(content.entities_of_interest.map((e) => `${e.name} (\`${e.id}\`)`)), '',
  );
  return lines.join('\n');
}

// ---- the pipeline -----------------------------------------------------------------

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function draftBrief(opts: DraftBriefOptions): Promise<DraftBriefResult> {
  const { db, provider, template, signal } = opts;
  const subject = opts.subject ?? {};
  const emit = opts.emit ?? (() => {});
  const date = opts.date ?? new Date().toISOString().slice(0, 10);

  let entity: { id: string; name: string } | null = null;
  if (subject.entityId) {
    const [head] = await entityHeadsByIds(db, [subject.entityId]);
    if (!head) throw new Error(`entity_not_found: ${subject.entityId}`);
    entity = { id: head.id, name: head.name };
  }
  if (template === 'entity_profile' && !entity) throw new Error('entity_profile requires subject.entityId');
  const subjectLabel = subjectLabelOf(template, subject, entity);

  // ---- Step A: evidence -----------------------------------------------------------
  let analysis: string;
  let allowedList: string[];
  let steps = 0;
  const strippedA = new Set<string>();

  if (opts.seedAnswer) {
    const claimed = [...new Set(opts.seedAnswer.citations.map((c) => c.toUpperCase()))];
    const existing = await existingReportNumbers(db, claimed);
    allowedList = claimed.filter((n) => existing.has(n));
    analysis = stripCitationsInText(opts.seedAnswer.text, new Set(allowedList), strippedA);
  } else {
    const question = templateQuestion(template, subject, entity);
    const run = await runAgent({
      // The structuring call still has to fit in the same request, so the evidence run gets less than the chat's budget.
      db, provider, question, signal, emit, budgetMs: BRIEF_AGENT_BUDGET_MS,
      selection: entity ? { kind: 'entity', id: entity.id, name: entity.name } : null,
    });
    if (run.error) throw new Error(run.error);
    if (!run.answer) throw new Error('The analyst returned no answer to structure.');
    steps = run.steps;
    // Every report number a tool returned in this run, intersected with the DB —
    // the same rule the agent applies to its own answer.
    const seen = new Set<string>();
    for (const m of run.messages) {
      if (m.role !== 'tool') continue;
      for (const hit of m.content.matchAll(REPORT_NUMBER_RE)) seen.add(hit[0].toUpperCase());
    }
    const existing = await existingReportNumbers(db, [...seen]);
    allowedList = [...seen].filter((n) => existing.has(n)).sort();
    for (const n of run.citations.invalid) strippedA.add(n);
    analysis = stripCitationsInText(run.answer, new Set(allowedList), strippedA);
  }

  // ---- Step B: structure ----------------------------------------------------------
  const step = steps + 1;
  const label = 'Structuring the brief';
  emit({ type: 'trace', step, tool: 'structure_brief', label, args: { template }, status: 'start' });
  const t0 = Date.now();
  let raw: BriefContent;
  try {
    raw = await structure(provider, analysis, { template, subject: subjectLabel, allowed: allowedList }, signal);
  } catch (e) {
    emit({ type: 'trace', step, tool: 'structure_brief', label, args: { template }, status: 'error', ms: Date.now() - t0, summary: errMsg(e) });
    throw e;
  }
  const enforced = enforceCitations(raw, new Set(allowedList));
  emit({
    type: 'trace', step, tool: 'structure_brief', label, args: { template }, status: 'ok', ms: Date.now() - t0,
    summary: `${enforced.content.key_judgments.length} judgments, ${enforced.content.evidence.length} evidence points`,
  });

  // ---- Step C: render -------------------------------------------------------------
  const title = briefTitle(template, subjectLabel, date);
  const markdown = renderBriefMarkdown(enforced.content, { title, template, date, subject: subjectLabel });
  const strippedCitations = [...new Set([...strippedA, ...enforced.stripped])].sort();
  emit({ type: 'citations', valid: enforced.citations, invalid: strippedCitations });

  return {
    title,
    content: enforced.content,
    markdown,
    citations: enforced.citations,
    strippedCitations,
    steps,
    model: provider.model,
    subjectEntity: entity,
    subjectLabel,
    analysis,
  };
}

// ---- print rendering (markdown subset → HTML) ----------------------------------------

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const INVALID_CITE_TITLE = "not among this brief's validated citations";

function inline(md: string, validCitations?: Set<string>): string {
  let s = escapeHtml(md);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[(R-\d{4})\]/g, (_, n: string) =>
    validCitations && !validCitations.has(n)
      ? `<span class="cite invalid" title="${INVALID_CITE_TITLE}">${n}</span>`
      : `<span class="cite">${n}</span>`);
  return s;
}

/**
 * Renders the markdown subset renderBriefMarkdown emits (plus what an analyst
 * is likely to type): #/## headings, -/* bullets, numbered lists, paragraphs,
 * **bold**, *em*, `code`, and [R-xxxx] citation chips. Everything is escaped
 * first, so pasted HTML never reaches the print page as markup. When
 * `validCitations` is given, a chip whose number is not in it gets
 * `class="cite invalid"` and a title saying so (print.css styles it).
 */
export function briefMarkdownToHtml(markdown: string, validCitations?: Set<string>): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  const inl = (md: string) => inline(md, validCitations);
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inl).join('<br>')}</p>`); para = []; } };

  for (const rawLine of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) { flushPara(); closeList(); continue; }
    if (heading) {
      flushPara(); closeList();
      const level = Math.min(heading[1].length, 6);
      out.push(`<h${level}>${inl(heading[2])}</h${level}>`);
    } else if (bullet || numbered) {
      flushPara();
      const kind: 'ul' | 'ol' = bullet ? 'ul' : 'ol';
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inl((bullet ?? numbered)![1])}</li>`);
    } else {
      closeList();
      para.push(line);
    }
  }
  flushPara(); closeList();
  return out.join('\n');
}
