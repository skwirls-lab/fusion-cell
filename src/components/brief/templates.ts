/** Client-safe template metadata (no server imports; src/lib/ai/brief.ts owns the pipeline). */
export type BriefTemplate = 'daily_summary' | 'threat_assessment' | 'entity_profile';

export const TEMPLATES: ReadonlyArray<{ id: BriefTemplate; label: string; short: string; hint: string }> = [
  { id: 'daily_summary', label: 'Daily Intelligence Summary', short: 'DAILY', hint: 'All significant activity over the scenario window, by faction.' },
  { id: 'threat_assessment', label: 'Threat Assessment', short: 'THREAT', hint: 'Threats to Concord forces and convoys; optionally scoped to a topic or entity.' },
  { id: 'entity_profile', label: 'Entity Profile', short: 'PROFILE', hint: 'Who they are, affiliations, timeline, connections, assessment.' },
];

export const TEMPLATE_LABEL: Record<BriefTemplate, string> = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.label])) as Record<BriefTemplate, string>;
export const TEMPLATE_SHORT: Record<BriefTemplate, string> = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.short])) as Record<BriefTemplate, string>;
