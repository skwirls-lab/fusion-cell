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
