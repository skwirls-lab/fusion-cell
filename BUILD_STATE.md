# Build State

Last updated: 2026-09-17T22:30Z (laptop session)
Current phase: ALL PHASES DONE. Definition of Done met except one item that needs the human:
verifying the deployed URL (Vercel CLI not logged in; deployment is behind Vercel SSO).
Model in use: `deepseek/deepseek-v4-flash-0731` (verified Phase 0, first candidate, no substitution),
thinking off by default (D27).
Blocked: no. B1–B4 from the remote sandbox do not apply on the laptop and are closed.

## Laptop session summary (2026-09-17)
- P0.1d check-env PASS (Postgres 17.6 reachable, 445 models, configured model listed). P0.2 smoke-model PASS 5/5.
- Offline gates re-run green on this machine: tsc, next build, vitest, PGlite seed + check-seed.
- **P5 GATE GREEN against the real model:** run-evals 10/12 then 11/12 (after review fixes), LANTERN
  passing both times, under a stricter scorer than the one the gate was written with (D28).
  What it took is in D27–D30; none of it was a prompt edit.
- e2e with the real model, no seams: P5.4 / P5.6 / P5.7 (`e2e/analyst.spec.ts`), Phase 6 ingest
  extraction → review → commit and brief drafting (`e2e/model.spec.ts`).
- Supabase: `migrate` applied 0001 + 0002, `seed:load` 169 / 441 / 80 / 165; `check-schema` and
  `check-seed` PASS on driver `pg`. (The public schema was empty beforehand.)
- Vercel: CLI not installed / not logged in, so deploy-by-CLI and env vars were skipped as
  instructed. The repo's Git integration had been failing every production build; pinning the
  framework in `vercel.json` fixed it (D32) and the deployment for HEAD reports success. Its
  `/api/health` could not be checked from here: all project URLs redirect to Vercel SSO.
- Phase 7 finished: empty/loading/error states on every panel, shortcut audit (D33).
- Review round 3 by a fresh subagent: no faked data; H1 H2 M1 M2 M3 L1 fixed (D30).

## Phase 0 — Preflight  [DONE]
- [x] P0.1a Credentials written to .env.local (DB password `@` encoded as %40)   attempts: 1
- [x] P0.1b .env.local gitignored                                              attempts: 1
- [x] P0.1c scripts/check-env.ts                                               attempts: 2
- [x] P0.1d check-env.ts passes (laptop)                                       attempts: 1
      note: now also rejects non-ASCII/short keys and unprefixed model ids (the exact failures seen)
- [x] P0.2  scripts/smoke-model.ts — 5/5 on deepseek/deepseek-v4-flash-0731     attempts: 2 (1 blocked in the sandbox, 1 on the laptop)
      note: `scripts/smoke-model-raw.mjs` (D26) runs the same 5 checks with zero deps; ran here →
      exit 2 on the placeholder key. With a fake ASCII key the request reaches OpenRouter (401),
      so the transport works; only the credential is missing.
- [x] P0.3  Ledgers + CLAUDE.md (Next 16 auto-generates CLAUDE.md → AGENTS.md)  attempts: 1

## Phase 1 — Foundation  [DONE; deployed health check needs the human]
- [x] P1.1 Next 16 scaffold, `next build` green                                attempts: 3
      note: duplicate viewport key in playwright.config; generic constraint in check-seed
- [x] P1.2 Schema + migration — check-schema PASS (PGlite)                     attempts: 1
- [x] P1.3 Password proxy — check-auth 6/6                                     attempts: 1 (subagent)
- [x] P1.4 /api/health real DB round-trip                                      attempts: 1 (subagent)
- [x] P1.5 App shell + banners — e2e/shell.spec.ts 1/1, zero console errors    attempts: 1 (subagent)
- [~] P1.6 Vercel deploy + env vars                                            build fixed (D32), deployment = success; env vars and the /api/health check need `vercel login` (KNOWN_ISSUES)

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

## Phase 5 — AI analyst  [DONE]
- [x] P5.1 provider (OpenRouter + ScriptedProvider)                            attempts: 1 (subagent)
- [x] P5.2 nine tools over queries.ts, Zod→JSON schema, seen-report tracking   (D9)
- [x] P5.3 agent loop, 8-step cap, forced final answer, audit transcript       (D10, D11)
- [x] P5.4 POST /api/analyst/chat SSE — transport verified live (error event streams as well-formed SSE)
- [x] P5.5 citation validation: seen-set ∩ exists-in-DB; invalid flagged        unit-tested
- [x] P5.6 highlight_in_ui → `ui` event → store.aiHighlights                   unit-tested
- [x] P5.7 AnalystPanel: trace, chips → reader, invalid chips, prefill, Stop    browser-checked with canned SSE
- [x] Unit: tests/unit/ai 19/19 over the REAL seed in in-memory PGlite (50/50 total)
- [x] P5 GATE: run-evals 10/12, then 11/12 after review fixes; LANTERN passing   attempts: 2
      attempt 1: hung >10 min on a silent stream (no stall guard) with the model's default thinking; killed
      attempt 2: thinking off + search/snippet/duplicate/citation fixes + judged rubric → PASS
- [x] e2e for P5.4/5.6/5.7 with the real model: e2e/analyst.spec.ts 3/3        attempts: 2 (the reader overlay intercepted a click in the spec)

## Decisions deferred to the human
- `vercel login`, set env vars, lift Deployment Protection (or add a domain), check `/api/health`.
- Choose a real `APP_PASSWORD` for the deployment; rotate the Supabase DB password (KNOWN_ISSUES).

## Anti-thrash log
- P0.1c/2: dotenv path — root-caused, no thrash.
- P2.2/2: density — measured, targeted fix.
- P2 gate/2: case-sensitive keyword check + zero-participant IMINT events — both real.
- Dev-server runs/4: exit 144 traced to kill commands, not the server (D8).
- P5 gate/2: attempt 1 hung; diagnosed by timing each turn (thinking tokens), then BUILD.md's order: search surfacing (found: ANDed FTS, header snippets) → step cap (kept; time budget added) → seed (read, adequate). No prompt edits.
- e2e model specs/2: both failures were in the specs (a locator that cannot see input values; a click under the reader overlay), not the app. One brief draft hung once at "Structuring" and did not reproduce; bounded anyway (output cap + per-call deadline).

## Phase 6 — Ingest and briefs  [DONE]
- [x] Prep: `briefs` table + migration 0002, check-schema updated, reseed truncates briefs, nav → real links
- [x] P6.1 POST /api/ingest: one structured call, Zod, retry-once, typed ExtractionError   unit (ScriptedProvider)
- [x] P6.2 matching: exact/alias → initials-aware token overlap → trigram; link/create/discard   unit: "I. Varro"→Ilsa, Ansel never matches Ilsa
- [x] P6.3 review UI with per-row decisions, ?job= resume, file upload                 e2e
- [x] P6.4 one-transaction commit; R-0081 appears in feed, profile, map (+1 marker), graph (+1 node)   e2e
- [x] P6.5 briefs: draftBrief (runAgent evidence → structuring call → deterministic markdown), citation stripping, editor, versions, print HTML with banners   unit 11, e2e 6
- [x] /reports (sort/filter/FTS/pagination), /entities, /admin (reseed + stats)        e2e
- [x] Review round 2 (§4): H1 H2 M1 M2 M3 M4 M5 L4 fixed (D20, D21); L1 L2 L3 L5 L6 verified fine
- [x] Gates: tsc; vitest 89/89; playwright 22/22 (zero console errors); next build
- note: each model-facing flow has a dev-only `manual` seam (404 in production) so the human-review
  half is e2e-tested deterministically; real-model extraction and drafting are covered by e2e/model.spec.ts (2/2).
- reported_at is now analyst-set in the review header, default event_at ?? now (D21)

## Phase 7 — Polish  [DONE]
- [x] Timeline scrubber + replay (MAP-7, §5.5): density strip, play/pause, 1×/4×/12×, reset, replay from day 1, Space toggle, reduced-motion stepping; clock follows the cursor (D23)   unit 5, e2e 3
- [x] Watchlist + alerts (§5.10): profile star, feed detection on arrival/replay, toasts, bell badge + dropdown, localStorage (D24)   unit 4, e2e 1
- [x] Motion audit (§8): tab fade, drawer collapse, toast slide-in, replayed markers grow in; all reduced-motion gated (D25)
- [x] Gates: tsc; vitest 98/98; playwright 26/26 (zero console errors); next build
- [x] Empty/loading/error states on every panel; keyboard shortcut audit + `?` overlay (D33)   unit 16, e2e 4 (subagent)
- [x] Gates (final): tsc; vitest 139/139; playwright 35/35 (zero console errors); next build

## Definition of Done (BUILD.md §10) — final status
- [x] `npm run build` exits 0 (also from a clean `git archive` checkout with no env file)
- [x] `npx vitest run` — 139/139
- [x] `npx playwright test` — 35/35, five of them against the real model, zero console errors
- [x] `check-seed` PASS on PGlite and on Supabase (`pg`)
- [x] `check-api` 20/20 · `check-auth` PASS · `check-schema` PASS (both drivers)
- [x] `run-evals` — 11/12 (previous run 10/12), LANTERN passing
- [~] Deployed URL serves the app behind the password — Vercel reports the deployment for HEAD
      as successful; the URL is behind Vercel SSO and the CLI is not logged in, so neither the
      password page nor `/api/health` could be fetched. **Needs the human** (KNOWN_ISSUES).
- [x] Every UI value traces to a database row — third fresh-context review (D30): feed rows,
      timeline density and citation chips traced to rows; e2e intercepts only simulate failures
- [x] Ledgers current
- [x] No secrets in git — history scanned for OpenRouter keys, JWTs and credentialed Postgres
      URLs: none; `.env.local` never committed. Standing exception: the DB password quoted in
      062ec3a (KNOWN_ISSUES). **Rotate it.**

## Resume instructions
1. `npx vercel login`, then `npx vercel env ls` — add what the README table lists that is missing
   (Production + Preview). `OPENROUTER_REASONING` can stay unset.
2. Lift Deployment Protection for Production or add a domain; `curl <url>/api/health` should show
   `driver: "pg"`, 169 entities, 80 reports, the model id.
3. Ask the deployed analyst the LANTERN question once; it should answer in under two minutes.
4. `DB_DRIVER=pglite npm run evals` is the Phase 5 gate (about 12 minutes, a few cents).
   `npx playwright test` runs everything on port 3187, real-model specs included.
