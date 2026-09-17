/**
 * Deterministic seed generator. Canon (scripts/seed/canon.ts) is copied
 * through untouched; everything else is templated noise from a seeded PRNG,
 * so the same code always yields the same dataset and reseeding is repeatable.
 *
 * No LLM is involved. The clue chain is hand-written; noise only needs to be
 * plausible and genuinely irrelevant, which templates do better than a model
 * (a model drifts toward making noise "interesting", i.e. implicating someone).
 */
import fs from 'node:fs';
import path from 'node:path';
import * as C from './seed/canon';

// ---- PRNG ------------------------------------------------------------------
function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(20260801);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// ---- Output shapes (match src/lib/db/schema.ts columns) -----------------------
interface EntityRow { id: string; type: string; name: string; aliases: string[]; factionId: string | null; description: string; attributes: Record<string, unknown>; confidence: number; lon: number | null; lat: number | null; locationKind: string | null }
interface RelRow { id: string; sourceEntityId: string; targetEntityId: string; type: string; startAt: string | null; endAt: string | null; confidence: number; attributes: Record<string, unknown> }
interface ReportRow { id: string; reportNumber: string; type: string; title: string; body: string; sourceReliability: string; infoCredibility: number; reportedAt: string; eventAt: string | null; marking: string }
interface EventRow { id: string; type: string; title: string; description: string; lon: number; lat: number; occurredAt: string; confidence: number; factionId: string | null }
interface LinkRow { reportId: string; objectType: 'entity' | 'relationship' | 'event'; objectId: string; excerpt: string }
interface EventEntityRow { eventId: string; entityId: string; role: string }

const entities: EntityRow[] = [];
const relationships: RelRow[] = [];
const reports: ReportRow[] = [];
const events: EventRow[] = [];
const links: LinkRow[] = [];
const eventEntities: EventEntityRow[] = [];
const locById = new Map<string, C.LocationInput>();

// ---- 1. Canon ------------------------------------------------------------------
for (const l of C.locations) {
  locById.set(l.id, l);
  entities.push({ id: l.id, type: 'location', name: l.name, aliases: l.aliases ?? [], factionId: l.factionId, description: l.description, attributes: {}, confidence: 1, lon: l.lon, lat: l.lat, locationKind: l.kind });
}
// Lanes: attach from/to to lane-kind locations so the map can draw lines.
const laneByName = new Map(C.locations.filter((l) => l.kind === 'lane').map((l) => [l.name, l]));
for (const lane of C.lanes) {
  const existing = laneByName.get(lane.name);
  const a = locById.get(lane.from)!, b = locById.get(lane.to)!;
  if (existing) {
    entities.find((e) => e.id === existing.id)!.attributes = { from: lane.from, to: lane.to };
  } else {
    entities.push({ id: `loc_${lane.id}`, type: 'location', name: lane.name, aliases: [], factionId: null, description: `Shipping lane ${a.name} – ${b.name}.`, attributes: { from: lane.from, to: lane.to }, confidence: 1, lon: (a.lon + b.lon) / 2, lat: (a.lat + b.lat) / 2, locationKind: 'lane' });
  }
}
for (const e of C.entities) entities.push({ id: e.id, type: e.type, name: e.name, aliases: e.aliases ?? [], factionId: e.factionId, description: e.description, attributes: e.attributes ?? {}, confidence: e.confidence ?? 0.7, lon: null, lat: null, locationKind: null });
for (const r of C.relationships) relationships.push({ id: r.id, sourceEntityId: r.source, targetEntityId: r.target, type: r.type, startAt: r.startAt ?? null, endAt: r.endAt ?? null, confidence: r.confidence, attributes: r.attributes ?? {} });
for (const ev of C.events) {
  const l = locById.get(ev.locationId)!;
  events.push({ id: ev.id, type: ev.type, title: ev.title, description: ev.description, lon: l.lon, lat: l.lat, occurredAt: ev.occurredAt, confidence: ev.confidence, factionId: ev.factionId });
  for (const eid of ev.entityIds) eventEntities.push({ eventId: ev.id, entityId: eid, role: 'participant' });
}
for (const r of C.canonReports) {
  reports.push({ id: r.id, reportNumber: r.id, type: r.type, title: r.title, body: r.body, sourceReliability: r.sourceReliability, infoCredibility: r.infoCredibility, reportedAt: r.reportedAt, eventAt: r.eventAt ?? null, marking: C.MARKING });
  for (const l of r.links) links.push({ reportId: r.id, objectType: l.type, objectId: l.id, excerpt: l.excerpt ?? '' });
}
// Canon relationships carry their own provenance list; materialise as links.
for (const r of C.relationships) for (const rep of r.reports) {
  if (!links.some((l) => l.reportId === rep && l.objectType === 'relationship' && l.objectId === r.id)) links.push({ reportId: rep, objectType: 'relationship', objectId: r.id, excerpt: r.excerpt ?? '' });
}
for (const ev of C.events) for (const rep of ev.reports) {
  if (!links.some((l) => l.reportId === rep && l.objectType === 'event' && l.objectId === ev.id)) links.push({ reportId: rep, objectType: 'event', objectId: ev.id, excerpt: '' });
}

// ---- 2. Noise entities -----------------------------------------------------------
const FIRST = ['Mara', 'Tobin', 'Ysolde', 'Corwin', 'Hesper', 'Dagny', 'Rurik', 'Imani', 'Oskar', 'Wren', 'Baltasar', 'Nell', 'Fyodor', 'Adaeze', 'Lucan', 'Tamsin', 'Piet', 'Sunniva', 'Ezio', 'Halima', 'Jorun', 'Cassius', 'Ottilie', 'Sven', 'Rhea', 'Mattias', 'Zora', 'Kenji', 'Brigid', 'Anselm'];
const LAST = ['Okafor', 'Drummond', 'Hale', 'Vasquez', 'Thorne', 'Ashby', 'Meret', 'Kowalczyk', 'Sato', 'Bramble', 'Oduya', 'Ferrante', 'Lindgren', 'Achebe', 'Marlow', 'Petrov', 'Quinlan', 'Rossi', 'Haldane', 'Ibarra', 'Novak', 'Sinclair', 'Tanaka', 'Voss', 'Whitlock', 'Yilmaz', 'Zelenko', 'Farrow', 'Greaves', 'Holm'];
const ORG_A = ['Amber', 'Fenwick', 'Harrow', 'Solace', 'Orrin', 'Sable', 'Vellum', 'Halcyon', 'Corran', 'Pale', 'Northwatch', 'Meridian'];
const ORG_B = ['Freight', 'Salvage', 'Provisioners', 'Trading House', 'Shipping', 'Co-operative', 'Guild', 'Charter', 'Outfitters', 'Exchange'];
const VESSEL_NAMES = ['Kittiwake', 'Sandpiper', 'Marram', 'Bittern', 'Thistledown', 'Grey Heron', 'Cormorant', 'Bramblefinch', 'Dunlin', 'Saltmarsh', 'Plover', 'Wheatear', 'Skylark', 'Tern Rock', 'Stonechat', 'Curlew', 'Lapwing', 'Redshank', 'Whimbrel', 'Godwit', 'Knot', 'Turnstone', 'Kelp Runner', 'Ashfall', 'Nightjar'];
const CONCORD_UNITS = ['Escort Squadron 4', 'Hollins Depot Quartermaster', 'Ashford Signals Detachment'];
const HEGEMONY_UNITS = ['Vantor Picket Flotilla', 'Dusk Gate Customs Directorate', 'Ironmark Yard Command'];
const CARTEL_CREWS = ['Reef Runners', 'Notch Crew', 'Cinder Moon Refinery Syndicate'];

const region: Record<string, string[]> = {
  concord: ['loc_meridian_station', 'loc_hollins_depot', 'loc_port_amberly', 'loc_caldera_yards', 'loc_ashford_relay', 'loc_tarns_landing', 'loc_sable_reach', 'loc_vellum_moon', 'loc_wyre_station', 'loc_northwatch_beacon'],
  kestrel: ['loc_kestrel', 'loc_kestrel_low_docks', 'loc_kestrel_high_docks', 'loc_tallow_row', 'loc_kestrel_prime'],
  hegemony: ['loc_vantor_bastion', 'loc_dusk_gate', 'loc_ironmark_yards', 'loc_kessarine', 'loc_ruun_anchorage', 'loc_vantor_core'],
  cartel: ['loc_ashen_hollow', 'loc_gallows_reef', 'loc_cinder_moon', 'loc_smugglers_notch'],
  unaffiliated: ['loc_pilgrims_rest', 'loc_solace', 'loc_mirren_drift', 'loc_halcyon_belt', 'loc_orrin_shoals', 'loc_fenwick_crossing'],
};
const anyLoc = () => pick(C.locations.filter((l) => l.kind !== 'lane')).id;
const homeFor = (f: string) => pick(region[f]);
const nameLoc = (id: string) => entities.find((e) => e.id === id)!.name;

let seq = 0;
const nid = (p: string) => `${p}_n${String(++seq).padStart(3, '0')}`;

const noiseOrgs: EntityRow[] = [];
const noisePeople: EntityRow[] = [];
const noiseVessels: EntityRow[] = [];
const noiseAccounts: EntityRow[] = [];

const orgSpecs: Array<[string, string, string]> = [
  ...CONCORD_UNITS.map((n) => ['concord', n, 'Concord Reach Fleet formation.'] as [string, string, string]),
  ...HEGEMONY_UNITS.map((n) => ['hegemony', n, 'Vantor Hegemony formation.'] as [string, string, string]),
  ...CARTEL_CREWS.map((n) => ['cartel', n, 'Ashen Cartel crew.'] as [string, string, string]),
  ['kestrel', 'Kestrel Merchants Guild', 'Trade association for Free Port merchants.'],
  ['unaffiliated', 'Order of the Quiet Lamp', "Pilgrim order based at Solace and Pilgrim's Rest."],
  ['unaffiliated', 'Halcyon Prospectors Co-operative', 'Independent belt miners.'],
];
for (let i = 0; i < 5; i++) orgSpecs.push([pick(['kestrel', 'unaffiliated', 'concord']), `${pick(ORG_A)} ${pick(ORG_B)}`, 'Commercial freight and trading concern.']);
for (const [f, name, desc] of orgSpecs) {
  const o: EntityRow = { id: nid('org'), type: 'organization', name, aliases: [], factionId: f, description: desc, attributes: {}, confidence: 0.9, lon: null, lat: null, locationKind: null };
  noiseOrgs.push(o); entities.push(o);
}
const peopleFaction = ['concord', 'concord', 'concord', 'concord', 'concord', 'concord', 'kestrel', 'kestrel', 'kestrel', 'kestrel', 'kestrel', 'kestrel', 'kestrel', 'cartel', 'cartel', 'cartel', 'cartel', 'hegemony', 'hegemony', 'hegemony', 'hegemony', 'unaffiliated', 'unaffiliated', 'unaffiliated', 'unaffiliated', 'unaffiliated'];
const ROLE: Record<string, string[]> = {
  concord: ['Lieutenant, navigation', 'Chief Petty Officer, stores', 'Ensign, signals', 'Lieutenant Commander, escort operations', 'Commander, depot administration', 'Warrant Officer, drone maintenance'],
  kestrel: ['dock supervisor', 'customs clerk', 'merchant captain', 'berth agent', 'tea house proprietor', 'salvage appraiser', 'guild secretary'],
  cartel: ['runner', 'refinery foreman', 'reef pilot', 'fence'],
  hegemony: ['picket officer', 'customs director', 'yard engineer', 'flotilla adjutant'],
  unaffiliated: ['pilgrim elder', 'prospector', 'freelance surveyor', 'medic', 'itinerant trader'],
};
const usedNames = new Set<string>();
for (const f of peopleFaction) {
  let name = ''; do { name = `${pick(FIRST)} ${pick(LAST)}`; } while (usedNames.has(name)); usedNames.add(name);
  const role = pick(ROLE[f]);
  const p: EntityRow = { id: nid('per'), type: 'person', name, aliases: [], factionId: f, description: `${role[0].toUpperCase() + role.slice(1)}.`, attributes: { role }, confidence: 0.85, lon: null, lat: null, locationKind: null };
  noisePeople.push(p); entities.push(p);
}
const vesselFaction = ['kestrel', 'kestrel', 'kestrel', 'kestrel', 'kestrel', 'kestrel', 'unaffiliated', 'unaffiliated', 'unaffiliated', 'unaffiliated', 'unaffiliated', 'concord', 'concord', 'concord', 'concord', 'hegemony', 'hegemony', 'hegemony', 'cartel', 'cartel', 'cartel', 'cartel'];
const PREFIX: Record<string, string> = { kestrel: 'CV', unaffiliated: 'MV', concord: 'CNS', hegemony: 'VHS', cartel: 'MV' };
const vesselNames = shuffle(VESSEL_NAMES);
for (const f of vesselFaction) {
  const base = vesselNames.pop()!;
  const v: EntityRow = { id: nid('ves'), type: 'vessel', name: `${PREFIX[f]} ${base}`, aliases: [base], factionId: f, description: f === 'concord' ? 'Concord Reach Fleet hull.' : f === 'hegemony' ? 'Hegemony hull.' : 'Merchant hull.', attributes: { class: f === 'concord' || f === 'hegemony' ? pick(['frigate', 'corvette', 'tender']) : pick(['light freighter', 'bulk hauler', 'salvage tug', 'passenger packet']) }, confidence: 0.9, lon: null, lat: null, locationKind: null };
  noiseVessels.push(v); entities.push(v);
}
for (let i = 0; i < 8; i++) {
  const owner = pick(noiseOrgs);
  const a: EntityRow = { id: nid('acc'), type: 'account', name: `ACC-${pick(['KMB', 'CRB', 'VBK'])}-${int(1000, 9999)}`, aliases: [], factionId: owner.factionId, description: `${owner.name} account.`, attributes: { holder: owner.name }, confidence: 1, lon: null, lat: null, locationKind: null };
  noiseAccounts.push(a); entities.push(a);
}
for (const [name, desc] of [['Kessarine-pattern corvette hull', 'Hegemony raider hull type; 9th Raider Group standard.'], ['Mark IV transponder beacon', 'Standard Kestrel-registry transponder unit.'], ['Reactor assembly consignment (Wyre)', 'Convoy 7 cargo: six crated reactor assemblies.'], ['Salvage tug rig', 'Grapple-and-tow rig used at Gallows Reef.']]) {
  entities.push({ id: nid('eqp'), type: 'equipment', name, aliases: [], factionId: null, description: desc, attributes: {}, confidence: 0.9, lon: null, lat: null, locationKind: null });
}

// ---- 3. Noise reports (each one introduces the relationships/events it describes) ----
const SAFE_CANON = { kpa: 'org_kestrel_port_authority', ledger: 'org_kestrel_ledger', mmb: 'org_meridian_mutual', logcom: 'org_logcom', convoy7: 'org_convoy_7', hegemony: 'org_vantor_hegemony', cartel: 'org_ashen_cartel', adeyemi: 'per_quill_adeyemi', sandoval: 'per_lio_sandoval', morn: 'per_thessaly_morn', admiral: 'per_sera_okonkwo_vane', palisade: 'ves_palisade', harrowgate: 'ves_harrowgate', halloway: 'org_halloway', tessaly: 'loc_tessaly_gate' };
const HUMINT_SOURCES = ['TALLYMAN', 'BRACKEN', 'SEXTANT', 'MOORHEN'];
const relKey = new Map<string, RelRow>();
const seenRel = (s: string, t: string, type: string) => relKey.get(`${s}|${t}|${type}`);

interface Draft { type: ReportRow['type']; title: string; body: string; day: number; hh: number; rel: string; cred: number; entityIds: string[]; rels: Array<{ s: string; t: string; type: string; conf?: number; start?: string; excerpt?: string }>; events: Array<{ type: EventRow['type']; title: string; desc: string; locId: string; day: number; hh: number; entityIds: string[]; factionId: string | null }> }
const drafts: Draft[] = [];

const memberOrgFor = (p: EntityRow) => pick(noiseOrgs.filter((o) => o.factionId === p.factionId).concat(p.factionId === 'concord' ? [entities.find((e) => e.id === SAFE_CANON.logcom)!] : []));
const vesselOwner = new Map<string, string>();
for (const v of noiseVessels) vesselOwner.set(v.id, (v.factionId === 'concord' ? entities.find((e) => e.id === SAFE_CANON.logcom)! : v.factionId === 'hegemony' ? pick(noiseOrgs.filter((o) => o.factionId === 'hegemony')) : v.factionId === 'cartel' ? entities.find((e) => e.id === SAFE_CANON.cartel)! : pick(noiseOrgs.filter((o) => o.factionId === v.factionId || o.factionId === 'kestrel'))).id);

function tracking(day: number): Draft {
  const v = pick(noiseVessels.filter((x) => x.factionId !== 'hegemony'));
  const owner = entities.find((e) => e.id === vesselOwner.get(v.id))!;
  const cap = pick(noisePeople.filter((p) => p.factionId === v.factionId || (v.factionId === 'unaffiliated' && p.factionId === 'kestrel')));
  const route = shuffle([...region[v.factionId!], ...region.kestrel, ...region.unaffiliated]).slice(0, 3);
  const [a, b, c] = route;
  const viaTessaly = rnd() < 0.35;
  const body = `VESSEL TRACK LOG — Kestrel Port Authority feed, Concord transponder monitoring. DTG ${C.dtg(day, 12)}.
Vessel: ${v.name.toUpperCase()}, ${v.factionId === 'concord' ? 'Concord' : 'Kestrel'} registry, operator ${owner.name}, master ${cap.name.split(' ')[1].toUpperCase()}. Departed ${nameLoc(a)} ${String(day - 1).padStart(2, '0')} AUG ${int(0, 23).toString().padStart(2, '0')}00Z, declared destination ${nameLoc(c)}, cargo "${pick(['general', 'ore', 'foodstuffs', 'machine parts', 'passengers', 'medical stores'])}".
Track: ${nameLoc(b)} ${String(day).padStart(2, '0')} AUG 0${int(1, 9)}00Z${viaTessaly ? `; Tessaly Gate transit ${String(day).padStart(2, '0')} AUG 1${int(0, 9)}00Z` : ''}; arrived ${nameLoc(c)} ${String(day).padStart(2, '0')} AUG ${int(15, 23)}00Z. Transponder continuous throughout. ${pick(['No anomalies.', 'Routine docking delay of forty minutes at destination.', 'Customs inspection at destination, cleared.', 'No inspection.'])}`;
  return { type: 'TRACKING', title: `Vessel track log — ${v.name}, ${nameLoc(a)} to ${nameLoc(c)}`, body, day, hh: 12, rel: 'B', cred: 2, entityIds: [v.id, owner.id, cap.id, a, b, c, ...(viaTessaly ? [SAFE_CANON.tessaly] : [])],
    rels: [{ s: owner.id, t: v.id, type: 'owns', conf: 1 }, { s: cap.id, t: v.id, type: 'commands', conf: 0.9 }, { s: v.id, t: c, type: 'travels_to', conf: 1, start: C.day(day, 18) }, { s: v.id, t: b, type: 'travels_to', conf: 1, start: C.day(day, 4) }, ...(viaTessaly ? [{ s: v.id, t: SAFE_CANON.tessaly, type: 'travels_to', conf: 1, start: C.day(day, 12) }] : [])],
    events: [{ type: 'movement', title: `${v.name} arrives ${nameLoc(c)}`, desc: `Routine arrival from ${nameLoc(a)}.`, locId: c, day, hh: int(15, 23), entityIds: [v.id, cap.id], factionId: v.factionId }] };
}
function financial(day: number): Draft {
  const from = pick(noiseAccounts), to = pick(noiseAccounts.filter((a) => a.id !== from.id));
  const fromOrg = noiseOrgs.find((o) => o.name === from.attributes.holder)!, toOrg = noiseOrgs.find((o) => o.name === to.attributes.holder)!;
  const amt = int(3, 60) * 500;
  const memo = pick(['berth lease, quarter', 'ore consignment, lot ' + int(2, 40), 'charter — passenger packet', 'fuel and stores', 'salvage appraisal fee', 'guild dues', 'insurance premium', 'medical stores, Wyre consignment']);
  const body = `TRANSACTION RECORD — Meridian Mutual Bank, Kestrel branch, compliance extract. DTG ${C.dtg(day, 15)}. Transaction date ${String(day - int(1, 2)).padStart(2, '0')} AUG.
From: ${from.name}, holder ${fromOrg.name.toUpperCase()}. To: ${to.name}, holder ${toOrg.name.toUpperCase()}. Amount: ${amt.toLocaleString('en-US')} cr. Memo: "${memo}".
Compliance note: ${pick(['counterparties have an established commercial relationship; no flag.', 'consistent with filed manifests; no flag.', 'routine; retained for volume statistics.', 'first transaction between these accounts; both holders licensed; no flag.'])}`;
  return { type: 'FINANCIAL', title: `Transaction record — ${fromOrg.name} to ${toOrg.name}, ${amt.toLocaleString('en-US')} cr`, body, day, hh: 15, rel: 'B', cred: 2, entityIds: [from.id, to.id, fromOrg.id, toOrg.id, SAFE_CANON.mmb],
    rels: [{ s: fromOrg.id, t: from.id, type: 'owns', conf: 1 }, { s: toOrg.id, t: to.id, type: 'owns', conf: 1 }, { s: fromOrg.id, t: toOrg.id, type: 'pays', conf: 0.9, start: C.day(day - 1), excerpt: `${amt.toLocaleString('en-US')} cr, memo: ${memo}` }],
    events: [{ type: 'transaction', title: `${fromOrg.name} pays ${toOrg.name} ${amt.toLocaleString('en-US')} cr`, desc: memo, locId: 'loc_kestrel', day: day - 1, hh: 10, entityIds: [fromOrg.id, toOrg.id], factionId: fromOrg.factionId }] };
}
function humint(day: number): Draft {
  const src = pick(HUMINT_SOURCES);
  const loc = pick([...region.kestrel, 'loc_pilgrims_rest', 'loc_port_amberly', 'loc_halcyon_belt']);
  const a = pick(noisePeople), b = pick(noisePeople.filter((p) => p.id !== a.id));
  const topic = pick(['a berth dispute', 'the price of ore at the Halcyon Belt', 'a delayed passenger packet', 'guild election politics', 'a salvage claim at Gallows Reef', 'rumours of a dock strike', 'the pilgrim festival at Solace', 'insurance rates on the Mirren run']);
  const body = `SOURCE REPORT — Source ${src} (${nameLoc(loc)} access; reporting history mixed). DTG ${C.dtg(day, 17)}. Reported ${String(day).padStart(2, '0')} AUG on events of ${String(day - 1).padStart(2, '0')} AUG, ${nameLoc(loc)}.
Source observed ${a.name.toUpperCase()} (${a.attributes.role}) in conversation with ${b.name.toUpperCase()} (${b.attributes.role}) for approximately ${int(10, 50)} minutes. Subject, as far as source could hear, was ${topic}. ${pick(['No documents changed hands.', 'A printed manifest was shown and returned.', 'The conversation ended amicably.', 'Both parties left separately.'])}
Handler comment: ${pick(['No intelligence value assessed; retained for pattern of life.', 'Corroborates prior reporting on local commerce; low priority.', 'Source reliability under review after two uncorroborated reports.', 'Routine.'])}`;
  return { type: 'HUMINT', title: `Source ${src} — ${a.name} and ${b.name}, ${nameLoc(loc)}`, body, day, hh: 17, rel: pick(['B', 'C', 'C']), cred: pick([3, 4]), entityIds: [a.id, b.id, loc],
    rels: [{ s: a.id, t: b.id, type: 'meets_with', conf: 0.7, start: C.day(day - 1, 14) }, { s: a.id, t: memberOrgFor(a).id, type: 'member_of', conf: 0.9 }, { s: b.id, t: memberOrgFor(b).id, type: 'member_of', conf: 0.9 }, { s: a.id, t: loc, type: 'located_at', conf: 0.7 }],
    events: [{ type: 'meeting', title: `${a.name} meets ${b.name}`, desc: `Discussed ${topic}.`, locId: loc, day: day - 1, hh: 14, entityIds: [a.id, b.id], factionId: a.factionId }] };
}
function sigint(day: number): Draft {
  const kind = pick(['cartel', 'hegemony', 'merchant'] as const);
  if (kind === 'cartel') {
    const crew = pick(noiseOrgs.filter((o) => o.factionId === 'cartel'));
    const loc = pick(['loc_smugglers_notch', 'loc_gallows_reef', 'loc_cinder_moon']);
    const body = `INTERCEPT SUMMARY — Collector: ASHFORD RELAY. DTG ${C.dtg(day, 9)}. Link: Cartel-pattern keying, origin bearing ${nameLoc(loc)}. Participants: two Cartel speakers, assessed ${crew.name}.
Gist: dispute over ${pick(['a late refinery shipment', 'the split on a salvage lot', 'a pilot who "took the long way"', 'fuel prices at the Notch'])}. One speaker threatens to "take it to the Hollow". No reference to Concord traffic.
Analyst comment: routine internal Cartel friction. No action.`;
    return { type: 'SIGINT', title: `Intercept — Cartel internal, ${nameLoc(loc)}`, body, day, hh: 9, rel: 'A', cred: 3, entityIds: [crew.id, SAFE_CANON.cartel, loc, 'loc_ashford_relay'],
      rels: [{ s: crew.id, t: SAFE_CANON.cartel, type: 'member_of', conf: 0.85 }, { s: crew.id, t: loc, type: 'located_at', conf: 0.7 }],
      events: [{ type: 'communication', title: `Cartel burst traffic, ${nameLoc(loc)}`, desc: 'Internal dispute; no Concord reference.', locId: loc, day, hh: 3, entityIds: [crew.id], factionId: 'cartel' }] };
  }
  if (kind === 'hegemony') {
    const unit = pick(noiseOrgs.filter((o) => o.factionId === 'hegemony'));
    const body = `INTERCEPT SUMMARY — Collector: NORTHWATCH BEACON. DTG ${C.dtg(day, 9)}. Link: Hegemony picket administrative net, Dusk Gate. Participants: ${unit.name} watch officer and Vantor Bastion.
Gist: ${pick(['fuel state reports, all nominal', 'a customs hold on a pilgrim packet, released after inspection', 'crew rotation dates', 'complaint about tender availability'])}. No operational content.
Analyst comment: baseline administrative traffic. Retained for pattern.`;
    return { type: 'SIGINT', title: `Intercept — Hegemony picket administrative, Dusk Gate`, body, day, hh: 9, rel: 'A', cred: 3, entityIds: [unit.id, SAFE_CANON.hegemony, 'loc_dusk_gate', 'loc_vantor_bastion'],
      rels: [{ s: unit.id, t: SAFE_CANON.hegemony, type: 'member_of', conf: 0.95 }, { s: unit.id, t: 'loc_dusk_gate', type: 'located_at', conf: 0.9 }],
      events: [{ type: 'communication', title: 'Hegemony picket net traffic', desc: 'Administrative.', locId: 'loc_dusk_gate', day, hh: 6, entityIds: [unit.id], factionId: 'hegemony' }] };
  }
  const guild = noiseOrgs.find((o) => o.name === 'Kestrel Merchants Guild')!;
  const body = `INTERCEPT SUMMARY — Collector: ASHFORD RELAY. DTG ${C.dtg(day, 9)}. Link: Kestrel Merchants Guild open channel (unencrypted).
Gist: ${pick(['berth fee increase announced by the Port Authority', 'weather-analogue solar activity advisory for the Long Lane', 'call for tenders on the Mirren passenger run', 'notice of the guild election'])}. Multiple merchant speakers.
Analyst comment: open-source equivalent; no intelligence value.`;
  return { type: 'SIGINT', title: 'Intercept — Kestrel Merchants Guild open channel', body, day, hh: 9, rel: 'A', cred: 4, entityIds: [guild.id, SAFE_CANON.kpa, 'loc_kestrel'], rels: [{ s: guild.id, t: 'loc_kestrel', type: 'located_at', conf: 1 }], events: [] };
}
function imint(day: number): Draft {
  const loc = pick(['loc_vantor_bastion', 'loc_kessarine', 'loc_ironmark_yards', 'loc_ashen_hollow', 'loc_gallows_reef', 'loc_halcyon_belt', 'loc_hollins_depot', 'loc_caldera_yards', 'loc_dusk_gate']);
  const l = locById.get(loc)!;
  const n = int(0, 6);
  const isHeg = l.factionId === 'hegemony';
  const hulls = isHeg ? noiseVessels.filter((v) => v.factionId === 'hegemony') : l.factionId === 'concord' ? noiseVessels.filter((v) => v.factionId === 'concord') : noiseVessels.filter((v) => v.factionId === 'cartel' || v.factionId === 'unaffiliated');
  const seen = shuffle(hulls).slice(0, Math.min(n, 2));
  const body = `IMAGERY OBSERVATION — Platform: Concord survey drone NORTHWATCH-${int(1, 4)}, pass over ${l.name}, ${String(day - 1).padStart(2, '0')} AUG ${int(0, 23).toString().padStart(2, '0')}00Z. DTG ${C.dtg(day, 8)}.
Observed ${n === 0 ? 'no' : n} hull${n === 1 ? '' : 's'} at ${pick(['anchorage', 'berth', 'the approach'])}${seen.length ? `, including ${seen.map((v) => v.name.toUpperCase()).join(' and ')}` : ''}. ${pick(['Disposition unchanged from last pass.', 'One hull under tender.', 'Routine traffic.', 'Lighter activity at baseline.'])} Change from last: ${pick(['none', '+1 hull', '−1 hull', 'none'])}.
Assessment: ${isHeg ? 'baseline Hegemony presence; no forward movement observed.' : 'routine.'} Confidence high on count.`;
  return { type: 'IMINT', title: `Imagery — ${l.name}, ${n} hull${n === 1 ? '' : 's'}`, body, day, hh: 8, rel: 'A', cred: 1, entityIds: [loc, ...seen.map((v) => v.id), 'loc_northwatch_beacon'],
    rels: seen.map((v) => ({ s: v.id, t: loc, type: 'located_at', conf: 0.9, start: C.day(day - 1) })),
    // No hulls observed means nothing happened; an event with no participants is noise in the wrong sense.
    events: seen.length ? [{ type: 'sighting', title: `${n} hull${n === 1 ? '' : 's'} at ${l.name}`, desc: 'Routine imagery.', locId: loc, day: day - 1, hh: 12, entityIds: seen.map((v) => v.id), factionId: l.factionId }] : [] };
}
function osint(day: number): Draft {
  const kind = pick(['ledger', 'kpa', 'circular', 'hegemony_press', 'pilgrim'] as const);
  if (kind === 'ledger') {
    const topic = pick(['Dock workers vote on strike ballot at the Low Docks', 'Guild election: three candidates for secretary', 'Salvage claim at Gallows Reef goes to arbitration', 'Berth fees to rise four percent, Port Authority confirms', 'Pilgrim season brings record traffic through Fenwick Crossing', 'Halcyon ore prices fall for third week']);
    const p = pick(noisePeople.filter((x) => x.factionId === 'kestrel' || x.factionId === 'unaffiliated'));
    const body = `KESTREL LEDGER — "${topic}", by Lio Sandoval. ${C.dtg(day, 9)}.
${pick(['The Free Port', 'Kestrel', 'The High Docks'])} ${pick(['saw', 'braced for', 'debated'])} ${topic.toLowerCase()} this week. ${p.name}, ${p.attributes.role}, told the Ledger that "${pick(['nobody wants a stoppage in convoy season', 'the numbers are what they are', 'the Port Authority has been fair, mostly', 'the belt is quieter than it was'])}". Port Master Quill Adeyemi declined to comment beyond a statement that filings remained "in order".`;
    return { type: 'OSINT', title: `Kestrel Ledger — ${topic}`, body, day, hh: 9, rel: 'C', cred: 3, entityIds: [p.id, SAFE_CANON.sandoval, SAFE_CANON.adeyemi, SAFE_CANON.ledger, SAFE_CANON.kpa, 'loc_kestrel'],
      rels: [{ s: p.id, t: 'loc_kestrel', type: 'located_at', conf: 0.8 }, { s: p.id, t: memberOrgFor(p).id, type: 'member_of', conf: 0.9 }], events: [{ type: 'incident', title: topic, desc: 'Reported by the Kestrel Ledger.', locId: 'loc_kestrel', day, hh: 9, entityIds: [p.id], factionId: 'kestrel' }] };
  }
  if (kind === 'kpa') {
    const v = pick(noiseVessels.filter((x) => x.factionId !== 'hegemony' && x.factionId !== 'concord'));
    const body = `KESTREL PORT AUTHORITY — PORT NOTICE ${int(100, 999)}. ${C.dtg(day, 8)}.
${pick(['Berth reassignment', 'Manifest amendment accepted', 'Transponder recertification', 'Fuel bunkering slot'])}: ${v.name.toUpperCase()}, ${pick(['High Docks berth ' + int(1, 20), 'Low Docks berth ' + int(1, 30)])}. ${pick(['No fees outstanding.', 'Inspection scheduled.', 'Cleared for departure.'])} Signed, Port Master Q. Adeyemi.`;
    return { type: 'OSINT', title: `Port notice — ${v.name}`, body, day, hh: 8, rel: 'A', cred: 2, entityIds: [v.id, SAFE_CANON.kpa, SAFE_CANON.adeyemi, 'loc_kestrel_high_docks'],
      rels: [{ s: v.id, t: 'loc_kestrel_high_docks', type: 'located_at', conf: 0.9, start: C.day(day) }, { s: vesselOwner.get(v.id)!, t: v.id, type: 'owns', conf: 1 }], events: [] };
  }
  if (kind === 'circular') {
    const ps = shuffle(noisePeople.filter((x) => x.factionId === 'concord')).slice(0, 3);
    const body = `CONCORD REACH FLEET — ${pick(['TRAINING CIRCULAR', 'STORES CIRCULAR', 'PERSONNEL MOVEMENT CIRCULAR'])} 26-0${int(10, 99)}. DTG ${C.dtg(day, 10)}.
${ps.map((p) => `${p.name.split(' ')[0][0]}. ${p.name.split(' ')[1].toUpperCase()}, ${p.attributes.role} — ${pick(['TDY Hollins Depot (convoy work-up)', 'leave, Vellum Moon', 'TDY Caldera Yards (refit)', 'duty, Meridian Station', 'TDY Port Amberly'])}, ${String(day).padStart(2, '0')}–${String(Math.min(30, day + int(1, 3))).padStart(2, '0')} AUG.`).join('\n')}
${pick(['Convoy 7 work-up continues at Hollins Depot; escort CNS Harrowgate alongside.', 'CNS Palisade remains on Meridian picket.', 'Ashford Relay reports collection nominal.'])}
[additional entries omitted]`;
    return { type: 'OSINT', title: `Fleet circular 26-0${int(10, 99)}`, body, day, hh: 10, rel: 'A', cred: 1, entityIds: [...ps.map((p) => p.id), SAFE_CANON.logcom, 'loc_meridian_station', 'loc_hollins_depot'],
      rels: ps.map((p) => ({ s: p.id, t: SAFE_CANON.logcom, type: 'member_of', conf: 1 })).concat(ps.map((p) => ({ s: p.id, t: 'loc_meridian_station', type: 'located_at', conf: 0.9 }))), events: [] };
  }
  if (kind === 'hegemony_press') {
    const body = `VANTOR BASTION PRESS OFFICE — STATEMENT. ${C.dtg(day, 11)}.
Envoy Thessaly Morn, speaking at Kestrel, said the Hegemony "${pick(['seeks only orderly commerce through Dusk Gate', 'regrets Concord\'s militarisation of the Long Lane', 'welcomes the Free Port\'s neutrality', 'will protect its shipping wherever it sails'])}". The statement follows ${pick(['a customs dispute at Dusk Gate', 'the Kestrel guild election', 'a Concord fleet exercise near Corran Gate'])}.`;
    return { type: 'OSINT', title: 'Hegemony press statement — Envoy Morn at Kestrel', body, day, hh: 11, rel: 'C', cred: 4, entityIds: [SAFE_CANON.morn, SAFE_CANON.hegemony, 'loc_kestrel', 'loc_vantor_bastion'], rels: [{ s: SAFE_CANON.morn, t: 'loc_kestrel', type: 'located_at', conf: 0.9 }], events: [{ type: 'communication', title: 'Hegemony envoy statement', desc: 'Public statement at Kestrel.', locId: 'loc_kestrel', day, hh: 11, entityIds: [SAFE_CANON.morn], factionId: 'hegemony' }] };
  }
  const order = noiseOrgs.find((o) => o.name === 'Order of the Quiet Lamp')!;
  const elder = pick(noisePeople.filter((x) => x.factionId === 'unaffiliated'));
  const body = `PILGRIM'S REST — WAYSTATION BULLETIN. ${C.dtg(day, 7)}.
${int(40, 300)} pilgrims of the Order of the Quiet Lamp passed through Fenwick Crossing bound for Solace. ${elder.name}, ${elder.attributes.role}, thanked the waystation. ${pick(['Two packets delayed by solar activity.', 'No incidents.', 'Medical tent treated minor cases.'])}`;
  return { type: 'OSINT', title: "Pilgrim's Rest waystation bulletin", body, day, hh: 7, rel: 'C', cred: 3, entityIds: [order.id, elder.id, 'loc_pilgrims_rest', 'loc_fenwick_crossing', 'loc_solace'],
    rels: [{ s: elder.id, t: order.id, type: 'member_of', conf: 0.9 }, { s: order.id, t: 'loc_solace', type: 'located_at', conf: 1 }], events: [{ type: 'movement', title: 'Pilgrim transit via Fenwick Crossing', desc: 'Seasonal.', locId: 'loc_fenwick_crossing', day, hh: 6, entityIds: [order.id], factionId: 'unaffiliated' }] };
}

const MIX: Array<() => (d: number) => Draft> = [...Array(18).fill(() => osint), ...Array(14).fill(() => tracking), ...Array(8).fill(() => financial), ...Array(10).fill(() => humint), ...Array(6).fill(() => sigint), ...Array(8).fill(() => imint)];
const TOTAL_REPORTS = 80;
const canonNums = new Set(C.canonReports.map((r) => Number(r.id.slice(2))));
const freeNums = Array.from({ length: TOTAL_REPORTS }, (_, i) => i + 1).filter((n) => !canonNums.has(n));
if (freeNums.length !== MIX.length) throw new Error(`noise count ${MIX.length} != free report numbers ${freeNums.length}`);

for (const make of MIX) {
  const d = int(2, 30);
  drafts.push(make()(d));
}
drafts.sort((a, b) => a.day - b.day || a.hh - b.hh);

const forbidden = C.FORBIDDEN_IN_NOISE.map((w) => w.toLowerCase());
drafts.forEach((dr, i) => {
  const num = `R-${String(freeNums[i]).padStart(4, '0')}`;
  const hay = `${dr.title}\n${dr.body}`.toLowerCase();
  for (const w of forbidden) if (hay.includes(w)) throw new Error(`noise ${num} contains forbidden word "${w}": ${dr.title}`);
  reports.push({ id: num, reportNumber: num, type: dr.type, title: dr.title, body: dr.body, sourceReliability: dr.rel, infoCredibility: dr.cred, reportedAt: C.day(dr.day, dr.hh), eventAt: dr.events[0] ? C.day(dr.events[0].day, dr.events[0].hh) : null, marking: C.MARKING });
  for (const eid of new Set(dr.entityIds)) links.push({ reportId: num, objectType: 'entity', objectId: eid, excerpt: dr.body.slice(0, 140) });
  for (const r of dr.rels) {
    const existing = seenRel(r.s, r.t, r.type);
    if (existing) { links.push({ reportId: num, objectType: 'relationship', objectId: existing.id, excerpt: r.excerpt ?? '' }); continue; }
    const row: RelRow = { id: nid('rel'), sourceEntityId: r.s, targetEntityId: r.t, type: r.type, startAt: r.start ?? null, endAt: null, confidence: r.conf ?? 0.7, attributes: {} };
    relationships.push(row); relKey.set(`${r.s}|${r.t}|${r.type}`, row);
    links.push({ reportId: num, objectType: 'relationship', objectId: row.id, excerpt: r.excerpt ?? '' });
  }
  for (const ev of dr.events) {
    const l = locById.get(ev.locId)!;
    const row: EventRow = { id: nid('evt'), type: ev.type, title: ev.title, description: ev.desc, lon: l.lon + (rnd() - 0.5) * 0.6, lat: l.lat + (rnd() - 0.5) * 0.6, occurredAt: C.day(ev.day, ev.hh), confidence: 0.8, factionId: ev.factionId };
    events.push(row);
    for (const eid of new Set(ev.entityIds)) eventEntities.push({ eventId: row.id, entityId: eid, role: 'participant' });
    links.push({ reportId: num, objectType: 'event', objectId: row.id, excerpt: '' });
  }
});

// Every noise org gets a home; every vessel an owner edge (some already exist).
for (const o of noiseOrgs) if (!seenRel(o.id, '', '')) {
  const home = homeFor(o.factionId!);
  const intro = reports.find((r) => links.some((l) => l.reportId === r.id && l.objectId === o.id)) ?? reports[reports.length - 1];
  if (!relationships.some((r) => r.sourceEntityId === o.id && r.type === 'located_at')) {
    const row: RelRow = { id: nid('rel'), sourceEntityId: o.id, targetEntityId: home, type: 'located_at', startAt: null, endAt: null, confidence: 0.85, attributes: {} };
    relationships.push(row); links.push({ reportId: intro.id, objectType: 'relationship', objectId: row.id, excerpt: '' });
    if (!links.some((l) => l.reportId === intro.id && l.objectId === o.id)) links.push({ reportId: intro.id, objectType: 'entity', objectId: o.id, excerpt: '' });
  }
}
for (const v of noiseVessels) if (!relationships.some((r) => r.targetEntityId === v.id && r.type === 'owns')) {
  const intro = reports.find((r) => links.some((l) => l.reportId === r.id && l.objectId === v.id)) ?? pick(reports.filter((r) => r.type === 'OSINT'));
  const row: RelRow = { id: nid('rel'), sourceEntityId: vesselOwner.get(v.id)!, targetEntityId: v.id, type: 'owns', startAt: null, endAt: null, confidence: 1, attributes: {} };
  relationships.push(row); links.push({ reportId: intro.id, objectType: 'relationship', objectId: row.id, excerpt: '' });
  if (!links.some((l) => l.reportId === intro.id && l.objectId === v.id)) links.push({ reportId: intro.id, objectType: 'entity', objectId: v.id, excerpt: '' });
}
// Every person a membership + home if still missing.
for (const p of noisePeople) {
  const intro = reports.find((r) => links.some((l) => l.reportId === r.id && l.objectId === p.id)) ?? pick(reports.filter((r) => r.type === 'OSINT'));
  if (!relationships.some((r) => r.sourceEntityId === p.id && r.type === 'member_of')) {
    const row: RelRow = { id: nid('rel'), sourceEntityId: p.id, targetEntityId: memberOrgFor(p).id, type: 'member_of', startAt: null, endAt: null, confidence: 0.9, attributes: {} };
    relationships.push(row); links.push({ reportId: intro.id, objectType: 'relationship', objectId: row.id, excerpt: '' });
  }
  if (!relationships.some((r) => r.sourceEntityId === p.id && r.type === 'located_at')) {
    const row: RelRow = { id: nid('rel'), sourceEntityId: p.id, targetEntityId: homeFor(p.factionId!), type: 'located_at', startAt: null, endAt: null, confidence: 0.8, attributes: {} };
    relationships.push(row); links.push({ reportId: intro.id, objectType: 'relationship', objectId: row.id, excerpt: '' });
  }
  if (!links.some((l) => l.reportId === intro.id && l.objectId === p.id)) links.push({ reportId: intro.id, objectType: 'entity', objectId: p.id, excerpt: '' });
}

// ---- 3b. Pattern of life: give noise entities the connective tissue a real
// dataset has (trade partners, regular routes, acquaintances). Each edge is
// attributed to the report that introduced its source entity.
const introOf = (id: string) => reports.find((r) => links.some((l) => l.reportId === r.id && l.objectType === 'entity' && l.objectId === id)) ?? pick(reports.filter((r) => r.type === 'OSINT'));
const addRel = (s: string, t: string, type: string, conf: number, reportId: string, start: string | null = null) => {
  if (s === t || seenRel(s, t, type)) return;
  const row: RelRow = { id: nid('rel'), sourceEntityId: s, targetEntityId: t, type, startAt: start, endAt: null, confidence: conf, attributes: {} };
  relationships.push(row); relKey.set(`${s}|${t}|${type}`, row);
  links.push({ reportId, objectType: 'relationship', objectId: row.id, excerpt: '' });
  if (!links.some((l) => l.reportId === reportId && l.objectType === 'entity' && l.objectId === t)) links.push({ reportId, objectType: 'entity', objectId: t, excerpt: '' });
};
const addEvent = (type: EventRow['type'], title: string, desc: string, locId: string, d: number, hh: number, entityIds: string[], factionId: string | null, reportId: string) => {
  const l = locById.get(locId)!;
  const row: EventRow = { id: nid('evt'), type, title, description: desc, lon: l.lon + (rnd() - 0.5) * 0.6, lat: l.lat + (rnd() - 0.5) * 0.6, occurredAt: C.day(d, hh), confidence: 0.75, factionId };
  events.push(row);
  for (const eid of new Set(entityIds)) eventEntities.push({ eventId: row.id, entityId: eid, role: 'participant' });
  links.push({ reportId, objectType: 'event', objectId: row.id, excerpt: '' });
};
for (const v of noiseVessels) {
  const intro = introOf(v.id);
  const home = homeFor(v.factionId!);
  addRel(v.id, home, 'located_at', 0.85, intro.id);
  for (const dest of shuffle([...region.kestrel, ...region.unaffiliated, ...region[v.factionId!]]).slice(0, 3)) {
    const d = int(2, 30);
    addRel(v.id, dest, 'travels_to', 0.9, intro.id, C.day(d, int(0, 23)));
    addEvent('movement', `${v.name} at ${nameLoc(dest)}`, 'Routine transit.', dest, d, int(0, 23), [v.id], v.factionId, intro.id);
  }
}
for (const o of noiseOrgs) {
  const intro = introOf(o.id);
  for (const partner of shuffle(noiseOrgs.filter((x) => x.id !== o.id && (x.factionId === o.factionId || x.factionId === 'kestrel'))).slice(0, 2)) addRel(o.id, partner.id, 'communicates_with', 0.6, intro.id);
  const acct = noiseAccounts.find((a) => a.attributes.holder === o.name);
  if (acct) addRel(o.id, acct.id, 'owns', 1, intro.id);
}
for (const p of noisePeople) {
  const intro = introOf(p.id);
  for (const other of shuffle(noisePeople.filter((x) => x.id !== p.id && x.factionId === p.factionId)).slice(0, 2)) addRel(p.id, other.id, 'associated_with', 0.6, intro.id);
  const dest = pick([...region.kestrel, ...region[p.factionId!]]);
  const d = int(2, 30);
  addRel(p.id, dest, 'travels_to', 0.7, intro.id, C.day(d, 9));
  if (rnd() < 0.5) addEvent('movement', `${p.name} travels to ${nameLoc(dest)}`, 'Pattern of life.', dest, d, 9, [p.id], p.factionId, intro.id);
}
// Sightings: put a few noise vessels at interesting places so the map has texture.
for (let i = 0; i < 20; i++) {
  const v = pick(noiseVessels); const loc = anyLoc(); const d = int(1, 30);
  addEvent('sighting', `${v.name} sighted at ${nameLoc(loc)}`, 'Transponder contact.', loc, d, int(0, 23), [v.id], v.factionId, introOf(v.id).id);
}

// ---- 4. Integrity + write ----------------------------------------------------------
const entityIds = new Set(entities.map((e) => e.id));
const relIds = new Set(relationships.map((r) => r.id));
const eventIds = new Set(events.map((e) => e.id));
const reportIds = new Set(reports.map((r) => r.id));
for (const r of relationships) { if (!entityIds.has(r.sourceEntityId) || !entityIds.has(r.targetEntityId)) throw new Error(`rel ${r.id} dangling: ${r.sourceEntityId} -> ${r.targetEntityId}`); }
for (const l of links) {
  if (!reportIds.has(l.reportId)) throw new Error(`link to missing report ${l.reportId}`);
  const ok = l.objectType === 'entity' ? entityIds.has(l.objectId) : l.objectType === 'relationship' ? relIds.has(l.objectId) : eventIds.has(l.objectId);
  if (!ok) throw new Error(`link ${l.reportId} -> ${l.objectType}:${l.objectId} dangling`);
}
for (const ee of eventEntities) if (!eventIds.has(ee.eventId) || !entityIds.has(ee.entityId)) throw new Error(`event_entity dangling ${ee.eventId}/${ee.entityId}`);
// dedupe links
const linkKey = new Set<string>();
const dedupedLinks = links.filter((l) => { const k = `${l.reportId}|${l.objectType}|${l.objectId}`; if (linkKey.has(k)) return false; linkKey.add(k); return true; });
const eeKey = new Set<string>();
const dedupedEE = eventEntities.filter((e) => { const k = `${e.eventId}|${e.entityId}`; if (eeKey.has(k)) return false; eeKey.add(k); return true; });

const out = path.resolve('data/seed');
fs.mkdirSync(out, { recursive: true });
const write = (name: string, rows: unknown[]) => fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(rows, null, 1) + '\n');
write('factions', C.factions as unknown as unknown[]);
write('entities', entities);
write('relationships', relationships);
write('reports', reports.sort((a, b) => a.id.localeCompare(b.id)));
write('events', events);
write('report_links', dedupedLinks);
write('event_entities', dedupedEE);
console.log(`seed written to ${out}`);
console.table({ factions: C.factions.length, entities: entities.length, relationships: relationships.length, reports: reports.length, events: events.length, report_links: dedupedLinks.length, event_entities: dedupedEE.length });
