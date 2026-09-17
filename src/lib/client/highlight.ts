/**
 * Inline entity highlighting for the report reader: splits a body into plain
 * and entity-tagged segments. Pure so it unit-tests without a DOM.
 */
export interface Term { id: string; names: string[] }
export interface Segment { text: string; entityId?: string }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function segmentBody(body: string, terms: Term[]): Segment[] {
  const byName: { name: string; id: string }[] = [];
  for (const t of terms) for (const n of t.names) if (n.trim().length >= 3) byName.push({ name: n.trim(), id: t.id });
  if (!byName.length || !body) return [{ text: body }];
  // Longest first so "Ansel Varro" wins over "Varro"; the lookup is case-insensitive.
  byName.sort((a, b) => b.name.length - a.name.length);
  const lookup = new Map(byName.map((t) => [t.name.toLowerCase(), t.id]));
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${byName.map((t) => escapeRe(t.name)).join('|')})(?![\\p{L}\\p{N}])`, 'giu');

  const out: Segment[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: body.slice(last, start) });
    out.push({ text: m[0], entityId: lookup.get(m[0].toLowerCase()) });
    last = start + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}
