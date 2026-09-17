/**
 * Commit a reviewed ingest job (BUILD.md P6.4): the report, the approved
 * entities / relationships / events, their provenance rows, and the job's
 * status flip — all in ONE transaction, so a half-applied review can never
 * exist. Anything that cannot be resolved (a relationship end that was
 * discarded, an event with no locatable place) is skipped with a reason the
 * UI shows, never silently dropped.
 */
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Db } from '../db';
import { entities, relationships, reports, events, reportLinks, eventEntities, ingestJobs, type Entity as EntityRow } from '../db/schema';
import { parseJobExtraction } from './jobs';
import { IngestDecisions, EVIDENCE_MAX, type CommitResult, type IngestDecisions as DecisionsInput } from './types';

export type CommitErrorCode = 'not_found' | 'no_extraction' | 'already_committed' | 'discarded' | 'bad_decision';

export class CommitError extends Error {
  constructor(public readonly code: CommitErrorCode, message: string) {
    super(message);
    this.name = 'CommitError';
  }
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Located = Pick<EntityRow, 'id' | 'name' | 'factionId' | 'lon' | 'lat'>;

const hex = (bytes: number) => randomBytes(bytes).toString('hex');
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const slug = (s: string) => norm(s).replace(/\s+/g, '_').slice(0, 24).replace(/_+$/, '') || 'entity';
const clip = (s: string, n = EVIDENCE_MAX) => (s.length > n ? s.slice(0, n) : s);

export const REPORT_NUMBER_WIDTH = 4;

/** max existing R-#### + 1, zero-padded. Runs inside the commit transaction. */
export async function nextReportNumber(tx: Tx): Promise<string> {
  const [{ max }] = await tx
    .select({ max: sql<number | null>`max(nullif(regexp_replace(${reports.reportNumber}, '\\D', '', 'g'), '')::int)` })
    .from(reports);
  return `R-${String((max ?? 0) + 1).padStart(REPORT_NUMBER_WIDTH, '0')}`;
}

export async function commitIngest(db: Db, jobId: string, decisionsIn: DecisionsInput): Promise<CommitResult> {
  const decisions = IngestDecisions.parse(decisionsIn);

  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(ingestJobs).where(eq(ingestJobs.id, jobId)).limit(1);
    if (!job) throw new CommitError('not_found', `ingest job ${jobId} does not exist`);
    if (job.status === 'committed') throw new CommitError('already_committed', `job ${jobId} was already committed as ${job.reportId ?? '?'}`);
    if (job.status === 'discarded') throw new CommitError('discarded', `job ${jobId} was discarded`);
    const x = parseJobExtraction(job.extraction)?.extraction;
    if (!x) throw new CommitError('no_extraction', `job ${jobId} has no successful extraction to commit`);

    const skipped: string[] = [];
    const now = new Date();

    // ---- report ---------------------------------------------------------------------
    const reportNumber = await nextReportNumber(tx);
    await tx.insert(reports).values({
      id: reportNumber,
      reportNumber,
      type: job.reportType,
      title: decisions.title ?? x.title,
      body: job.rawText,
      sourceReliability: x.source_reliability ?? 'C',
      infoCredibility: x.info_credibility ?? 3,
      reportedAt: now,
      eventAt: x.event_at ? new Date(x.event_at) : null,
    });

    // ---- entities -------------------------------------------------------------------
    const nameToId = new Map<string, string>();
    const byId = new Map<string, Located>();
    const register = (names: string[], id: string) => { for (const n of names) { const k = norm(n); if (k && !nameToId.has(k)) nameToId.set(k, id); } };
    const created: CommitResult['created'] = { entities: [], relationships: [], events: [] };
    const linked: CommitResult['linked'] = [];
    const entityDecision = new Map(decisions.entities.map((d) => [d.index, d]));

    for (let i = 0; i < x.entities.length; i++) {
      const ext = x.entities[i];
      const d = entityDecision.get(i);
      if (!d) { skipped.push(`entity "${ext.name}": no decision recorded, treated as discard`); continue; }
      if (d.action === 'discard') continue;

      if (d.action === 'link') {
        if (!d.entityId) throw new CommitError('bad_decision', `entity #${i} "${ext.name}": link requires entityId`);
        const [row] = await tx.select().from(entities).where(eq(entities.id, d.entityId)).limit(1);
        if (!row) throw new CommitError('bad_decision', `entity #${i} "${ext.name}": ${d.entityId} does not exist`);
        register([ext.name, ...ext.aliases, row.name, ...row.aliases], row.id);
        byId.set(row.id, row);
        linked.push({ id: row.id, name: row.name });
        continue;
      }

      const name = d.overrides?.name ?? ext.name;
      const type = d.overrides?.type ?? ext.type;
      const aliases = [...new Set((d.overrides?.aliases ?? ext.aliases).filter((a) => norm(a) !== norm(name)))];
      let id = `ent_${slug(name)}_${hex(2)}`;
      // Two random bytes: a collision is unlikely but cheap to check inside the transaction.
      while ((await tx.select({ id: entities.id }).from(entities).where(eq(entities.id, id)).limit(1)).length) id = `ent_${slug(name)}_${hex(2)}`;
      const isLocation = type === 'location';
      const [row] = await tx.insert(entities).values({
        id,
        type,
        name,
        aliases,
        description: d.overrides?.description ?? ext.description,
        confidence: ext.confidence,
        lon: isLocation && ext.lon !== undefined ? ext.lon : null,
        lat: isLocation && ext.lat !== undefined ? ext.lat : null,
        attributes: { ingested: true, source_report: reportNumber },
      }).returning();
      register([name, ...aliases, ext.name, ...ext.aliases], row.id);
      byId.set(row.id, row);
      created.entities.push({ id: row.id, name: row.name });
    }

    const resolve = (name: string | null | undefined) => (name ? nameToId.get(norm(name)) : undefined);
    const evidenceFor = new Map<string, string>(); // entityId -> first supporting quote

    // ---- relationships ------------------------------------------------------------
    for (const d of decisions.relationships) {
      if (d.action !== 'create') continue;
      const ext = x.relationships[d.index];
      if (!ext) { skipped.push(`relationship #${d.index}: not in the extraction`); continue; }
      const s = resolve(ext.source_name);
      const t = resolve(ext.target_name);
      if (!s || !t) {
        const missing = !s ? ext.source_name : ext.target_name;
        skipped.push(`relationship ${ext.source_name} → ${ext.target_name} (${ext.type}): "${missing}" was neither linked nor created`);
        continue;
      }
      if (s === t) { skipped.push(`relationship ${ext.source_name} → ${ext.target_name}: both ends resolve to ${s}`); continue; }
      const id = `rel_${hex(4)}`;
      await tx.insert(relationships).values({
        id, sourceEntityId: s, targetEntityId: t, type: ext.type, confidence: ext.confidence,
        attributes: { ingested: true, evidence: ext.evidence },
      });
      created.relationships.push(id);
      if (!evidenceFor.has(s)) evidenceFor.set(s, ext.evidence);
      if (!evidenceFor.has(t)) evidenceFor.set(t, ext.evidence);
      await tx.insert(reportLinks).values({ reportId: reportNumber, objectType: 'relationship', objectId: id, excerpt: clip(ext.evidence) });
    }

    // ---- events ---------------------------------------------------------------------
    for (const d of decisions.events) {
      if (d.action !== 'create') continue;
      const ext = x.events[d.index];
      if (!ext) { skipped.push(`event #${d.index}: not in the extraction`); continue; }
      const participants = [...new Set(ext.participant_names.map(resolve).filter((v): v is string => !!v))];

      // Where: the named location if it has coordinates, else the first place a participant is located_at.
      let place: Located | null = null;
      const locId = resolve(ext.location_name);
      if (locId) {
        const loc = byId.get(locId);
        if (loc && loc.lon !== null && loc.lat !== null) place = loc;
      }
      if (!place && participants.length) {
        const [hit] = await tx
          .select({ id: entities.id, name: entities.name, factionId: entities.factionId, lon: entities.lon, lat: entities.lat })
          .from(relationships)
          .innerJoin(entities, eq(entities.id, relationships.targetEntityId))
          .where(and(inArray(relationships.sourceEntityId, participants), eq(relationships.type, 'located_at'), isNotNull(entities.lon), isNotNull(entities.lat)))
          .limit(1);
        if (hit) place = hit;
      }
      if (!place || place.lon === null || place.lat === null) {
        const why = ext.location_name
          ? (locId ? `"${ext.location_name}" has no coordinates` : `"${ext.location_name}" was neither linked nor created`)
          : 'no location named';
        skipped.push(`event "${ext.title}": cannot be placed on the map — ${why}${participants.length ? ' and no participant has a located_at place' : ''}`);
        continue;
      }

      const occurredAt = new Date(ext.occurred_at ?? x.event_at ?? now.toISOString());
      const factionId = place.factionId ?? byId.get(participants[0] ?? '')?.factionId ?? null;
      const id = `evt_${hex(4)}`;
      await tx.insert(events).values({
        id, type: ext.type, title: ext.title, description: ext.description, lon: place.lon, lat: place.lat,
        occurredAt, confidence: ext.confidence, factionId,
      });
      const roles = participants.map((entityId) => ({ eventId: id, entityId, role: 'participant' }));
      if (locId && !participants.includes(locId)) roles.push({ eventId: id, entityId: locId, role: 'location' });
      if (roles.length) await tx.insert(eventEntities).values(roles);
      await tx.insert(reportLinks).values({ reportId: reportNumber, objectType: 'event', objectId: id, excerpt: clip(ext.description || ext.title) });
      created.events.push(id);
    }

    // ---- entity provenance ------------------------------------------------------------
    const entityLinks = [...byId.keys()].map((entityId) => ({
      reportId: reportNumber,
      objectType: 'entity' as const,
      objectId: entityId,
      excerpt: clip(evidenceFor.get(entityId) ?? x.entities.find((e) => resolve(e.name) === entityId)?.description ?? ''),
    }));
    if (entityLinks.length) await tx.insert(reportLinks).values(entityLinks);

    await tx.update(ingestJobs).set({ status: 'committed', reportId: reportNumber }).where(eq(ingestJobs.id, jobId));

    return { reportNumber, reportId: reportNumber, created, linked, skipped };
  });
}
