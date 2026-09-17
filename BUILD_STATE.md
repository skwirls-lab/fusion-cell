# Build State

Last updated: 2026-09-17T18:00Z
Current phase: 6 (ingest + briefs) in progress via two subagents; model gates blocked
Model configured: deepseek-v4-flash-0731 (**unverified**, see B1)
**Blocked: partially — B1 (network) blocks P0.2 smoke test, P1.6 deploy, and Phase 5 evals.
Everything else proceeds against in-process PGlite.**

## BLOCKER — B1: session cannot reach OpenRouter or Supabase
Unchanged. See KNOWN_ISSUES.md. Resolution needs the human: allowlist the hosts for
this environment, or run the network-gated phases from a laptop.

## Phase 0 — Preflight  [PARTIAL]
- [x] P0.1a Credentials written to .env.local (DB password `@` encoded as %40)   attempts: 1
- [x] P0.1b .env.local gitignored                                              attempts: 1
- [x] P0.1c scripts/check-env.ts                                               attempts: 2
- [ ] P0.1d check-env.ts passes                                                BLOCKED B1
- [ ] P0.2  scripts/smoke-model.ts — model tool-calling verified               BLOCKED B1 (script not yet written)
- [x] P0.3  Ledgers + CLAUDE.md (Next 16 auto-generates CLAUDE.md → AGENTS.md)  attempts: 1

## Phase 1 — Foundation  [DONE except deploy]
- [x] P1.1 Next 16 scaffold, `next build` green                                attempts: 3
      note: duplicate viewport key in playwright.config; generic constraint in check-seed
- [x] P1.2 Schema + migration — check-schema PASS (PGlite)                     attempts: 1
- [x] P1.3 Password proxy — check-auth 6/6                                     attempts: 1 (subagent)
- [x] P1.4 /api/health real DB round-trip                                      attempts: 1 (subagent)
- [x] P1.5 App shell + banners — e2e/shell.spec.ts 1/1, zero console errors    attempts: 1 (subagent)
- [ ] P1.6 Vercel deploy + env vars                                            BLOCKED B1 (human: Vercel auto-deploys on push; env vars must be set in the Vercel project — list in README)

## Phase 2 — Data  [DONE]
- [x] P2.1 data/story-bible.md                                                 attempts: 1
- [x] P2.2 scripts/generate-seed.ts → data/seed/*.json (deterministic, no LLM) attempts: 3
      note: first pass under-dense (249 rels / 72 events); pattern-of-life pass added
- [x] P2.3 scripts/seed-db.ts (wipe-and-load in one transaction)               attempts: 1
- [x] P2.4 16 hand-written reports in scripts/seed/canon.ts                    attempts: 1
- [x] P2 gate: check-seed PASS — 169 entities / 441 rels / 80 reports / 165 events;
      LANTERN → exactly R-0019, R-0042; evidence path 5 hops; 0 forbidden-word leaks

## Phase 3 — API  [DONE]
- [x] P3.1–P3.6 all routes + queries.ts + Zod validation                       attempts: 1 (subagent)
- [x] Unit: tests/unit/queries.test.ts 11/11, graph.test.ts 9/9
- [x] P3 gate: check-api 20/20 against live dev server on seeded PGlite        attempts: 2
      note: path default maxHops 4→6 (D5)

## Phase 4 — Views  [DONE]
- [x] P4.1 selection/filter/highlight store + client select helpers           unit: 11 tests
- [x] P4.2 map: deck.gl scatter/line/text over starfield, real picking         e2e: ≥40 markers (203)
- [x] P4.3 link chart: Cytoscape cose, faction colours, type shapes            e2e: ≥20 nodes (116, locations hidden by default)
- [x] P4.4 cross-highlight both directions via shared adjacency                e2e: canvas click on Kestrel → ≥2 lit incl. Ilsa Varro; chart click → map rings
- [x] P4.5 entity profile: attributes, grouped connections + report chips, timeline, reports
- [x] P4.6 feed, 3s polling, newest-first ASSERTED, report reader with inline entity marks
- [x] P4.7 filters wired (faction filter drops 203→58 in e2e); global search; shortcuts; URL sync
- [x] Review round 1 (§4): H1 H2 H3 M1 M3 M4 L2 L3 L5 L6 fixed; M5 L1 L7 accepted (D14)
- [x] P4 gate: e2e/views.spec.ts 8/8 + shell 1/1, zero console errors         attempts: 2

## Phase 5 — AI analyst  [BUILT; model gates BLOCKED B1]
- [x] P5.1 provider (OpenRouter + ScriptedProvider)                            attempts: 1 (subagent)
- [x] P5.2 nine tools over queries.ts, Zod→JSON schema, seen-report tracking   (D9)
- [x] P5.3 agent loop, 8-step cap, forced final answer, audit transcript       (D10, D11)
- [x] P5.4 POST /api/analyst/chat SSE — transport verified live (error event streams as well-formed SSE)
- [x] P5.5 citation validation: seen-set ∩ exists-in-DB; invalid flagged        unit-tested
- [x] P5.6 highlight_in_ui → `ui` event → store.aiHighlights                   unit-tested
- [x] P5.7 AnalystPanel: trace, chips → reader, invalid chips, prefill, Stop    browser-checked with canned SSE
- [x] Unit: tests/unit/ai 19/19 over the REAL seed in in-memory PGlite (50/50 total)
- [x] scripts/smoke-model.ts written — exits 3 here (network)                  BLOCKED B1
- [x] scripts/run-evals.ts written — exits 3 here (network)                    BLOCKED B1
- [ ] P5 GATE: run-evals ≥9/12 with LANTERN passing                            BLOCKED B1 — **the real model has never been called**
- [ ] e2e for P5.4/5.6/5.7 with a real model (testids are in place)            BLOCKED B1

## Decisions deferred to the human
- Where to run the network-gated gates (allowlist here vs laptop). See B1.

## Anti-thrash log
- P0.1c/2: dotenv path — root-caused, no thrash.
- P2.2/2: density — measured, targeted fix.
- P2 gate/2: case-sensitive keyword check + zero-participant IMINT events — both real.
- Dev-server runs/4: exit 144 traced to kill commands, not the server (D8).

## Phase 6 — Ingest and briefs  [IN_PROGRESS]
- [x] Prep: `briefs` table + migration 0002, check-schema updated, reseed truncates briefs, nav → real links
- [ ] P6.1 POST /api/ingest extraction (single structured call, Zod, retry-once)     subagent
- [ ] P6.2 entity matching (exact/alias → initials-aware → similarity)                subagent
- [ ] P6.3 review UI: link / create / discard per extraction                          subagent
- [ ] P6.4 commit in one transaction; appears on map/graph                            subagent
- [ ] P6.5 briefs: draft via runAgent + structuring call; editor; versions; print     subagent
- [ ] /reports, /entities list pages; /admin reseed + stats                           subagent
- note: real-model extraction/drafting cannot be exercised here (B1); each flow gets a
  dev-only `manual` seam (404 in production) so review/commit/edit UIs are e2e-tested honestly.
