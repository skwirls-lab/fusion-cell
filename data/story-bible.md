# The Meridian Reach — Story Bible

Fictional setting for Fusion Cell seed data. Original universe; no names, places, or
imagery from existing franchises. **Everything in this file is invented.**

The machine-readable source of truth is `scripts/seed/canon.ts`. This document explains
the design so a human can review the clue plan before data is generated.

---

## 1. Setting

The **Meridian Reach** is a frontier star cluster at the edge of settled space. Coordinates
are stored as lon/lat inside a fixed box (lon −30…30, lat −20…20) so a real basemap could
replace the starfield later.

- **West** (lon −30…−8): Concord Alliance core — Meridian Station, the shipyards, depots.
- **Centre** (lon −3…8): the Free Port of Kestrel and the approaches to **Tessaly Gate**.
- **East** (lon 10…30): Vantor Hegemony space beyond Dusk Gate.
- **South** (lat < −10): Cartel territory — Ashen Hollow, Gallows Reef, the smuggling notches.
- **North**: unaffiliated pilgrim stations and survey posts.

Scenario window: **30 days**, `2026-08-01` (day 1) → `2026-08-30` (day 30). The hidden
threat lands on **day 31** (`2026-08-31`), outside the data — the analyst has to infer it.

## 2. Factions

| id | Faction | Colour | Role |
|---|---|---|---|
| `concord` | Concord Alliance | cyan `#22d3ee` | The home side. Analysts work for Concord Reach Fleet. |
| `hegemony` | Vantor Hegemony | crimson `#ef4444` | Expansionist adversary probing westward through Dusk Gate. |
| `cartel` | Ashen Cartel | amber `#f59e0b` | Smuggling and arms network. Sells to anyone. |
| `kestrel` | Free Port of Kestrel | violet `#a78bfa` | Neutral trade hub. Heavy traffic, thin oversight. |
| `unaffiliated` | Unaffiliated | gray `#9ca3af` | Merchants, pilgrims, salvagers, media. |

## 3. The truth (what actually happened)

**Lt. Cmdr. Ilsa Varro**, a Concord logistics officer at Meridian Station with access to
convoy movement tables, is source **LANTERN**. She passes convoy schedules to
**Petra Lindqvist**, manager of **Brightwater Hauling** — a shell shipping company on
Kestrel. Brightwater's freighter **CV Cinder Moth** (captain **Ossian Kade**) carries the
schedules physically to a dead-drop near **Dusk Gate**, going dark on transponder each time.
The **Ashen Cartel** (broker **Marrow Veil**, financier **Ivo Draskovic**) pays Brightwater
through a front called **Tallow & Wick Provisions**, and resells the schedules to the
**Vantor Hegemony**. Brightwater pays Varro through her brother **Ansel Varro**'s account,
labelled "consulting". The Hegemony's **9th Raider Group** (Strategos **Kael Vantor-Ruun**)
is staging at **Outpost Threnody** and along **Dusk Road** to ambush **Concord Convoy 7**
(Captain **Teodor Mallick**, escort **CNS Harrowgate**) as it transits **Tessaly Gate** on
**day 31**.

### Chain the analyst must reconstruct

```
Ilsa Varro ──(sibling)── Ansel Varro ◄──(pays, "consulting")── Brightwater Hauling
                                                                     ▲
                                                    (pays) Tallow & Wick Provisions
                                                                     ▲
                                                             (owns) Ashen Cartel
                                                                     │
                                                    (communicates_with) Vantor Hegemony
                                                                     │
                                                          (commands) 9th Raider Group
                                                                     │
                                                          (located_at) Outpost Threnody / Tessaly Gate
```

Shortest graph path Varro → Hegemony is **4 hops**:
`Ilsa Varro → Ansel Varro → Brightwater Hauling → Tallow & Wick → Ashen Cartel → Vantor Hegemony`
is 5; but Brightwater also has a direct `communicates_with` edge to Marrow Veil (Cartel),
and Marrow Veil `member_of` Ashen Cartel, and the Cartel `communicates_with` the Hegemony.
The canonical demo path (verified by `check-seed`) is:
**Ilsa Varro → Brightwater Hauling → Ashen Cartel → Vantor Hegemony** (3 hops) via the
`meets_with` edge Varro→Lindqvist folded to Varro→Brightwater (HUMINT R-0047), Brightwater
→Cartel (`pays`, R-0023), Cartel→Hegemony (`communicates_with`, R-0019).

### Red herrings (each has ≥2 supporting reports, or it isn't a red herring)

- **Cmdr. Doss Renley** — Concord convoy planner. Also had schedule access. Also visited
  Kestrel (day 16). Was there to negotiate a salvage contract with Halloway & Sons on
  behalf of Fleet. Innocent.
- **Halloway & Sons Trading** (owner **Hal Brenner**) — legitimate salvage broker. Received a
  Cartel payment (day 10) for a genuine hull-recovery contract at Gallows Reef. Innocent.

Discriminators the analyst should find:
- HUMINT R-0047 describes a **Lt. Cmdr.** with **logistics** insignia on **day 3**. Personnel
  movement log R-0011 places Varro (Lt. Cmdr., Logistics) on Kestrel days 3–4. Renley is a
  **Cmdr.** in **Planning** and was on Kestrel **day 16** (R-0049, R-0053).
- Brightwater's transponder gaps (R-0007, R-0064) fall **48h after** each Concord schedule
  bulletin (days 2, 12, 22 — stored as an attribute on the Convoy 7 entity, not in any
  report). Halloway's vessel has no gaps.
- Money reaches a **Varro** account (R-0031). Nothing reaches Renley.

## 4. Timeline of true events

| Day | Event | Evidence |
|---|---|---|
| 2 | Concord LOGCOM schedule bulletin #1 | Convoy 7 attributes |
| 3 | Varro meets Lindqvist, Tallow Row, Kestrel | R-0047 (HUMINT), R-0011 (movement log) |
| 4 | Cinder Moth transponder gap near Dusk Gate | R-0007 |
| 6 | Tallow & Wick → Brightwater, 40,000 cr | R-0023 |
| 7 | Cartel↔Hegemony intercept: "LANTERN has access to movement tables" | R-0019 |
| 9 | Brightwater → Ansel Varro, 12,000 cr "consulting" | R-0031 |
| 10 | Cartel → Halloway & Sons, 18,500 cr (salvage, legitimate) | R-0038 |
| 12 | Schedule bulletin #2 | Convoy 7 attributes |
| 14 | Cinder Moth gap #2 | R-0064 |
| 15 | Intercept: "LANTERN confirms schedule receipt; Convoy Seven window firm" | R-0042 |
| 16 | Renley on Kestrel; meets Brenner at Halloway offices | R-0049, R-0053 |
| 18 | Kestrel Ledger: Brightwater expands fleet on thin manifests | R-0060 |
| 22 | Schedule bulletin #3 — Convoy 7 final: depart day 29, Tessaly transit day 31 | R-0068 |
| 24 | Cinder Moth gap #3 | R-0064 |
| 25 | IMINT: 3 raider hulls at Outpost Threnody | R-0071 |
| 28 | IMINT: 7 hulls staging on Dusk Road toward Tessaly | R-0077 |
| 29 | Convoy 7 departs Hollins Depot | R-0068 |
| **31** | **Projected ambush at Tessaly Gate** | *not in data* |

## 5. Hand-written reports

Twelve clue reports plus three supporting reports are written by hand in `canon.ts`.
`check-seed.ts` asserts each exists and contains its required keyword. Report numbers are
scattered among the noise so nothing is findable by number.

| # | Report | Type | Day | Must contain | Role |
|---|---|---|---|---|---|
| 1 | R-0019 | SIGINT | 8 | `LANTERN`, `movement tables` | Introduces the codename |
| 2 | R-0042 | SIGINT | 16 | `LANTERN`, `Convoy Seven` | Ties LANTERN to the schedule |
| 3 | R-0023 | FINANCIAL | 8 | `Brightwater Hauling`, `Tallow & Wick` | Money in (Cartel front) |
| 4 | R-0031 | FINANCIAL | 11 | `Brightwater Hauling`, `Ansel Varro` | Money out (family account) |
| 5 | R-0038 | FINANCIAL | 12 | `Halloway & Sons`, `Tallow & Wick` | Red herring |
| 6 | R-0007 | TRACKING | 5 | `Cinder Moth`, `transponder` | First gap |
| 7 | R-0064 | TRACKING | 25 | `Cinder Moth`, `transponder`, `48` | Cadence |
| 8 | R-0047 | HUMINT | 5 | `Lindqvist`, `Lieutenant Commander`, `logistics` | The meeting |
| 9 | R-0053 | HUMINT | 17 | `Renley`, `Halloway` | Red herring |
| 10 | R-0071 | IMINT | 26 | `Tessaly Gate`, `raider` | The threat |
| 11 | R-0077 | IMINT | 29 | `Tessaly Gate`, `Ironvale` | Escalation |
| 12 | R-0060 | OSINT | 18 | `Brightwater` | Corroboration |
| S1 | R-0011 | OSINT | 4 | `Varro`, `Kestrel` | Personnel movement log (Varro) |
| S2 | R-0049 | OSINT | 17 | `Renley`, `Kestrel` | Personnel movement log (Renley) |
| S3 | R-0068 | OSINT | 23 | `Convoy 7`, `Tessaly Gate` | Convoy routing bulletin |

**Constraints the noise generator must obey**
- The word `LANTERN` (any case) appears in exactly two reports: R-0019 and R-0042.
  No location, vessel, or phrase in the noise may contain it.
- No noise report may mention Varro, Renley, Brightwater, Lindqvist, Kade, Cinder Moth,
  Tallow & Wick, Ansel Varro, or Tessaly Gate in a way that implies wrongdoing. Neutral
  mentions of Kestrel, Convoy 7, and Tessaly Gate as a place are fine and desirable.
- Noise is genuinely irrelevant: routine port traffic, unrelated incidents, pilgrim
  movements, salvage disputes, Hegemony diplomatic posturing, Cartel activity elsewhere.

## 6. Named entities (canon)

**People** — Ilsa Varro (LANTERN), Ansel Varro, Doss Renley, Teodor Mallick, Sera
Okonkwo-Vane, Petra Lindqvist, Ossian Kade, Marrow Veil, Ivo Draskovic, Kael Vantor-Ruun,
Thessaly Morn, Hal Brenner, Quill Adeyemi, Lio Sandoval, source GREYFINCH.

**Organisations** — Concord Reach Fleet Logistics Command, Concord Convoy 7, Brightwater
Hauling, Tallow & Wick Provisions, Ashen Cartel, Vantor Hegemony 9th Raider Group, Vantor
Expeditionary Command, Halloway & Sons Trading, Kestrel Port Authority, Kestrel Ledger,
Meridian Mutual Bank.

**Vessels** — CV Cinder Moth, CV Brightwater Tern, CNS Harrowgate, CNS Palisade, MV
Larkspur (Halloway), VHS Ironvale, VHS Duskwarden, VHS Cinderclaw.

**Accounts** — ACC-KMB-4471 (Brightwater operating), ACC-KMB-9902 (Tallow & Wick),
ACC-CRB-1187 (Ansel Varro), ACC-KMB-3310 (Halloway & Sons).

**Locations (42)** — see `canon.ts`. Key ones: Meridian Station (−22, 6), Hollins Depot
(−14, 4), Corran Gate (−10, 1), Free Port of Kestrel (0, 0), Tallow Row (0.2, −0.5),
Tessaly Gate (6, −2), Dusk Gate (16, 0), Outpost Threnody (13, 3), Vantor Bastion (24, 3),
Ashen Hollow (−4, −15), Gallows Reef (2, −16).

## 7. Report formats

Every report has: header line, DTG (`DDHHMMZ AUG 26`), source reliability (Admiralty
A–F), information credibility (1–6), body. Every report carries the marking
`EXERCISE – FICTIONAL DATA`.

- **SIGINT** — intercept summary: collector, link, participants (codenamed), gist.
- **HUMINT** — source report: source codename, reliability history, what was observed.
- **IMINT** — imagery observation: platform, target, count, disposition, change from last.
- **OSINT** — in-universe media, port notices, personnel circulars.
- **FINANCIAL** — transaction record: from account, to account, amount, memo, bank.
- **TRACKING** — vessel track log: transponder id, waypoints, gaps.

## 8. Demo question and expected answer

> **"Who is LANTERN, and what are they enabling?"**

A correct answer (a) names **Ilsa Varro** as the likely LANTERN, (b) traces
Varro → Brightwater → Ashen Cartel → Hegemony with citations, (c) warns of a **Hegemony
raider ambush on Convoy 7 at Tessaly Gate around day 31**, (d) states confidence in
estimative language, (e) names Renley/Halloway as considered-and-discounted alternatives,
and (f) names gaps (no direct intercept of Varro; Kade's role inferred).
