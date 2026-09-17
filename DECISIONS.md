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
