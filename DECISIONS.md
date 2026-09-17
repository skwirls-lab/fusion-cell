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
