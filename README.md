# Fusion Cell

All-source intelligence workspace over a fictional dataset (the Meridian Reach):
an operational map, a link chart, a live report feed, and a tool-using AI analyst
that cites its sources. **Every screen carries `EXERCISE – FICTIONAL DATA`. Nothing
here is real.**

`BUILD.md` is the build spec and ledger; `docs/PRD.md` is the product vision;
`data/story-bible.md` explains the dataset and the hidden storyline.

## Run it locally (no accounts needed)

```bash
npm install
cp .env.example .env.local        # set APP_PASSWORD and OPENROUTER_API_KEY
DB_DRIVER=pglite npm run seed:load   # in-process Postgres, seeded in ~300ms
DB_DRIVER=pglite npm run dev         # http://localhost:3000
```

`DB_DRIVER=pglite` runs real Postgres (PGlite, WASM) inside the Node process at
`.pglite/dev`. Nothing else to install. Everything except the AI analyst works
offline; the analyst needs `OPENROUTER_API_KEY`.

## Verify the model before trusting the analyst

```bash
npm run smoke:model     # tool-calling / streaming / JSON checks against OpenRouter
npm run evals           # 12 scenario questions incl. "Who is LANTERN?"; needs ≥ 9/12
```

## Gates (what "done" means)

```bash
npm run typecheck && npm run build
npm test                # unit: graph algorithms, queries, agent loop (fake provider)
npm run check:schema    # migrations applied, every table/column present
npm run check:seed      # clue chain present + findable; provenance integrity
npm run check:auth      # password gate behaves (needs dev server on :3000)
npm run check:api       # every endpoint live, schema-valid, non-empty (dev server)
npm run test:e2e        # Playwright: shell + views
```

## Deploy (Vercel + Supabase, free tiers)

1. **Supabase**: create a project. Run migrations against it once:
   `DATABASE_URL=<session pooler url> npm run migrate && npm run seed:load`
   (use the *session pooler* connection string, port 5432; URL-encode `@` in the
   password as `%40`).
2. **Vercel**: import the GitHub repo. Set these Environment Variables in the
   project (Production + Preview):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Supabase session-pooler URL |
   | `OPENROUTER_API_KEY` | your key (set a credit limit on it) |
   | `OPENROUTER_MODEL` | `deepseek-v4-flash-0731` (or whatever `smoke:model` picked) |
   | `APP_PASSWORD` | the shared password |
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | from Supabase → Settings → API (unused by the app today; harmless) |

3. Push. Vercel builds and deploys; `/api/health` on the deployed URL should return
   `{ ok: true, driver: "pg", counts: { entities: 169, reports: 80 } }`.

Free-tier notes: Supabase pauses idle projects — open the app the day before you
show it. Vercel's Hobby function limit bounds the analyst; the agent loop is
capped at 8 tool steps for that reason.

## Layout

```
src/app            pages + API routes (App Router)
src/components     map/ graph/ feed/ entity/ analyst/ filters/ search/ shell/
src/lib/db         schema, dual-driver handle (pg | pglite), migrations, queries
src/lib/graph      pure BFS / shortest paths / centrality
src/lib/ai         provider (OpenRouter), tools, prompt, agent loop
src/stores         zustand: selection/filters/highlights, shell UI
scripts            gates and seed pipeline
scripts/seed       canon.ts — the hand-written truth of the dataset
data/seed          generated JSON (deterministic; commit it)
supabase/migrations hand-written SQL
tests/unit, tests/evals, e2e
```
