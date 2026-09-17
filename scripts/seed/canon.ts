/**
 * Machine-readable story bible. Everything the generator must not invent.
 * Narrative rationale lives in data/story-bible.md.
 */

export const SCENARIO_START = Date.UTC(2026, 7, 1); // 2026-08-01T00:00Z = day 1

/** ISO timestamp for scenario day n at hh:mm UTC. */
export function day(n: number, hh = 12, mm = 0): string {
  return new Date(SCENARIO_START + (n - 1) * 86_400_000 + hh * 3_600_000 + mm * 60_000).toISOString();
}
/** DTG in the in-universe format: DDHHMMZ AUG 26 */
export function dtg(n: number, hh = 12, mm = 0): string {
  return `${String(n).padStart(2, '0')}${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}Z AUG 26`;
}

export const MARKING = 'EXERCISE – FICTIONAL DATA';

export const factions = [
  { id: 'concord', name: 'Concord Alliance', color: '#22d3ee', description: 'The home side. Reach Fleet defends the western systems and runs the convoys.' },
  { id: 'hegemony', name: 'Vantor Hegemony', color: '#ef4444', description: 'Expansionist power east of Dusk Gate, probing the Reach with raider groups.' },
  { id: 'cartel', name: 'Ashen Cartel', color: '#f59e0b', description: 'Smuggling and arms network based in the southern reefs. Sells to anyone.' },
  { id: 'kestrel', name: 'Free Port of Kestrel', color: '#a78bfa', description: 'Neutral trade hub at the centre of the Reach. Heavy traffic, thin oversight.' },
  { id: 'unaffiliated', name: 'Unaffiliated', color: '#9ca3af', description: 'Merchants, pilgrims, salvagers, media.' },
] as const;

export type LocationKind = 'system' | 'station' | 'gate' | 'moon' | 'city' | 'facility' | 'lane';
export interface LocationInput { id: string; name: string; kind: LocationKind; lon: number; lat: number; factionId: string | null; description: string; aliases?: string[] }

export const locations: LocationInput[] = [
  // Concord west
  { id: 'loc_meridian_station', name: 'Meridian Station', kind: 'station', lon: -22, lat: 6, factionId: 'concord', description: 'Concord Reach Fleet headquarters and Logistics Command.' },
  { id: 'loc_meridian_prime', name: 'Meridian Prime', kind: 'system', lon: -24, lat: 5, factionId: 'concord', description: 'Home system of the Concord presence in the Reach.' },
  { id: 'loc_caldera_yards', name: 'Caldera Yards', kind: 'facility', lon: -26, lat: 9, factionId: 'concord', description: 'Fleet shipyard and refit facility.' },
  { id: 'loc_ashford_relay', name: 'Ashford Relay', kind: 'gate', lon: -18, lat: 2, factionId: 'concord', description: 'Jump gate and signals collection station.' },
  { id: 'loc_vellum_moon', name: 'Vellum Moon', kind: 'moon', lon: -20, lat: -6, factionId: 'concord', description: 'Agricultural moon; leave destination.' },
  { id: 'loc_hollins_depot', name: 'Hollins Depot', kind: 'facility', lon: -14, lat: 4, factionId: 'concord', description: 'Forward logistics depot; convoy assembly point.' },
  { id: 'loc_corran_gate', name: 'Corran Gate', kind: 'gate', lon: -10, lat: 1, factionId: 'concord', description: 'Eastern Concord jump gate onto the Long Lane.' },
  { id: 'loc_port_amberly', name: 'Port Amberly', kind: 'station', lon: -16, lat: -10, factionId: 'concord', description: 'Civilian port and customs post.' },
  { id: 'loc_sable_reach', name: 'Sable Reach', kind: 'system', lon: -28, lat: -2, factionId: 'concord', description: 'Mining system.' },
  { id: 'loc_tarns_landing', name: "Tarn's Landing", kind: 'city', lon: -12, lat: -14, factionId: 'concord', description: 'Colony town; branch of Concord Reach Bank.' },
  // Centre / Kestrel
  { id: 'loc_kestrel', name: 'Free Port of Kestrel', kind: 'station', lon: 0, lat: 0, factionId: 'kestrel', description: 'The neutral hub of the Reach. Everyone passes through.', aliases: ['Kestrel', 'Kestrel Station'] },
  { id: 'loc_kestrel_prime', name: 'Kestrel Prime', kind: 'system', lon: 1, lat: -1, factionId: 'kestrel', description: 'System containing the Free Port.' },
  { id: 'loc_kestrel_low_docks', name: 'Kestrel Low Docks', kind: 'facility', lon: 0.4, lat: 0.3, factionId: 'kestrel', description: 'Bulk cargo and provisioning docks.' },
  { id: 'loc_kestrel_high_docks', name: 'Kestrel High Docks', kind: 'facility', lon: -0.3, lat: 0.6, factionId: 'kestrel', description: 'Freight and salvage berths; company offices.' },
  { id: 'loc_tallow_row', name: 'Tallow Row', kind: 'city', lon: 0.2, lat: -0.5, factionId: 'kestrel', description: 'Tea houses, registered agents, and quiet booths.' },
  { id: 'loc_tessaly_gate', name: 'Tessaly Gate', kind: 'gate', lon: 6, lat: -2, factionId: 'kestrel', description: 'Jump gate on the Kestrel–Mirren route. The only eastern exit for Concord convoys.' },
  { id: 'loc_tessaly_approach', name: 'Tessaly Approach', kind: 'lane', lon: 5, lat: -1.5, factionId: null, description: 'Shipping lane from Kestrel to Tessaly Gate.' },
  { id: 'loc_mirren_drift', name: 'Mirren Drift', kind: 'system', lon: 3, lat: 5, factionId: 'unaffiliated', description: 'Sparse system; transit point to Wyre.' },
  { id: 'loc_halcyon_belt', name: 'Halcyon Belt', kind: 'system', lon: 4, lat: -8, factionId: 'unaffiliated', description: 'Asteroid belt; independent prospectors.' },
  { id: 'loc_wyre_station', name: 'Wyre Station', kind: 'station', lon: 2, lat: 9, factionId: 'concord', description: 'Concord research station; Convoy 7 destination.' },
  // Hegemony east
  { id: 'loc_vantor_bastion', name: 'Vantor Bastion', kind: 'station', lon: 24, lat: 3, factionId: 'hegemony', description: 'Hegemony regional command.' },
  { id: 'loc_vantor_core', name: 'Vantor Core', kind: 'system', lon: 26, lat: 2, factionId: 'hegemony', description: 'Hegemony core system in the Reach.' },
  { id: 'loc_ironmark_yards', name: 'Ironmark Yards', kind: 'facility', lon: 22, lat: 8, factionId: 'hegemony', description: 'Raider construction yard.' },
  { id: 'loc_dusk_gate', name: 'Dusk Gate', kind: 'gate', lon: 16, lat: 0, factionId: 'hegemony', description: 'Hegemony-controlled gate; picket line.' },
  { id: 'loc_kessarine', name: 'Kessarine', kind: 'system', lon: 19, lat: -5, factionId: 'hegemony', description: 'Raider group home port.' },
  { id: 'loc_outpost_threnody', name: 'Outpost Threnody', kind: 'facility', lon: 13, lat: 3, factionId: 'hegemony', description: 'Forward facility one jump east of Tessaly Gate.' },
  { id: 'loc_ruun_anchorage', name: 'Ruun Anchorage', kind: 'station', lon: 14, lat: -6, factionId: 'hegemony', description: 'Fuel and repair anchorage.' },
  { id: 'loc_caul_nebula', name: 'Caul Nebula Edge', kind: 'system', lon: 11, lat: 6, factionId: null, description: 'Sensor-degraded region.' },
  // Cartel south
  { id: 'loc_ashen_hollow', name: 'Ashen Hollow', kind: 'station', lon: -4, lat: -15, factionId: 'cartel', description: 'Cartel home station, hollowed asteroid.' },
  { id: 'loc_gallows_reef', name: 'Gallows Reef', kind: 'system', lon: 2, lat: -16, factionId: 'cartel', description: 'Wreck field; salvage and smuggling.' },
  { id: 'loc_cinder_moon', name: 'Cinder Moon', kind: 'moon', lon: -7, lat: -12, factionId: 'cartel', description: 'Cartel refinery moon.' },
  { id: 'loc_smugglers_notch', name: "Smuggler's Notch", kind: 'facility', lon: 8, lat: -13, factionId: 'cartel', description: 'Hidden transfer point.' },
  { id: 'loc_pale_sound', name: 'Pale Sound', kind: 'system', lon: -2, lat: -18, factionId: null, description: 'Empty system on the southern edge.' },
  // North / unaffiliated
  { id: 'loc_pilgrims_rest', name: "Pilgrim's Rest", kind: 'station', lon: -6, lat: 12, factionId: 'unaffiliated', description: 'Pilgrim waystation.' },
  { id: 'loc_solace', name: 'Solace', kind: 'system', lon: -8, lat: 16, factionId: 'unaffiliated', description: 'Monastic settlement.' },
  { id: 'loc_northwatch_beacon', name: 'Northwatch Beacon', kind: 'facility', lon: 12, lat: 14, factionId: 'concord', description: 'Concord survey drone base.' },
  { id: 'loc_fenwick_crossing', name: 'Fenwick Crossing', kind: 'gate', lon: -3, lat: 7, factionId: null, description: 'Minor gate to the northern systems.' },
  { id: 'loc_orrin_shoals', name: 'Orrin Shoals', kind: 'system', lon: 7, lat: 11, factionId: 'unaffiliated', description: 'Prospecting system.' },
  { id: 'loc_harrow_deep', name: 'Harrow Deep', kind: 'system', lon: 18, lat: 12, factionId: null, description: 'Unclaimed deep system.' },
  // Lanes
  { id: 'loc_long_lane', name: 'The Long Lane', kind: 'lane', lon: -5, lat: 0.5, factionId: null, description: 'Corran Gate to Kestrel.' },
  { id: 'loc_southern_run', name: 'Southern Run', kind: 'lane', lon: -2, lat: -8, factionId: null, description: 'Kestrel to Ashen Hollow.' },
  { id: 'loc_dusk_road', name: 'Dusk Road', kind: 'lane', lon: 11, lat: -1, factionId: null, description: 'Tessaly Gate to Dusk Gate. Sensor-thin.' },
];

/** Lanes drawn on the map as lines between two locations. */
export const lanes: Array<{ id: string; from: string; to: string; name: string }> = [
  { id: 'lane_hollins_corran', from: 'loc_hollins_depot', to: 'loc_corran_gate', name: 'Hollins–Corran' },
  { id: 'lane_long', from: 'loc_corran_gate', to: 'loc_kestrel', name: 'The Long Lane' },
  { id: 'lane_tessaly', from: 'loc_kestrel', to: 'loc_tessaly_gate', name: 'Tessaly Approach' },
  { id: 'lane_dusk_road', from: 'loc_tessaly_gate', to: 'loc_dusk_gate', name: 'Dusk Road' },
  { id: 'lane_threnody', from: 'loc_outpost_threnody', to: 'loc_dusk_gate', name: 'Threnody spur' },
  { id: 'lane_mirren', from: 'loc_tessaly_gate', to: 'loc_mirren_drift', name: 'Mirren leg' },
  { id: 'lane_wyre', from: 'loc_mirren_drift', to: 'loc_wyre_station', name: 'Wyre leg' },
  { id: 'lane_southern', from: 'loc_kestrel', to: 'loc_ashen_hollow', name: 'Southern Run' },
  { id: 'lane_gallows', from: 'loc_ashen_hollow', to: 'loc_gallows_reef', name: 'Reef run' },
  { id: 'lane_meridian_ashford', from: 'loc_meridian_station', to: 'loc_ashford_relay', name: 'Meridian–Ashford' },
  { id: 'lane_ashford_hollins', from: 'loc_ashford_relay', to: 'loc_hollins_depot', name: 'Ashford–Hollins' },
  { id: 'lane_dusk_bastion', from: 'loc_dusk_gate', to: 'loc_vantor_bastion', name: 'Bastion road' },
  { id: 'lane_kessarine', from: 'loc_dusk_gate', to: 'loc_kessarine', name: 'Kessarine spur' },
  { id: 'lane_fenwick', from: 'loc_kestrel', to: 'loc_fenwick_crossing', name: 'North road' },
  { id: 'lane_pilgrim', from: 'loc_fenwick_crossing', to: 'loc_pilgrims_rest', name: 'Pilgrim road' },
];

export type EntityType = 'person' | 'organization' | 'vessel' | 'account' | 'equipment' | 'other';
export interface EntityInput { id: string; type: EntityType; name: string; aliases?: string[]; factionId: string | null; description: string; attributes?: Record<string, unknown>; confidence?: number }

export const entities: EntityInput[] = [
  // ---- Concord people ----
  { id: 'per_ilsa_varro', type: 'person', name: 'Ilsa Varro', aliases: ['Lt Cmdr Varro', 'I. Varro'], factionId: 'concord',
    description: 'Lieutenant Commander, Concord Reach Fleet Logistics Command, Movement Tables Section, Meridian Station.',
    attributes: { rank: 'Lieutenant Commander', branch: 'Logistics', billet: 'Movement Tables Section', station: 'Meridian Station', clearance: 'Convoy scheduling', next_of_kin: "Ansel Varro (brother), Tarn's Landing" }, confidence: 0.95 },
  { id: 'per_ansel_varro', type: 'person', name: 'Ansel Varro', aliases: ['A. Varro'], factionId: 'unaffiliated',
    description: "Civilian resident of Tarn's Landing. No registered business. Brother of Lt Cmdr Ilsa Varro.", attributes: { residence: "Tarn's Landing", occupation: 'none registered' }, confidence: 0.85 },
  { id: 'per_doss_renley', type: 'person', name: 'Doss Renley', aliases: ['Cmdr Renley', 'D. Renley'], factionId: 'concord',
    description: 'Commander, Concord Reach Fleet Logistics Command, Convoy Planning. Meridian Station.',
    attributes: { rank: 'Commander', branch: 'Planning', billet: 'Convoy Planning', station: 'Meridian Station', clearance: 'Convoy scheduling' }, confidence: 0.95 },
  { id: 'per_teodor_mallick', type: 'person', name: 'Teodor Mallick', aliases: ['Capt Mallick'], factionId: 'concord',
    description: 'Captain, commanding Concord Convoy 7.', attributes: { rank: 'Captain' }, confidence: 0.95 },
  { id: 'per_sera_okonkwo_vane', type: 'person', name: 'Sera Okonkwo-Vane', aliases: ['Admiral Okonkwo-Vane'], factionId: 'concord',
    description: 'Admiral commanding Concord Reach Fleet.', attributes: { rank: 'Admiral' }, confidence: 0.95 },
  { id: 'per_greyfinch', type: 'person', name: 'GREYFINCH', aliases: ['Source GREYFINCH'], factionId: 'concord',
    description: 'Concord human source on Kestrel with access to port-district commerce. 11 prior reports, 9 corroborated.', attributes: { source_type: 'HUMINT', reliability: 'B' }, confidence: 0.8 },
  // ---- Kestrel / Brightwater ----
  { id: 'per_petra_lindqvist', type: 'person', name: 'Petra Lindqvist', aliases: ['P. Lindqvist'], factionId: 'kestrel',
    description: 'Manager and sole director of Brightwater Hauling, Kestrel High Docks.', confidence: 0.9 },
  { id: 'per_ossian_kade', type: 'person', name: 'Ossian Kade', aliases: ['O. Kade', 'Captain Kade'], factionId: 'kestrel',
    description: 'Master of CV Cinder Moth, Brightwater Hauling.', confidence: 0.9 },
  { id: 'per_quill_adeyemi', type: 'person', name: 'Quill Adeyemi', aliases: ['Port Master Adeyemi'], factionId: 'kestrel',
    description: 'Port Master, Kestrel Port Authority.', confidence: 0.95 },
  { id: 'per_lio_sandoval', type: 'person', name: 'Lio Sandoval', factionId: 'unaffiliated',
    description: 'Journalist, Kestrel Ledger.', confidence: 0.9 },
  { id: 'per_hal_brenner', type: 'person', name: 'Hal Brenner', aliases: ['Halloway Brenner'], factionId: 'kestrel',
    description: 'Proprietor of Halloway & Sons Trading, licensed salvage broker.', confidence: 0.9 },
  // ---- Cartel ----
  { id: 'per_marrow_veil', type: 'person', name: 'Marrow Veil', aliases: ['the Quartermaster'], factionId: 'cartel',
    description: 'Ashen Cartel broker running the Kestrel cell.', confidence: 0.7 },
  { id: 'per_ivo_draskovic', type: 'person', name: 'Ivo Draskovic', factionId: 'cartel',
    description: 'Ashen Cartel financier; controls the front accounts.', confidence: 0.65 },
  // ---- Hegemony ----
  { id: 'per_kael_vantor_ruun', type: 'person', name: 'Kael Vantor-Ruun', aliases: ['Strategos Vantor-Ruun'], factionId: 'hegemony',
    description: 'Strategos commanding the Vantor 9th Raider Group.', attributes: { rank: 'Strategos' }, confidence: 0.85 },
  { id: 'per_thessaly_morn', type: 'person', name: 'Thessaly Morn', aliases: ['Envoy Morn'], factionId: 'hegemony',
    description: 'Hegemony envoy resident on Kestrel; assessed liaison to Vantor Expeditionary Command.', confidence: 0.7 },
  // ---- Organisations ----
  { id: 'org_logcom', type: 'organization', name: 'Concord Reach Fleet Logistics Command', aliases: ['LOGCOM', 'Logistics Command'], factionId: 'concord',
    description: 'Runs convoy scheduling (Movement Tables Section) and planning for the Reach.', confidence: 1 },
  { id: 'org_convoy_7', type: 'organization', name: 'Concord Convoy 7', aliases: ['Convoy 7', 'Convoy Seven'], factionId: 'concord',
    description: 'Six merchant hulls plus escort CNS Harrowgate. Reactor assemblies and medical stores for Wyre Station.',
    attributes: { escort: 'CNS Harrowgate', hulls: 6, route: ['Hollins Depot', 'Corran Gate', 'Free Port of Kestrel', 'Tessaly Approach', 'Tessaly Gate', 'Mirren Drift', 'Wyre Station'], schedule_bulletins: [day(2, 9), day(12, 9), day(22, 9)], departure: day(29, 6), tessaly_transit_window: [day(31, 2), day(31, 6)] }, confidence: 1 },
  { id: 'org_brightwater', type: 'organization', name: 'Brightwater Hauling', aliases: ['Brightwater'], factionId: 'kestrel',
    description: 'Two-year-old freight company, Kestrel High Docks. Sole director P. Lindqvist. Registered agent at Tallow Row. Runs the Mirren Drift route.',
    attributes: { registered: 'Kestrel High Docks', director: 'Petra Lindqvist', hulls: ['CV Cinder Moth', 'CV Brightwater Tern'] }, confidence: 0.9 },
  { id: 'org_tallow_wick', type: 'organization', name: 'Tallow & Wick Provisions', aliases: ['Tallow and Wick'], factionId: 'cartel',
    description: 'Provisioning company registered at Kestrel Low Docks with no contracts and no warehouse. Assessed Ashen Cartel front.', confidence: 0.6 },
  { id: 'org_ashen_cartel', type: 'organization', name: 'Ashen Cartel', aliases: ['the Cartel'], factionId: 'cartel',
    description: 'Smuggling and arms network based at Ashen Hollow.', confidence: 0.9 },
  { id: 'org_9th_raider', type: 'organization', name: 'Vantor 9th Raider Group', aliases: ['9th Raider Group', 'Ninth Raiders'], factionId: 'hegemony',
    description: 'Hegemony raider formation home-ported at Kessarine. Kessarine-pattern corvettes.', confidence: 0.85 },
  { id: 'org_vantor_hegemony', type: 'organization', name: 'Vantor Hegemony', aliases: ['the Hegemony', 'Vantor Expeditionary Command'], factionId: 'hegemony',
    description: 'Adversary power east of Dusk Gate. Expeditionary Command directs Reach operations from Vantor Bastion.', confidence: 1 },
  { id: 'org_halloway', type: 'organization', name: 'Halloway & Sons Trading', aliases: ['Halloway & Sons', 'Halloway'], factionId: 'kestrel',
    description: 'Licensed salvage broker, Kestrel High Docks. Pending Concord Fleet hull-recovery tender.', confidence: 0.9 },
  { id: 'org_kestrel_port_authority', type: 'organization', name: 'Kestrel Port Authority', aliases: ['KPA'], factionId: 'kestrel',
    description: 'Licensing, manifests, and transponder feed for the Free Port.', confidence: 1 },
  { id: 'org_kestrel_ledger', type: 'organization', name: 'Kestrel Ledger', factionId: 'unaffiliated',
    description: 'Independent Kestrel newspaper.', confidence: 1 },
  { id: 'org_meridian_mutual', type: 'organization', name: 'Meridian Mutual Bank', aliases: ['MMB'], factionId: 'kestrel',
    description: 'Commercial bank with a Kestrel branch; compliance desk shares extracts with Concord.', confidence: 1 },
  { id: 'org_concord_reach_bank', type: 'organization', name: 'Concord Reach Bank', factionId: 'concord',
    description: "Retail bank; Tarn's Landing branch.", confidence: 1 },
  // ---- Vessels ----
  { id: 'ves_cinder_moth', type: 'vessel', name: 'CV Cinder Moth', aliases: ['Cinder Moth'], factionId: 'kestrel',
    description: 'Brightwater Hauling freighter, Kestrel registry. Master O. Kade.', attributes: { registry: 'Kestrel', operator: 'Brightwater Hauling', class: 'light freighter' }, confidence: 0.95 },
  { id: 'ves_brightwater_tern', type: 'vessel', name: 'CV Brightwater Tern', aliases: ['Brightwater Tern'], factionId: 'kestrel',
    description: 'Brightwater Hauling second hull, delivered mid-August.', confidence: 0.9 },
  { id: 'ves_harrowgate', type: 'vessel', name: 'CNS Harrowgate', aliases: ['Harrowgate'], factionId: 'concord',
    description: 'Concord frigate, Convoy 7 escort.', confidence: 1 },
  { id: 'ves_palisade', type: 'vessel', name: 'CNS Palisade', factionId: 'concord', description: 'Concord frigate, Meridian picket.', confidence: 1 },
  { id: 'ves_larkspur', type: 'vessel', name: 'MV Larkspur', aliases: ['Larkspur'], factionId: 'kestrel', description: 'Halloway & Sons salvage vessel.', confidence: 0.9 },
  { id: 'ves_ironvale', type: 'vessel', name: 'VHS Ironvale', aliases: ['Ironvale'], factionId: 'hegemony', description: 'Kessarine-pattern raider corvette, 9th Raider Group.', confidence: 0.85 },
  { id: 'ves_duskwarden', type: 'vessel', name: 'VHS Duskwarden', aliases: ['Duskwarden'], factionId: 'hegemony', description: 'Kessarine-pattern raider corvette, 9th Raider Group.', confidence: 0.85 },
  { id: 'ves_cinderclaw', type: 'vessel', name: 'VHS Cinderclaw', aliases: ['Cinderclaw'], factionId: 'hegemony', description: 'Raider corvette, 9th Raider Group.', confidence: 0.7 },
  // ---- Accounts ----
  { id: 'acc_kmb_4471', type: 'account', name: 'ACC-KMB-4471', factionId: 'kestrel', description: 'Brightwater Hauling operating account, Meridian Mutual Bank, Kestrel.', attributes: { bank: 'Meridian Mutual Bank', holder: 'Brightwater Hauling' }, confidence: 1 },
  { id: 'acc_kmb_9902', type: 'account', name: 'ACC-KMB-9902', factionId: 'cartel', description: 'Tallow & Wick Provisions account, Meridian Mutual Bank. Inbound from Cartel-linked accounts.', attributes: { bank: 'Meridian Mutual Bank', holder: 'Tallow & Wick Provisions' }, confidence: 0.9 },
  { id: 'acc_crb_1187', type: 'account', name: 'ACC-CRB-1187', factionId: 'unaffiliated', description: "Ansel Varro personal account, Concord Reach Bank, Tarn's Landing. Opened 28 JUL.", attributes: { bank: 'Concord Reach Bank', holder: 'Ansel Varro', opened: '2026-07-28' }, confidence: 1 },
  { id: 'acc_kmb_3310', type: 'account', name: 'ACC-KMB-3310', factionId: 'kestrel', description: 'Halloway & Sons Trading account, Meridian Mutual Bank.', attributes: { bank: 'Meridian Mutual Bank', holder: 'Halloway & Sons Trading' }, confidence: 1 },
];

export type RelType = 'member_of' | 'communicates_with' | 'pays' | 'owns' | 'commands' | 'located_at' | 'travels_to' | 'meets_with' | 'associated_with';
export interface RelInput { id: string; source: string; target: string; type: RelType; confidence: number; startAt?: string; endAt?: string; reports: string[]; excerpt?: string; attributes?: Record<string, unknown> }

export const relationships: RelInput[] = [
  // Concord structure
  { id: 'rel_c001', source: 'per_ilsa_varro', target: 'org_logcom', type: 'member_of', confidence: 1, reports: ['R-0003'], excerpt: 'Lt Cmdr I. Varro, Movement Tables Section' },
  { id: 'rel_c002', source: 'per_doss_renley', target: 'org_logcom', type: 'member_of', confidence: 1, reports: ['R-0003'], excerpt: 'Cmdr D. Renley, Convoy Planning' },
  { id: 'rel_c003', source: 'per_ilsa_varro', target: 'loc_meridian_station', type: 'located_at', confidence: 1, reports: ['R-0003'] },
  { id: 'rel_c004', source: 'per_doss_renley', target: 'loc_meridian_station', type: 'located_at', confidence: 1, reports: ['R-0003'] },
  { id: 'rel_c005', source: 'per_ilsa_varro', target: 'per_ansel_varro', type: 'associated_with', confidence: 0.95, reports: ['R-0003'], excerpt: "next of kin: Ansel Varro (brother), Tarn's Landing", attributes: { relation: 'sibling' } },
  { id: 'rel_c006', source: 'per_teodor_mallick', target: 'org_convoy_7', type: 'commands', confidence: 1, reports: ['R-0003', 'R-0068'] },
  { id: 'rel_c007', source: 'ves_harrowgate', target: 'org_convoy_7', type: 'member_of', confidence: 1, reports: ['R-0068'], excerpt: 'escort CNS HARROWGATE' },
  { id: 'rel_c008', source: 'org_convoy_7', target: 'loc_tessaly_gate', type: 'travels_to', confidence: 1, reports: ['R-0068'], startAt: day(31, 2), excerpt: 'Tessaly Gate transit window 31 AUG 0200–0600Z' },
  { id: 'rel_c009', source: 'org_convoy_7', target: 'loc_hollins_depot', type: 'located_at', confidence: 1, reports: ['R-0068'], endAt: day(29, 6) },
  { id: 'rel_c010', source: 'per_sera_okonkwo_vane', target: 'org_logcom', type: 'commands', confidence: 1, reports: ['R-0003'] },
  { id: 'rel_c011', source: 'per_greyfinch', target: 'loc_kestrel', type: 'located_at', confidence: 0.9, reports: ['R-0047'] },
  // Varro's movements and the meeting
  { id: 'rel_c012', source: 'per_ilsa_varro', target: 'loc_kestrel', type: 'travels_to', confidence: 1, reports: ['R-0011'], startAt: day(3), endAt: day(4), excerpt: 'approved leave, Free Port of Kestrel, 03–04 AUG' },
  { id: 'rel_c013', source: 'per_petra_lindqvist', target: 'org_brightwater', type: 'member_of', confidence: 1, reports: ['R-0047', 'R-0060'], excerpt: 'manager and sole director' },
  { id: 'rel_c014', source: 'per_petra_lindqvist', target: 'loc_tallow_row', type: 'located_at', confidence: 0.8, reports: ['R-0047'] },
  { id: 'rel_c015', source: 'per_ilsa_varro', target: 'per_petra_lindqvist', type: 'meets_with', confidence: 0.45, reports: ['R-0047', 'R-0011'], startAt: day(3, 19),
    excerpt: 'PROBABLE MATCH: unnamed Lt Cmdr with logistics pin met Lindqvist 03 AUG (R-0047); Varro, Lt Cmdr Logistics, on Kestrel 03–04 AUG (R-0011)', attributes: { assessed: true, basis: 'description match, not named by source' } },
  // Brightwater structure and money in
  { id: 'rel_c016', source: 'org_brightwater', target: 'loc_kestrel_high_docks', type: 'located_at', confidence: 1, reports: ['R-0023', 'R-0060'] },
  { id: 'rel_c017', source: 'org_brightwater', target: 'ves_cinder_moth', type: 'owns', confidence: 1, reports: ['R-0007'] },
  { id: 'rel_c018', source: 'org_brightwater', target: 'ves_brightwater_tern', type: 'owns', confidence: 1, reports: ['R-0060', 'R-0064'] },
  { id: 'rel_c019', source: 'per_ossian_kade', target: 'ves_cinder_moth', type: 'commands', confidence: 1, reports: ['R-0007'] },
  { id: 'rel_c020', source: 'org_brightwater', target: 'acc_kmb_4471', type: 'owns', confidence: 1, reports: ['R-0023'] },
  { id: 'rel_c021', source: 'org_tallow_wick', target: 'acc_kmb_9902', type: 'owns', confidence: 1, reports: ['R-0023'] },
  { id: 'rel_c022', source: 'org_tallow_wick', target: 'org_brightwater', type: 'pays', confidence: 0.9, reports: ['R-0023'], startAt: day(6), excerpt: '40,000 cr, memo: charter — provisioning run, Gallows' },
  { id: 'rel_c023', source: 'org_tallow_wick', target: 'loc_kestrel_low_docks', type: 'located_at', confidence: 0.9, reports: ['R-0023'] },
  { id: 'rel_c024', source: 'org_ashen_cartel', target: 'org_tallow_wick', type: 'owns', confidence: 0.6, reports: ['R-0023'], excerpt: 'three prior inbound transfers originate from accounts flagged in Cartel-linked reporting', attributes: { assessed: true } },
  { id: 'rel_c025', source: 'org_tallow_wick', target: 'org_halloway', type: 'pays', confidence: 0.9, reports: ['R-0038'], startAt: day(10), excerpt: '18,500 cr, hull recovery, Gallows Reef, lot 14' },
  { id: 'rel_c026', source: 'org_halloway', target: 'acc_kmb_3310', type: 'owns', confidence: 1, reports: ['R-0038'] },
  // Money out to the Varro family
  { id: 'rel_c027', source: 'org_brightwater', target: 'per_ansel_varro', type: 'pays', confidence: 0.9, reports: ['R-0031'], startAt: day(9), excerpt: '12,000 cr, memo: consulting — logistics advisory' },
  { id: 'rel_c028', source: 'per_ansel_varro', target: 'acc_crb_1187', type: 'owns', confidence: 1, reports: ['R-0031'] },
  { id: 'rel_c029', source: 'per_ansel_varro', target: 'loc_tarns_landing', type: 'located_at', confidence: 1, reports: ['R-0031'] },
  // Cartel
  { id: 'rel_c030', source: 'per_marrow_veil', target: 'org_ashen_cartel', type: 'member_of', confidence: 0.8, reports: ['R-0019'], excerpt: 'CARTEL SPEAKER assessed: Ashen Cartel brokerage, Kestrel cell' },
  { id: 'rel_c031', source: 'per_marrow_veil', target: 'loc_kestrel', type: 'located_at', confidence: 0.7, reports: ['R-0019'] },
  { id: 'rel_c032', source: 'per_ivo_draskovic', target: 'org_ashen_cartel', type: 'member_of', confidence: 0.7, reports: ['R-0023'] },
  { id: 'rel_c033', source: 'org_ashen_cartel', target: 'loc_ashen_hollow', type: 'located_at', confidence: 1, reports: ['R-0038'] },
  { id: 'rel_c034', source: 'org_ashen_cartel', target: 'org_vantor_hegemony', type: 'communicates_with', confidence: 0.85, reports: ['R-0019', 'R-0042'], startAt: day(7), excerpt: 'encrypted burst, Cartel-pattern keying, terminus a Hegemony relay east of Dusk Gate' },
  { id: 'rel_c035', source: 'org_brightwater', target: 'per_marrow_veil', type: 'communicates_with', confidence: 0.5, reports: ['R-0042', 'R-0060'], excerpt: "'keep the courier clean' — courier assessed to be a Kestrel-registered freighter", attributes: { assessed: true } },
  // Hegemony
  { id: 'rel_c036', source: 'per_kael_vantor_ruun', target: 'org_9th_raider', type: 'commands', confidence: 0.9, reports: ['R-0077'] },
  { id: 'rel_c037', source: 'org_9th_raider', target: 'org_vantor_hegemony', type: 'member_of', confidence: 1, reports: ['R-0071', 'R-0077'] },
  { id: 'rel_c038', source: 'ves_ironvale', target: 'org_9th_raider', type: 'member_of', confidence: 0.9, reports: ['R-0077'] },
  { id: 'rel_c039', source: 'ves_duskwarden', target: 'org_9th_raider', type: 'member_of', confidence: 0.9, reports: ['R-0077'] },
  { id: 'rel_c040', source: 'ves_cinderclaw', target: 'org_9th_raider', type: 'member_of', confidence: 0.6, reports: ['R-0071'] },
  { id: 'rel_c041', source: 'org_9th_raider', target: 'loc_outpost_threnody', type: 'located_at', confidence: 0.85, reports: ['R-0071'], startAt: day(25) },
  { id: 'rel_c042', source: 'org_9th_raider', target: 'loc_dusk_road', type: 'located_at', confidence: 0.9, reports: ['R-0077'], startAt: day(28) },
  { id: 'rel_c043', source: 'org_9th_raider', target: 'loc_kessarine', type: 'located_at', confidence: 0.9, reports: ['R-0071'], endAt: day(24) },
  { id: 'rel_c044', source: 'per_thessaly_morn', target: 'org_vantor_hegemony', type: 'member_of', confidence: 0.8, reports: ['R-0019'] },
  { id: 'rel_c045', source: 'per_thessaly_morn', target: 'loc_kestrel', type: 'located_at', confidence: 0.8, reports: ['R-0019'] },
  { id: 'rel_c046', source: 'org_vantor_hegemony', target: 'loc_vantor_bastion', type: 'located_at', confidence: 1, reports: ['R-0071'] },
  // Cinder Moth movements
  { id: 'rel_c047', source: 'ves_cinder_moth', target: 'loc_dusk_road', type: 'travels_to', confidence: 0.95, reports: ['R-0007', 'R-0064'], startAt: day(4, 6), excerpt: 'transponder LOST on the Dusk Road, three occasions' },
  { id: 'rel_c048', source: 'ves_cinder_moth', target: 'loc_mirren_drift', type: 'travels_to', confidence: 1, reports: ['R-0007'] },
  // Red-herring branch
  { id: 'rel_c049', source: 'per_doss_renley', target: 'loc_kestrel', type: 'travels_to', confidence: 1, reports: ['R-0049', 'R-0053'], startAt: day(16), endAt: day(17), excerpt: 'TDY Free Port of Kestrel 16–17 AUG, salvage tender negotiation' },
  { id: 'rel_c050', source: 'per_doss_renley', target: 'per_hal_brenner', type: 'meets_with', confidence: 0.9, reports: ['R-0053'], startAt: day(16, 14) },
  { id: 'rel_c051', source: 'per_hal_brenner', target: 'org_halloway', type: 'member_of', confidence: 1, reports: ['R-0053', 'R-0038'], excerpt: 'proprietor' },
  { id: 'rel_c052', source: 'org_halloway', target: 'ves_larkspur', type: 'owns', confidence: 1, reports: ['R-0053'] },
  { id: 'rel_c053', source: 'org_halloway', target: 'loc_kestrel_high_docks', type: 'located_at', confidence: 1, reports: ['R-0053'] },
  { id: 'rel_c054', source: 'org_halloway', target: 'loc_gallows_reef', type: 'travels_to', confidence: 0.9, reports: ['R-0038'], excerpt: 'hull recovery, Gallows Reef, lot 14' },
  // Misc
  { id: 'rel_c055', source: 'per_quill_adeyemi', target: 'org_kestrel_port_authority', type: 'member_of', confidence: 1, reports: ['R-0060'] },
  { id: 'rel_c056', source: 'per_lio_sandoval', target: 'org_kestrel_ledger', type: 'member_of', confidence: 1, reports: ['R-0060'] },
  { id: 'rel_c057', source: 'org_convoy_7', target: 'org_logcom', type: 'member_of', confidence: 1, reports: ['R-0068'] },
  { id: 'rel_c058', source: 'org_convoy_7', target: 'loc_wyre_station', type: 'travels_to', confidence: 1, reports: ['R-0068'] },
];

export type EventType = 'movement' | 'meeting' | 'transaction' | 'communication' | 'sighting' | 'incident';
export interface EventInput { id: string; type: EventType; title: string; description: string; locationId: string; occurredAt: string; confidence: number; factionId: string | null; entityIds: string[]; reports: string[] }

export const events: EventInput[] = [
  { id: 'evt_c001', type: 'meeting', title: 'Concord officer meets Brightwater manager', description: 'Lindqvist meets an unnamed Lt Cmdr (logistics) at a Tallow Row tea house; a data slate changes hands.', locationId: 'loc_tallow_row', occurredAt: day(3, 19), confidence: 0.8, factionId: 'kestrel', entityIds: ['per_petra_lindqvist', 'per_ilsa_varro', 'org_brightwater'], reports: ['R-0047', 'R-0011'] },
  { id: 'evt_c002', type: 'movement', title: 'Cinder Moth transponder gap #1', description: 'CV Cinder Moth dark for 8h30m on the Dusk Road near Hegemony picket range.', locationId: 'loc_dusk_road', occurredAt: day(4, 6, 20), confidence: 0.95, factionId: 'kestrel', entityIds: ['ves_cinder_moth', 'org_brightwater', 'per_ossian_kade'], reports: ['R-0007'] },
  { id: 'evt_c003', type: 'transaction', title: 'Tallow & Wick pays Brightwater 40,000 cr', description: 'Memo: charter — provisioning run, Gallows. No such charter on file.', locationId: 'loc_kestrel_low_docks', occurredAt: day(6, 10), confidence: 0.9, factionId: 'cartel', entityIds: ['org_tallow_wick', 'org_brightwater', 'acc_kmb_9902', 'acc_kmb_4471'], reports: ['R-0023'] },
  { id: 'evt_c004', type: 'communication', title: 'Cartel–Hegemony intercept: "LANTERN has access to movement tables"', description: 'Encrypted burst from Gallows Reef bearing to a Hegemony relay east of Dusk Gate.', locationId: 'loc_gallows_reef', occurredAt: day(7, 23), confidence: 0.85, factionId: 'cartel', entityIds: ['org_ashen_cartel', 'org_vantor_hegemony', 'per_marrow_veil'], reports: ['R-0019'] },
  { id: 'evt_c005', type: 'transaction', title: 'Brightwater pays Ansel Varro 12,000 cr', description: 'Memo: consulting — logistics advisory. Recipient has no business.', locationId: 'loc_tarns_landing', occurredAt: day(9, 11), confidence: 0.9, factionId: 'kestrel', entityIds: ['org_brightwater', 'per_ansel_varro', 'acc_kmb_4471', 'acc_crb_1187'], reports: ['R-0031'] },
  { id: 'evt_c006', type: 'transaction', title: 'Tallow & Wick pays Halloway & Sons 18,500 cr', description: 'Hull recovery, Gallows Reef, lot 14. Consistent with a licensed salvage contract.', locationId: 'loc_kestrel_high_docks', occurredAt: day(10, 9), confidence: 0.9, factionId: 'kestrel', entityIds: ['org_tallow_wick', 'org_halloway', 'acc_kmb_3310'], reports: ['R-0038'] },
  { id: 'evt_c007', type: 'movement', title: 'Cinder Moth transponder gap #2', description: 'Same position band on the Dusk Road; 8h20m dark.', locationId: 'loc_dusk_road', occurredAt: day(14, 7), confidence: 0.95, factionId: 'kestrel', entityIds: ['ves_cinder_moth', 'org_brightwater'], reports: ['R-0064'] },
  { id: 'evt_c008', type: 'communication', title: 'Intercept: "LANTERN confirms schedule receipt; Convoy Seven window firm"', description: 'Second Cartel–Hegemony burst. Threnody named. Second tranche promised by the 20th.', locationId: 'loc_gallows_reef', occurredAt: day(15, 22), confidence: 0.85, factionId: 'cartel', entityIds: ['org_ashen_cartel', 'org_vantor_hegemony', 'org_convoy_7'], reports: ['R-0042'] },
  { id: 'evt_c009', type: 'meeting', title: 'Cmdr Renley visits Halloway & Sons', description: 'Renley and Brenner inspect MV Larkspur at berth 9. Official salvage tender business per leave roster.', locationId: 'loc_kestrel_high_docks', occurredAt: day(16, 14), confidence: 0.9, factionId: 'concord', entityIds: ['per_doss_renley', 'per_hal_brenner', 'org_halloway', 'ves_larkspur'], reports: ['R-0053', 'R-0049'] },
  { id: 'evt_c010', type: 'incident', title: 'Kestrel Ledger: Brightwater expands on thin manifests', description: 'Second hull delivered; declared cargo below break-even; director declines to name clients.', locationId: 'loc_kestrel_high_docks', occurredAt: day(18, 9), confidence: 0.7, factionId: 'unaffiliated', entityIds: ['org_brightwater', 'per_petra_lindqvist', 'ves_brightwater_tern', 'per_lio_sandoval'], reports: ['R-0060'] },
  { id: 'evt_c011', type: 'movement', title: 'Cinder Moth transponder gap #3', description: 'Third gap, same band, 8h10m.', locationId: 'loc_dusk_road', occurredAt: day(24, 6, 55), confidence: 0.95, factionId: 'kestrel', entityIds: ['ves_cinder_moth', 'org_brightwater'], reports: ['R-0064'] },
  { id: 'evt_c012', type: 'sighting', title: 'Three raider hulls at Outpost Threnody', description: 'Kessarine-pattern corvettes at anchorage; none present a week earlier. Fuel lighter traffic above baseline.', locationId: 'loc_outpost_threnody', occurredAt: day(25, 21), confidence: 0.9, factionId: 'hegemony', entityIds: ['org_9th_raider', 'ves_cinderclaw', 'org_vantor_hegemony'], reports: ['R-0071'] },
  { id: 'evt_c013', type: 'sighting', title: 'Seven raider hulls staging on Dusk Road', description: 'Ironvale and Duskwarden resolved. Holding 90,000 km east of Tessaly Gate, no transponders.', locationId: 'loc_dusk_road', occurredAt: day(28, 23, 30), confidence: 0.95, factionId: 'hegemony', entityIds: ['org_9th_raider', 'ves_ironvale', 'ves_duskwarden', 'per_kael_vantor_ruun'], reports: ['R-0077'] },
  { id: 'evt_c014', type: 'movement', title: 'Convoy 7 departs Hollins Depot', description: 'Six merchant hulls plus CNS Harrowgate, bound for Wyre Station via Tessaly Gate.', locationId: 'loc_hollins_depot', occurredAt: day(29, 6), confidence: 1, factionId: 'concord', entityIds: ['org_convoy_7', 'ves_harrowgate', 'per_teodor_mallick'], reports: ['R-0068'] },
  { id: 'evt_c015', type: 'movement', title: 'Varro on leave to Kestrel', description: 'Approved leave 03–04 AUG, civilian transport.', locationId: 'loc_kestrel', occurredAt: day(3, 15), confidence: 1, factionId: 'concord', entityIds: ['per_ilsa_varro'], reports: ['R-0011'] },
  { id: 'evt_c016', type: 'movement', title: 'Renley TDY to Kestrel', description: 'Salvage tender negotiation, 16–17 AUG.', locationId: 'loc_kestrel', occurredAt: day(16, 10), confidence: 1, factionId: 'concord', entityIds: ['per_doss_renley'], reports: ['R-0049'] },
];

export interface ReportInput { id: string; type: 'SIGINT' | 'HUMINT' | 'IMINT' | 'OSINT' | 'FINANCIAL' | 'TRACKING'; title: string; body: string; sourceReliability: string; infoCredibility: number; reportedAt: string; eventAt?: string; links: Array<{ type: 'entity' | 'relationship' | 'event'; id: string; excerpt?: string }> }

const L = (type: 'entity' | 'relationship' | 'event', ids: string[], excerpt = '') => ids.map((id) => ({ type, id, excerpt }));

/** The clue chain and its supporting reports. Hand-written; never regenerated. */
export const canonReports: ReportInput[] = [
  {
    id: 'R-0003', type: 'OSINT', title: 'Personnel index extract — Reach Fleet Logistics Command', sourceReliability: 'A', infoCredibility: 1, reportedAt: day(1, 9),
    body: `CONCORD REACH FLEET — PERSONNEL INDEX EXTRACT (PARTIAL), LOGISTICS COMMAND, MERIDIAN STATION. DTG ${dtg(1, 9)}.
Admiral S. OKONKWO-VANE — commanding, Reach Fleet.
Cmdr D. RENLEY — Convoy Planning. Clearance: convoy scheduling. Next of kin: M. Renley (spouse), Meridian Station.
Lt Cmdr I. VARRO — Movement Tables Section. Clearance: convoy scheduling. Next of kin: Ansel Varro (brother), Tarn's Landing.
Capt T. MALLICK — commanding officer, Convoy 7 (assembling, Hollins Depot).
Lt J. OKAFOR — CNS Palisade, navigation.
[extract ends]`,
    links: [...L('entity', ['per_ilsa_varro', 'per_doss_renley', 'per_teodor_mallick', 'per_sera_okonkwo_vane', 'org_logcom', 'per_ansel_varro', 'org_convoy_7']), ...L('relationship', ['rel_c001', 'rel_c002', 'rel_c003', 'rel_c004', 'rel_c005', 'rel_c006', 'rel_c010'])],
  },
  {
    id: 'R-0011', type: 'OSINT', title: 'Personnel movement circular 26-031', sourceReliability: 'A', infoCredibility: 1, reportedAt: day(4, 10),
    body: `CONCORD REACH FLEET — PERSONNEL MOVEMENT CIRCULAR 26-031. Approved leave and temporary duty, period 02–05 AUG. DTG ${dtg(4, 10)}.
Lt Cmdr I. VARRO, Reach Fleet Logistics Command (Movement Tables Section), Meridian Station — approved leave, Free Port of Kestrel, 03–04 AUG, civilian transport.
Lt J. OKAFOR, CNS Palisade — TDY Caldera Yards 02–05 AUG.
Capt T. MALLICK, Convoy 7 — TDY Hollins Depot 03–05 AUG (convoy work-up).
Ens P. DRUMMOND, Ashford Relay — leave, Vellum Moon, 02–04 AUG.
CPO R. HALE, Hollins Depot — TDY Port Amberly 04 AUG.
[additional entries omitted]`,
    eventAt: day(3, 15),
    links: [...L('entity', ['per_ilsa_varro', 'per_teodor_mallick', 'loc_kestrel']), ...L('relationship', ['rel_c012']), ...L('event', ['evt_c015', 'evt_c001'])],
  },
  {
    id: 'R-0007', type: 'TRACKING', title: 'Vessel track log — CV Cinder Moth, transponder loss on Dusk Road', sourceReliability: 'B', infoCredibility: 2, reportedAt: day(5, 12), eventAt: day(4, 6, 20),
    body: `VESSEL TRACK LOG — Kestrel Port Authority feed, Concord transponder monitoring. DTG ${dtg(5, 12)}.
Vessel: CV CINDER MOTH, Kestrel registry, operator Brightwater Hauling, master O. KADE. Departed Kestrel High Docks 03 AUG 2210Z, declared destination Mirren Drift, cargo "general".
Track: Tessaly Approach 04 AUG 0340Z; Tessaly Gate transit 04 AUG 0515Z; transponder LOST 04 AUG 0620Z at approx lon 12.1 lat 0.4 on the Dusk Road; transponder REACQUIRED 04 AUG 1450Z at approx lon 9.8 lat 1.1, westbound. Gap duration 8h30m. Vessel arrived Mirren Drift 05 AUG 0900Z.
Note: the gap position is well east of the declared route and within 60,000 km of Hegemony picket range at Dusk Gate. Master reported "transponder fault" on arrival. No inspection.`,
    links: [...L('entity', ['ves_cinder_moth', 'org_brightwater', 'per_ossian_kade', 'loc_dusk_road', 'loc_tessaly_gate', 'loc_mirren_drift']), ...L('relationship', ['rel_c017', 'rel_c019', 'rel_c047', 'rel_c048']), ...L('event', ['evt_c002'])],
  },
  {
    id: 'R-0047', type: 'HUMINT', title: 'Source GREYFINCH — Concord officer meets Brightwater manager, Tallow Row', sourceReliability: 'B', infoCredibility: 2, reportedAt: day(5, 18), eventAt: day(3, 19),
    body: `SOURCE REPORT — Source GREYFINCH (Kestrel-based, access to port-district commerce; reporting history reliable, 11 prior reports, 9 corroborated). DTG ${dtg(5, 18)}. Reported 05 AUG on events of 03 AUG evening, Tallow Row, Kestrel.
Source observed PETRA LINDQVIST, known to source as the manager of Brightwater Hauling, in a rear booth of the Cinder Lamp tea house with a woman in Concord civilian travel clothes carrying a Fleet-issue document case. Source overheard the woman addressed once as "Commander" and once, corrected, as "Lieutenant Commander". Source noted a logistics branch pin on the document case strap.
The two spoke for approximately forty minutes; the woman passed a data slate across the table, which Lindqvist did not return. Source could not obtain a name. Source assesses the woman was not a regular on Tallow Row.
Handler comment: Concord personnel on approved leave to Kestrel during 02–05 AUG should be checked against this description.`,
    links: [...L('entity', ['per_petra_lindqvist', 'org_brightwater', 'per_greyfinch', 'loc_tallow_row']), ...L('relationship', ['rel_c013', 'rel_c014', 'rel_c015', 'rel_c011']), ...L('event', ['evt_c001'])],
  },
  {
    id: 'R-0019', type: 'SIGINT', title: 'Intercept — Cartel/Hegemony: source LANTERN has access to movement tables', sourceReliability: 'A', infoCredibility: 2, reportedAt: day(8, 11, 30), eventAt: day(7, 23),
    body: `INTERCEPT SUMMARY — Collector: Concord Signals Station ASHFORD RELAY. DTG ${dtg(8, 11, 30)}. Intercept 07 AUG 2300Z.
Link: encrypted burst, Cartel-pattern keying, origin bearing consistent with GALLOWS REEF, terminus a Hegemony relay east of DUSK GATE. Participants: CARTEL SPEAKER (assessed: Ashen Cartel brokerage, Kestrel cell) and HEGEMONY SPEAKER (assessed: Vantor Expeditionary Command liaison, possibly the Kestrel envoy).
Gist: CARTEL SPEAKER states that "LANTERN has access to movement tables and can provide the western product on a rolling basis". HEGEMONY SPEAKER asks for "the Seven series specifically" and offers "the usual rate plus a completion bonus if the window holds". CARTEL SPEAKER: "The courier runs two days after each update. Payment through the provisions account as before."
Analyst comment: "movement tables" is Concord LOGCOM terminology for convoy scheduling data. "Seven series" unresolved. "Provisions account" unresolved; see FINANCIAL reporting on Kestrel accounts. Source LANTERN not previously seen in Reach traffic.`,
    links: [...L('entity', ['org_ashen_cartel', 'org_vantor_hegemony', 'per_marrow_veil', 'per_thessaly_morn', 'loc_ashford_relay', 'loc_gallows_reef', 'loc_dusk_gate']), ...L('relationship', ['rel_c030', 'rel_c031', 'rel_c034', 'rel_c044', 'rel_c045']), ...L('event', ['evt_c004'])],
  },
  {
    id: 'R-0023', type: 'FINANCIAL', title: 'Transaction record — Tallow & Wick Provisions to Brightwater Hauling, 40,000 cr', sourceReliability: 'B', infoCredibility: 2, reportedAt: day(8, 16), eventAt: day(6, 10),
    body: `TRANSACTION RECORD — Meridian Mutual Bank, Kestrel branch, compliance extract. DTG ${dtg(8, 16)}. Transaction date 06 AUG.
From: ACC-KMB-9902, holder TALLOW & WICK PROVISIONS (registered Kestrel Low Docks, provisioning and ship's stores; beneficial ownership not filed).
To: ACC-KMB-4471, holder BRIGHTWATER HAULING (registered Kestrel High Docks, freight).
Amount: 40,000 cr. Memo: "charter — provisioning run, Gallows".
Compliance note: Tallow & Wick has no recorded provisioning contracts and no warehouse lease; three prior inbound transfers to ACC-KMB-9902 originate from accounts flagged in Cartel-linked reporting (signatory I. Draskovic on two). Brightwater Hauling's declared manifests for the period show no Gallows Reef charter. Flagged for analyst review; no enforcement action at this time.`,
    links: [...L('entity', ['org_tallow_wick', 'org_brightwater', 'acc_kmb_9902', 'acc_kmb_4471', 'org_ashen_cartel', 'per_ivo_draskovic', 'org_meridian_mutual', 'loc_kestrel_low_docks', 'loc_kestrel_high_docks']), ...L('relationship', ['rel_c016', 'rel_c020', 'rel_c021', 'rel_c022', 'rel_c023', 'rel_c024', 'rel_c032']), ...L('event', ['evt_c003'])],
  },
  {
    id: 'R-0031', type: 'FINANCIAL', title: 'Transaction record — Brightwater Hauling to Ansel Varro, 12,000 cr', sourceReliability: 'B', infoCredibility: 2, reportedAt: day(11, 14), eventAt: day(9, 11),
    body: `TRANSACTION RECORD — Meridian Mutual Bank, compliance extract. DTG ${dtg(11, 14)}. Transaction date 09 AUG.
From: ACC-KMB-4471, holder BRIGHTWATER HAULING (Kestrel).
To: ACC-CRB-1187, holder ANSEL VARRO, Concord Reach Bank, Tarn's Landing branch.
Amount: 12,000 cr. Memo: "consulting — logistics advisory".
Compliance note: Ansel Varro has no registered business, no prior commercial receipts, and no known connection to freight. ACC-CRB-1187 was opened 28 JUL. Account holder is listed in the Concord civil register as resident of Tarn's Landing. Cross-reference: the surname Varro appears in the Concord Reach Fleet personnel index; relationship to the account holder not established by this extract. Flagged.`,
    links: [...L('entity', ['org_brightwater', 'per_ansel_varro', 'acc_kmb_4471', 'acc_crb_1187', 'org_concord_reach_bank', 'loc_tarns_landing']), ...L('relationship', ['rel_c027', 'rel_c028', 'rel_c029']), ...L('event', ['evt_c005'])],
  },
  {
    id: 'R-0038', type: 'FINANCIAL', title: 'Transaction record — Tallow & Wick Provisions to Halloway & Sons, 18,500 cr', sourceReliability: 'B', infoCredibility: 3, reportedAt: day(12, 10), eventAt: day(10, 9),
    body: `TRANSACTION RECORD — Meridian Mutual Bank, compliance extract. DTG ${dtg(12, 10)}. Transaction date 10 AUG.
From: ACC-KMB-9902, holder TALLOW & WICK PROVISIONS.
To: ACC-KMB-3310, holder HALLOWAY & SONS TRADING (Kestrel, salvage and brokerage, licensed).
Amount: 18,500 cr. Memo: "hull recovery, Gallows Reef, lot 14".
Compliance note: Halloway & Sons holds a valid Kestrel Port Authority salvage license and filed a recovery manifest for Gallows Reef lot 14 on 04 AUG (two derelict hulls, cargo of scrap alloy). Payment is consistent with a legitimate salvage contract. Counterparty ACC-KMB-9902 is separately flagged. Retained for pattern analysis.`,
    links: [...L('entity', ['org_tallow_wick', 'org_halloway', 'acc_kmb_9902', 'acc_kmb_3310', 'loc_gallows_reef', 'org_ashen_cartel', 'per_hal_brenner']), ...L('relationship', ['rel_c025', 'rel_c026', 'rel_c033', 'rel_c051', 'rel_c054']), ...L('event', ['evt_c006'])],
  },
  {
    id: 'R-0042', type: 'SIGINT', title: 'Intercept — Cartel/Hegemony: LANTERN confirms schedule receipt, Convoy Seven window firm', sourceReliability: 'A', infoCredibility: 2, reportedAt: day(16, 19, 15), eventAt: day(15, 22),
    body: `INTERCEPT SUMMARY — Collector: ASHFORD RELAY. DTG ${dtg(16, 19, 15)}. Intercept 15 AUG 2200Z. Same link pairing as prior Cartel–Hegemony burst traffic (ref R-0019).
Gist: CARTEL SPEAKER: "LANTERN confirms schedule receipt. Convoy Seven window firm, gate transit end of month, escort one frigate." HEGEMONY SPEAKER: "Threnody will be ready. Keep the courier clean; no gaps longer than needed." CARTEL SPEAKER: "Second tranche to the provisions account by the twentieth."
Analyst comment: "Convoy Seven" assessed to be CONCORD CONVOY 7. "Threnody" correlates with OUTPOST THRENODY, a Hegemony forward facility one jump east of Tessaly Gate. "Gate transit" with a single frigate escort matches Convoy 7's known composition (CNS HARROWGATE). "Courier" and "gaps" suggest a vessel deliberately breaking transponder contact. Recommend cross-reference with TRACKING reporting on Kestrel-registered freighters.`,
    links: [...L('entity', ['org_ashen_cartel', 'org_vantor_hegemony', 'org_convoy_7', 'loc_outpost_threnody', 'loc_tessaly_gate', 'ves_harrowgate', 'org_brightwater']), ...L('relationship', ['rel_c034', 'rel_c035']), ...L('event', ['evt_c008'])],
  },
  {
    id: 'R-0049', type: 'OSINT', title: 'Personnel movement circular 26-044', sourceReliability: 'A', infoCredibility: 1, reportedAt: day(17, 9), eventAt: day(16, 10),
    body: `CONCORD REACH FLEET — PERSONNEL MOVEMENT CIRCULAR 26-044. Approved leave and temporary duty, period 15–18 AUG. DTG ${dtg(17, 9)}.
Cmdr D. RENLEY, Reach Fleet Logistics Command (Convoy Planning), Meridian Station — TDY Free Port of Kestrel 16–17 AUG. Purpose: salvage tender negotiation, Halloway & Sons Trading.
Capt T. MALLICK, Convoy 7 — Hollins Depot, continuing.
Lt J. OKAFOR, CNS Palisade — returned Meridian 15 AUG.
Ens P. DRUMMOND, Ashford Relay — duty.
[additional entries omitted]`,
    links: [...L('entity', ['per_doss_renley', 'org_halloway', 'loc_kestrel']), ...L('relationship', ['rel_c049']), ...L('event', ['evt_c016', 'evt_c009'])],
  },
  {
    id: 'R-0053', type: 'HUMINT', title: 'Source GREYFINCH — Cmdr Renley at Halloway & Sons offices', sourceReliability: 'B', infoCredibility: 3, reportedAt: day(17, 11), eventAt: day(16, 14),
    body: `SOURCE REPORT — Source GREYFINCH. DTG ${dtg(17, 11)}. Reported 17 AUG on events of 16 AUG, Kestrel High Docks.
Source observed a Concord officer in uniform, rank tabs of a full Commander, name tape RENLEY, entering the offices of Halloway & Sons Trading at approximately 1400 local and leaving at 1620 local in the company of HAL BRENNER, the proprietor. The two were seen inspecting the salvage vessel MV LARKSPUR at berth 9. Source did not overhear substantive conversation.
Handler comment: Cmdr D. Renley, Convoy Planning, is on the Fleet leave roster for Kestrel 16–17 AUG. Halloway & Sons is a licensed salvage contractor with a pending Fleet hull-recovery tender. Contact may be official. Flag for deconfliction.`,
    links: [...L('entity', ['per_doss_renley', 'per_hal_brenner', 'org_halloway', 'ves_larkspur', 'per_greyfinch', 'loc_kestrel_high_docks']), ...L('relationship', ['rel_c049', 'rel_c050', 'rel_c051', 'rel_c052', 'rel_c053']), ...L('event', ['evt_c009'])],
  },
  {
    id: 'R-0060', type: 'OSINT', title: 'Kestrel Ledger — Brightwater Hauling adds second hull, tight-lipped on clients', sourceReliability: 'C', infoCredibility: 3, reportedAt: day(18, 9),
    body: `KESTREL LEDGER — "Brightwater Hauling adds second hull, tight-lipped on clients", by Lio Sandoval. ${dtg(18, 9)}.
Brightwater Hauling, a two-year-old freight outfit at the High Docks, has taken delivery of a second freighter, the Brightwater Tern, and expanded its berth lease, despite manifests filed with the Port Authority that this paper has reviewed showing declared cargo well below break-even for the route it runs to Mirren Drift.
Manager Petra Lindqvist declined to name the company's clients, saying only that "the Reach rewards discretion". Port Master Quill Adeyemi said Brightwater's filings were "in order, if thin". Brightwater's original hull, the Cinder Moth, has twice reported transponder faults on the Mirren run this month, according to a dock worker who asked not to be named.
Company registration lists a sole director, P. Lindqvist, and a registered agent at Tallow Row.`,
    links: [...L('entity', ['org_brightwater', 'per_petra_lindqvist', 'ves_brightwater_tern', 'ves_cinder_moth', 'per_quill_adeyemi', 'per_lio_sandoval', 'org_kestrel_ledger', 'org_kestrel_port_authority', 'loc_kestrel_high_docks']), ...L('relationship', ['rel_c013', 'rel_c016', 'rel_c018', 'rel_c035', 'rel_c055', 'rel_c056']), ...L('event', ['evt_c010'])],
  },
  {
    id: 'R-0068', type: 'OSINT', title: 'Convoy routing bulletin — Convoy 7 (final)', sourceReliability: 'A', infoCredibility: 1, reportedAt: day(23, 11), eventAt: day(29, 6),
    body: `CONCORD REACH FLEET — CONVOY ROUTING BULLETIN, CONVOY 7 (FINAL). Issued 22 AUG by Reach Fleet Logistics Command. DTG ${dtg(23, 11)}.
Convoy 7, Captain T. Mallick commanding, escort CNS HARROWGATE (frigate), six merchant hulls. Cargo: reactor assemblies and medical stores for Wyre Station.
Route: Hollins Depot — Corran Gate — Free Port of Kestrel (no stop) — Tessaly Approach — Tessaly Gate — Mirren Drift — Wyre Station.
Departure Hollins Depot 29 AUG 0600Z. Tessaly Gate transit window 31 AUG 0200–0600Z.
Distribution: LOGCOM Movement Tables Section, Convoy Planning, Escort Command. This is the third and final schedule bulletin for Convoy 7 (prior bulletins: 02 AUG, 12 AUG).`,
    links: [...L('entity', ['org_convoy_7', 'per_teodor_mallick', 'ves_harrowgate', 'org_logcom', 'loc_hollins_depot', 'loc_corran_gate', 'loc_kestrel', 'loc_tessaly_gate', 'loc_mirren_drift', 'loc_wyre_station']), ...L('relationship', ['rel_c006', 'rel_c007', 'rel_c008', 'rel_c009', 'rel_c057', 'rel_c058']), ...L('event', ['evt_c014'])],
  },
  {
    id: 'R-0064', type: 'TRACKING', title: 'Vessel track log — CV Cinder Moth, consolidated transponder losses', sourceReliability: 'B', infoCredibility: 2, reportedAt: day(25, 13), eventAt: day(24, 6, 55),
    body: `VESSEL TRACK LOG — consolidated, Concord transponder monitoring. DTG ${dtg(25, 13)}.
Vessel: CV CINDER MOTH, Brightwater Hauling. Ref prior gap 04 AUG (R-0007). Two further transponder losses recorded:
(1) 14 AUG 0700Z–1520Z, LOST at lon 11.9 lat 0.6 on the Dusk Road, REACQUIRED westbound.
(2) 24 AUG 0655Z–1505Z, LOST at lon 12.3 lat 0.2, REACQUIRED westbound.
All three gaps occur at the same position band, all on eastbound legs declared for Mirren Drift, all logged as "transponder fault". Pattern: three gaps at ten-day intervals (04, 14, 24 AUG), each beginning approximately 48 hours after a departure from Kestrel; no other Kestrel-registered freighter shows gaps in this band. Brightwater's second hull, CV BRIGHTWATER TERN, shows no anomalies.
Assessment: deliberate dark running consistent with a courier or dead-drop pattern near Hegemony space. Recommend correlation with any periodic Concord-side trigger.`,
    links: [...L('entity', ['ves_cinder_moth', 'org_brightwater', 'ves_brightwater_tern', 'loc_dusk_road']), ...L('relationship', ['rel_c018', 'rel_c047']), ...L('event', ['evt_c007', 'evt_c011'])],
  },
  {
    id: 'R-0071', type: 'IMINT', title: 'Imagery — three raider hulls at Outpost Threnody', sourceReliability: 'A', infoCredibility: 1, reportedAt: day(26, 8), eventAt: day(25, 21),
    body: `IMAGERY OBSERVATION — Platform: Concord survey drone NORTHWATCH-3, high-orbit pass over the Tessaly Gate eastern approach, 25 AUG 2100Z. DTG ${dtg(26, 8)}.
Target: OUTPOST THRENODY, Hegemony forward facility. Observed three (3) raider-class hulls at anchorage, configuration consistent with the Vantor 9th Raider Group's Kessarine-pattern corvettes. Two hulls show active drive plumes; one under tender. No hulls observed at Threnody on the 18 AUG pass. Also observed: fuel lighter traffic between Threnody and Dusk Gate, above baseline.
Assessment: forward staging of a raider element within one jump of Tessaly Gate. Change from last: +3 hulls. Confidence high on count, moderate on unit attribution.`,
    links: [...L('entity', ['org_9th_raider', 'org_vantor_hegemony', 'ves_cinderclaw', 'loc_outpost_threnody', 'loc_tessaly_gate', 'loc_dusk_gate', 'loc_northwatch_beacon', 'loc_kessarine', 'loc_vantor_bastion']), ...L('relationship', ['rel_c037', 'rel_c040', 'rel_c041', 'rel_c043', 'rel_c046']), ...L('event', ['evt_c012'])],
  },
  {
    id: 'R-0077', type: 'IMINT', title: 'Imagery — seven raider hulls staging on Dusk Road toward Tessaly Gate', sourceReliability: 'A', infoCredibility: 1, reportedAt: day(29, 10), eventAt: day(28, 23, 30),
    body: `IMAGERY OBSERVATION — Platform: NORTHWATCH-3, 28 AUG 2330Z, Dusk Road corridor between Dusk Gate and the Tessaly Gate eastern approach. DTG ${dtg(29, 10)}.
Observed seven (7) raider-class hulls in loose column formation, westbound at low burn, plus one tender. Hull markings on two vessels resolved: VHS IRONVALE and VHS DUSKWARDEN, both previously attributed to the 9th Raider Group under Strategos Vantor-Ruun. Formation is holding station approximately 90,000 km east of Tessaly Gate, outside Kestrel Port Authority sensor coverage. No transponders.
Assessment: a raider group of at least seven hulls is positioned to interdict traffic transiting Tessaly Gate within the next 72 hours. Change from last: +4 hulls, moved forward from Threnody. Confidence high.`,
    links: [...L('entity', ['org_9th_raider', 'ves_ironvale', 'ves_duskwarden', 'per_kael_vantor_ruun', 'loc_dusk_road', 'loc_tessaly_gate', 'loc_dusk_gate']), ...L('relationship', ['rel_c036', 'rel_c038', 'rel_c039', 'rel_c042']), ...L('event', ['evt_c013'])],
  },
];

/** Words the noise generator must never emit (case-insensitive substring). */
export const FORBIDDEN_IN_NOISE = ['lantern', 'varro', 'renley', 'brightwater', 'lindqvist', 'kade', 'cinder moth', 'tallow & wick', 'tallow and wick', 'greyfinch', 'movement tables', 'threnody'];

/** Expected answers for the eval suite live in tests/evals; this is the demo question. */
export const DEMO_QUESTION = 'Who is LANTERN, and what are they enabling?';
