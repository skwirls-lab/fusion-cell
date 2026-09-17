# Decisions Log

## 2026-09-17

**D1 — DB password URL-encoding.** The Supabase password contains `@`. In a
Postgres URI an unescaped `@` makes the parser read the
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

**D23 — Scenario replay is the timeline cursor writing `filters.to`.** No admin
release endpoint, no server clock: the scrubber (`src/components/timeline`) sets
the shared cutoff and every view that already honours the filters is cut off there.
Pushes are quantized to a 2-hour grid and throttled to ~3/s; `useEvents`/`useReports`
keep the previous page while a step loads so the map never blanks mid-replay.
"Replay from day 1" rewinds and plays in one click (the demo moment); the top-bar
clock follows the cursor while a cutoff is active.

**D24 — Watchlist and alerts live in localStorage,** not the `watchlist`/`alerts`
tables the PRD sketches: one shared password means one user, and a client store
(`src/stores/watchlist.ts`) keeps the feature honest without a schema change.
Alerts are keyed `(report, entity)` and never fire twice; a rewind or a reset to
live re-takes the feed's "seen" baseline so jumping back to now alerts on nothing.

**D25 — Motion audit (PRD §8):** feed glow, map/graph AI pulses and the path
sequence already existed and were gated; added a 160ms tab fade, a 200ms drawer
collapse, a toast slide-in and a 250ms grow-in for map events revealed by the
replay. All collapse under `prefers-reduced-motion`; the cursor then steps on
the 2-hour grid instead of moving per frame.

**D26 — A dependency-free twin of the smoke test, `scripts/smoke-model-raw.mjs`.** This
session could reach OpenRouter but not the npm registry (B3), so `smoke-model.ts` (openai
SDK, zod, dotenv) could not even load. The twin runs the same five checks against the same
endpoint with Node's fetch and hand-parsed SSE, needs nothing installed, and is what a
human should run first from any machine. It is explicitly *not* the P0.2 gate: it does
not exercise `src/lib/ai/provider.ts`. Both scripts now try `OPENROUTER_MODEL` as given,
then with the `deepseek/` vendor prefix (OpenRouter's `/models` lists
`deepseek/deepseek-v4-flash-0731`, not the bare id from D4), then three fallbacks that
were confirmed present in `/models` on 2026-09-17. The env template and README carry the
prefixed id. The key check in `check-env.ts` rejects non-ASCII or short keys because the
one failure actually observed was a key pasted from a redacted display.

## 2026-09-17 — laptop session: first contact with the real model

**D27 — The model passed Phase 0 unchanged; thinking is switched off by default.**
`npm run smoke:model` passed all five checks on the first candidate,
`deepseek/deepseek-v4-flash-0731` (tool loop: 3 calls, answer 42; 69 stream chunks), so no
substitution was made. What the smoke test cannot show is latency under a real investigation:
with the model's default thinking, one eval question took 3–13 minutes (LANTERN 182 s and 273 s,
Renley 796 s), almost all of it reasoning tokens between tool calls. With
`reasoning: { enabled: false }` the same questions take 25–150 s at the same pass rate (10/12
before any fix). `low` effort was no faster in practice and produced one empty final answer.
The provider therefore sends thinking-off unless `OPENROUTER_REASONING` says otherwise
(`default` hands the choice back to the model). This is a request parameter, not a prompt change.

**D28 — Eval scoring gained a judged rubric on the three judgment questions.** D15 predicted
this. With the real model the substring scorer was wrong in both directions on
`renley-herring` within an hour: it FAILED an answer for containing "Renley is the leak"
inside "no evidence that Renley is the leak", and it PASSED an answer whose bottom line was
"Renley is the leading candidate … involvement: likely" because the word "official" appeared.
`lantern`, `renley-herring` and `halloway-herring` now also carry
`rubric: { mustConclude, mustNotConclude }`, graded by a separate no-tools call that sees only
question, rubric and answer. The judge was calibrated against the known-wrong answer (3/3
FAIL). A judge error or unparseable verdict fails the question. `renley-herring`'s
`mustNotClaim` substrings were removed because the honest answer to that question naturally
contains them negated; every other substring criterion stays, and LANTERN keeps all of its
own. Every run now writes answers and traces to `.evals/` (gitignored).

**D29 — Fixes made in BUILD.md's diagnosis order, none of them prompt edits.**
(a) *Search surfacing.* `search_reports("Doss Renley")` returned nothing: `plainto_tsquery`
ANDs terms and the reports only ever say "Cmdr Renley". The tool now returns every-term
matches first and backfills with any-term matches (flagged `some_terms`); the HTTP search
API is unchanged. Snippets are the lines that matched the query rather than the first 300
characters, which for most reports is the DTG header — R-0049's exculpatory "Purpose:
salvage tender negotiation" was cut off. Reports already returned in the conversation come
back as one-line stubs with a `new_reports` count, and an identical repeated tool call gets
a pointer to the earlier result instead of the payload (the model re-ran the same
`get_entity` four times in one investigation).
(b) *Step cap.* Kept at 8. Added a wall-clock budget (200 s of tool turns in chat, 150 s in
briefs) after which the loop forces the final answer; agent routes declare
`maxDuration = 300`.
(c) *Seed.* Read R-0049/R-0053 against the failure: the evidence is there and adequately
strong (R-0053's handler comment says the contact may be official). No seed change.
Also found live and fixed: a silent stream hung a request for over 10 minutes (60 s stall
guard, one retry if nothing was yielded); a caller abort ended the stream quietly and read
as a finished empty turn (now throws); the forced final answer came back empty once and once
began with half of the nudge text (the nudge is now a user turn, and an empty answer is
asked for once more); answers cited as `(R-0053)` or bare `R-0053` produced no chips and —
worse — escaped citation validation entirely (all report numbers are normalised to
`[R-xxxx]` before validation, so a fabricated unbracketed number is now caught).

**D30 — Review round 3 (end of Phases 5 and 7, fresh-context reviewer).** No faked data:
feed rows, timeline density and citation chips were traced to `reports`/`events` rows through
the HTTP API; every `page.route` in `e2e/` fulfils a 500 and is then removed. Fixed before
the commit: (H1) `normalizeCitations` skipped a number that shared its brackets with other
text — `[R-9999, para 2]`, `[see R-9998]`, `R-9999]` reached neither the chip renderer nor
the validator; every report number not already exactly `[R-dddd]` is now wrapped, and briefs
normalise before stripping. (H2) a tool turn that overran its 150 s deadline had yielded
nothing, so it was retried for another 150 s, past `maxDuration`; an overrun is never
retried, every call is capped to what is left (`deadlineMs`), an overrun during a tool turn
ends the investigation with `limit: time` instead of failing the request, and the final
answer is capped by a hard stop (285 s chat; briefs finish evidence by 200 s so structuring
fits). (M1) `renley-herring` got back four substrings a negation rarely wraps. (M2) only
successful tool calls are remembered as duplicates. (M3) both SSE routes abort the run from
`ReadableStream.cancel()` as well as `req.signal`. (L1) `--only` and `--rejudge` runs say
they are not the gate. Accepted: the judge is the same model that answers (pin a stronger
one with a second provider if the evals ever matter beyond this demo); `get_entity` /
`find_paths` mark report numbers as seen, so a later search stubs a report whose snippet the
model never saw (it can still `get_report` it); the help overlay has no focus trap.

**D31 — Playwright runs on its own port (3187) and reads `APP_PASSWORD` from `.env.local`.**
On the laptop `:3000` belongs to an unrelated Express app that answers 200 on `/api/health`;
with `reuseExistingServer` Playwright adopted it and every login 404ed. `check-api` and
`check-auth` take `E2E_BASE_URL`.

**D32 — `vercel.json` pins `"framework": "nextjs"`.** The Vercel project was imported when the
repo held only BUILD.md and the PRD, so the preset was not Next.js and every production
build failed inside a minute. Could not read the build log (CLI not logged in); the
hypothesis was tested by pushing the pin, and the next deployment succeeded.

**D33 — Phase 7 states and shortcuts.** Shared `Skeleton` / `EmptyState` / `ErrorState` in
`src/lib/client/chips.tsx` were extended (test ids, retry, a way out of an empty state)
rather than adding a new component. All bindings live in `src/lib/client/shortcuts.ts`,
which also renders the `?` overlay. Escape closes one layer per press: help → open menu →
report reader → blur the field → clear the selection. Not done: a loading/error state on
the alerts dropdown (it reads a local store), arrow-key map panning after `M`, and
Ctrl+Enter no longer sends in the analyst box (plain Enter does). A failed feed poll still
replaces the rows with the error state until the next poll.
