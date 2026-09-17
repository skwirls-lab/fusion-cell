# Decisions Log

## 2026-09-17

**D1 — DB password URL-encoding.** The Supabase password contains `@`
(`zk2dw3h@JC87`). In a Postgres URI an unescaped `@` makes the parser read the
password as the start of the hostname. Encoded as `%40` in `DATABASE_URL`.
Silent-failure class; worth knowing if the string is ever retyped by hand.

**D2 — Seed generation will be deterministic, not LLM-generated.** The PRD assumed
a script that calls a model to write 300 reports. Templated generation from the
story bible with a seeded RNG is better here: free, instant, reproducible across
reseeds, and it cannot drift the clue chain. The 12 clue reports are hand-written
regardless. This also removes OpenRouter from the critical path for Phase 2,
which matters while B1 stands.

**D3 — Scripts load `.env.local` via `scripts/_env.ts`.** Matches what Next.js
reads, so there is one env file rather than two that can disagree.

**D4 — `deepseek-v4-flash-0731` accepted on the human's direct experience.** They
report daily production use with reliable tool calls. Not independently verified
(B1). Phase 0's smoke test remains the gate before any agent code is written.

**D5 — The graph holds only what reports state; the demo path is 5 hops, not 3.** The
PRD's `Varro → Brightwater → Cartel → Hegemony` is an *assessed* conclusion, not
evidence. Seeding it would put the answer in the graph before the analyst finds it.
The seeded evidence path is `Ilsa Varro → Ansel Varro (sibling, R-0003) → Brightwater
(pays, R-0031) → Tallow & Wick (pays, R-0023) → Ashen Cartel (owns, assessed, R-0023)
→ Vantor Hegemony (communicates_with, R-0019)`. One deliberately low-confidence
"probable match" edge exists (Varro `meets_with` Lindqvist, 0.45, flagged
`assessed: true`) because that is what an entity resolver would produce from
R-0047 + R-0011. `find_paths` excludes location hubs as intermediates and defaults
to `maxHops=6`. The AI's job is to *propose* the 3-hop assessed edge, not read it.

**D6 — PGlite for local dev and every test.** Real Postgres compiled to WASM, in
process, from npm. Same migration SQL, same Drizzle queries as Supabase. This is
what let Phases 1–3 be *verified* (not just written) with no network:
`check-schema`, `check-seed`, `check-api`, `check-auth`, the shell e2e and 20 unit
tests all ran against it. `DB_DRIVER=pglite` selects it; production uses `pg`.

**D7 — No shadcn/ui.** Its CLI fetches component sources over the network. Plain
Tailwind 4 with `@theme` tokens covers everything the PRD's visual language needs.

**D8 — Sandbox blocks process-kill commands.** Any Bash call containing
`pkill`/`kill` exits 144 silently, taking the whole call with it. Dev servers are
started as harness background tasks and stopped with the harness's TaskStop. Not an
application concern; recorded so the next session doesn't re-discover it.

**D9 — Nine analyst tools.** The eight in BUILD.md §9 plus `compute_centrality`
(PRD §7). It is cheap (Brandes over ~440 edges) and it is the tool that answers
"who is the broker", which the LANTERN question needs.

**D10 — A "step" is one provider turn that executed tool calls.** Parallel calls
in one turn share a step. After 8 steps, one more call is allowed; if the model
still wants tools, that request is dropped, a `limit` event is emitted, and a final
tools-disabled call with a system nudge produces an answer. The user always gets an
answer; the UI shows the limit notice.

**D11 — Final-answer tokens are buffered per turn.** Narration the model emits
before a tool call is never shown as the answer. Cost: no live token streaming
until the final turn (the trace streams live instead). Revisit once a real model is
in the loop — some models narrate usefully, some don't.

**D12 — `isNetworkBlocked` matches the proxy's wording, not bare 403.** OpenRouter
uses 403 for real permission errors; treating any 403 as "network blocked" would
hide a bad key behind exit 3. Only the egress proxy's "not in allowlist", CONNECT/
tunnel failures, 407, and socket errors count.

**D13 — Seed loading lives in `src/lib/db/seed.ts`.** Factored out of the script so
the agent-loop unit tests run against the *real* seed in an in-memory PGlite, not a
fixture. The 11 agent tests exercise real tools over real data with a scripted model.

**D14 — Review round 1 (end of Phases 4+5).** A fresh-context reviewer found no
fabricated data and no critical defects, and three gates that passed for weaker
reasons than their names: feed order never asserted; map→graph highlight satisfied by
the clicked node alone; eval scorer accepting a hedged denial. All three were fixed
before the phase commit, as §4 requires. Accepted as-is, deliberately:
- The three always-on suggested prompts in the analyst panel are scenario copy
  ("Who is LANTERN…"). They are UI text for this dataset, not displayed data. If the
  seed changes, change them.
- Scenario epoch (2026-08-01) and the filter window bounds are story-bible constants.
- `__fusionMap` / `__fusionCy` test seams are stripped in production, so `e2e/` runs
  against `next dev`, not the deployed URL. The DoD's deploy check is `/api/health`.
- Stop now aborts the HTTP stream (L8 fixed), so a stopped turn stops billing.

**D15 — LANTERN eval requires "Ilsa Varro" by name and fails on hedged denials.**
"Varro" alone matched Ansel; "there is no evidence Ilsa Varro is LANTERN" passed
every substring criterion. `mustMentionAny` now needs Ilsa specifically and
`mustNotClaim` lists the denial phrasings. Substring scoring is still crude; the
right fix once a real model runs is an LLM-judged rubric on the Bottom line section.

**D16 — Briefs use a markdown textarea + react-markdown preview, not Tiptap.** The PRD
asks for a rich-text editor; Tiptap is not installed and cannot be in this build (no
network). Markdown is what the model drafts and what the print route renders, so the
analyst edits the export format directly. `[R-xxxx]` chips in the preview open the
report reader. Swap in a rich-text editor later by round-tripping the same markdown.

**D17 — A brief is "run the analyst, then structure the answer".** `draftBrief` reuses
`runAgent` verbatim for evidence (or a hand-over answer from the chat panel), then makes
one no-tools JSON call validated by Zod with one retry. The citation rule is the
analyst's: a number may appear only if a tool returned it in that run (read from the
tool messages in the transcript) and it exists; everything else is stripped and listed
in `strippedCitations`. Step A's own invalid citations are removed from the analysis
before the structuring call so a fabricated number cannot be laundered into the brief.

**D18 — Print export renders markdown to HTML with a tiny in-house converter.**
`react-dom/server` inside an App Router route handler resolves to the react-server
stub, so `renderToStaticMarkup` is not an option there. The converter covers exactly
the subset `renderBriefMarkdown` emits (plus what an analyst types: headings, lists,
bold/em/code) and escapes everything first. The stylesheet (`src/app/print.css`) is
inlined by reading the file at request time; a compact fallback with the same
banner/@page rules is embedded in case a serverless bundle omits the file.

**D19 — `POST /api/briefs/manual` is a dev-only seam (404 in production).** The real
model is unreachable here (B1), so the e2e spec inserts a brief row through the seam
and verifies list, editor, versioning, preview chips → reader, print HTML and delete.
It skips generation entirely; the pipeline is verified by tests/unit/brief with a
scripted model over the real seed. Real-model drafting has not been exercised.

**D20 — Review round 2 (end of Phase 6).** No critical findings. Trust boundaries
held: the dev-only `manual` seams compile to dead code under `next build`
(`process.env.NODE_ENV` is inlined), the print export escapes before every
markdown pass, commit is one transaction with full rollback. Fixed before this
commit: duplicate decision indices multiplied rows; unbounded decision arrays;
`</report>` could close the extraction frame; same-name/different-type matches
preselected the wrong entity and commit accepted wrong-type links; invalid
citations rendered as normal chips in briefs; ingested reports stamped `now` and
pushed the scenario clock to day 48. Report numbers are now allocated under
`pg_advisory_xact_lock` — invisible on PGlite (single connection), real on Postgres.

**D21 — Ingested `reported_at` is analyst-set, defaulting to `event_at ?? now`.**
Never clamped: a fabricated timestamp would silently mis-order the feed. The
review header has a "Reported at" field; the scenario clock stays at day 30
after an ingest in the e2e.

**D22 — Ingest job CRUD lives in `src/lib/ingest/jobs.ts`,** not `queries.ts`, to
keep the shared-file surface small while two agents appended to `queries.ts`.
