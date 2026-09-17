import { describe, it, expect } from 'vitest';
import {
  renderBriefMarkdown, briefMarkdownToHtml, enforceCitations, BriefContentSchema, briefTitle, templateQuestion,
  type BriefContent,
} from '@/lib/ai/brief';

const content: BriefContent = {
  bluf: 'Ilsa Varro is likely LANTERN, passing Concord convoy schedules to the Ashen Cartel via Brightwater Holdings. Moderate confidence.',
  key_judgments: [
    { statement: 'Varro is LANTERN.', confidence: 'moderate', estimative: 'likely — one HUMINT source, corroborated by a payment' },
    { statement: 'The Hegemony is the end customer.', confidence: 'low', estimative: 'roughly even chance' },
  ],
  evidence: [
    { point: 'A HUMINT source names LANTERN as a Concord logistics officer.', citations: ['R-0019'] },
    { point: 'Brightwater paid an account tied to Varro.', citations: ['R-0022', 'R-0041'] },
    { point: 'No report ties the schedule leak to a specific convoy.', citations: [] },
  ],
  indicators_and_warnings: ['A new Brightwater payment inside 48h of a schedule change.'],
  intelligence_gaps: ['No direct SIGINT on Varro.'],
  assumptions: [],
  entities_of_interest: [{ id: 'per_ilsa_varro', name: 'Ilsa Varro' }, { id: 'org_brightwater', name: 'Brightwater Holdings' }],
};

const meta = { title: 'Threat Assessment: Convoy 7', template: 'threat_assessment' as const, date: '2026-09-17', subject: 'Convoy 7' };

const EXPECTED = `# Threat Assessment: Convoy 7
**EXERCISE – FICTIONAL DATA**

Template: Threat Assessment · Date: 2026-09-17 · Subject: Convoy 7

## Bottom Line Up Front
Ilsa Varro is likely LANTERN, passing Concord convoy schedules to the Ashen Cartel via Brightwater Holdings. Moderate confidence.

## Key Judgments
1. **[MODERATE]** Varro is LANTERN. — likely — one HUMINT source, corroborated by a payment
2. **[LOW]** The Hegemony is the end customer. — roughly even chance

## Evidence
- A HUMINT source names LANTERN as a Concord logistics officer. [R-0019]
- Brightwater paid an account tied to Varro. [R-0022] [R-0041]
- No report ties the schedule leak to a specific convoy.

## Indicators and Warnings
- A new Brightwater payment inside 48h of a schedule change.

## Intelligence Gaps
- No direct SIGINT on Varro.

## Assumptions
- None stated.

## Entities of Interest
- Ilsa Varro (\`per_ilsa_varro\`)
- Brightwater Holdings (\`org_brightwater\`)
`;

describe('renderBriefMarkdown', () => {
  it('renders the exact, deterministic markdown for a fixed content object', () => {
    expect(renderBriefMarkdown(content, meta)).toBe(EXPECTED);
    expect(renderBriefMarkdown(content, meta)).toBe(renderBriefMarkdown(structuredClone(content), { ...meta }));
  });

  it('omits Indicators and Warnings when there are none, and fills empty lists', () => {
    const md = renderBriefMarkdown({ ...content, indicators_and_warnings: undefined, intelligence_gaps: [], entities_of_interest: [] }, meta);
    expect(md).not.toContain('## Indicators and Warnings');
    expect(md).toContain('## Intelligence Gaps\n- None identified.');
    expect(md).toContain('## Entities of Interest\n- None identified.');
  });
});

describe('briefMarkdownToHtml (print subset)', () => {
  it('renders headings, lists, bold, code and citation chips, escaping everything else', () => {
    const html = briefMarkdownToHtml(EXPECTED);
    expect(html).toContain('<h1>Threat Assessment: Convoy 7</h1>');
    expect(html).toContain('<strong>EXERCISE – FICTIONAL DATA</strong>');
    expect(html).toContain('<h2>Bottom Line Up Front</h2>');
    expect(html).toContain('<ol>\n<li><strong>[MODERATE]</strong> Varro is LANTERN.');
    expect(html).toContain('<li>A HUMINT source names LANTERN as a Concord logistics officer. <span class="cite">R-0019</span></li>');
    expect(html).toContain('<span class="cite">R-0022</span> <span class="cite">R-0041</span>');
    expect(html).toContain('<code>per_ilsa_varro</code>');
    expect(html.match(/<ul>/g)).toHaveLength(5);
  });

  it('flags citations outside validCitations as invalid, and flags nothing when no set is given', () => {
    const html = briefMarkdownToHtml('- p [R-0019] [R-9999]', new Set(['R-0019']));
    expect(html).toContain('<span class="cite">R-0019</span>');
    expect(html).toContain('<span class="cite invalid" title="not among this brief\'s validated citations">R-9999</span>');
    expect(briefMarkdownToHtml('[R-9999]')).toBe('<p><span class="cite">R-9999</span></p>');
    expect(briefMarkdownToHtml('[R-9999]', new Set())).toContain('cite invalid');
  });

  it('never lets pasted HTML through', () => {
    const html = briefMarkdownToHtml('# <script>alert(1)</script>\n\nsee <b>this</b> & that [R-0001]');
    expect(html).toBe('<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>\n<p>see &lt;b&gt;this&lt;/b&gt; &amp; that <span class="cite">R-0001</span></p>');
  });
});

describe('enforceCitations', () => {
  it('keeps allowed numbers, strips the rest from arrays and text, and reports both lists', () => {
    const raw = BriefContentSchema.parse({
      bluf: 'Varro [R-0019] is LANTERN [R-9999].',
      key_judgments: [{ statement: 'x', confidence: 'high', estimative: '' }],
      evidence: [{ point: 'p', citations: ['[R-0019]', 'r-9999', 'R-0031'] }],
      intelligence_gaps: [], assumptions: [], entities_of_interest: [],
    });
    const r = enforceCitations(raw, new Set(['R-0019']));
    expect(r.content.bluf).toBe('Varro [R-0019] is LANTERN.');
    expect(r.content.evidence[0].citations).toEqual(['R-0019']);
    expect(r.citations).toEqual(['R-0019']);
    expect(r.stripped).toEqual(['R-0031', 'R-9999']);
  });
});

describe('schema, titles, questions', () => {
  it('rejects a BLUF over 80 words', () => {
    const r = BriefContentSchema.safeParse({
      bluf: Array.from({ length: 81 }, (_, i) => `w${i}`).join(' '),
      key_judgments: [{ statement: 'x', confidence: 'low' }],
      evidence: [{ point: 'p' }],
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('80 words');
  });

  it('builds titles and templated questions', () => {
    expect(briefTitle('daily_summary', 'ignored', '2026-09-17')).toBe('Daily Intelligence Summary — 2026-09-17');
    expect(briefTitle('entity_profile', 'Ilsa Varro', '2026-09-17')).toBe('Entity Profile: Ilsa Varro');
    expect(templateQuestion('threat_assessment', { topic: 'Convoy 7' }, null)).toMatch(/Scope the assessment to: Convoy 7\.$/);
    expect(templateQuestion('threat_assessment', {}, { id: 'e1', name: 'Kestrel' })).toMatch(/Kestrel \(entity id e1\)/);
    expect(templateQuestion('entity_profile', {}, { id: 'e1', name: 'Kestrel' })).toMatch(/^Produce a profile of Kestrel \(entity id e1\)/);
    expect(() => templateQuestion('entity_profile', {}, null)).toThrow(/entityId/);
    expect(templateQuestion('daily_summary', { question: 'custom?' }, null)).toBe('custom?');
  });
});
