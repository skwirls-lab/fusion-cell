# Build State

Last updated: 2026-09-17T15:30Z
Current phase: 0 (Preflight)
Model configured: deepseek-v4-flash-0731 (**unverified** — see Blocked)
**Blocked: YES — network egress**

## BLOCKER — B1: session cannot reach OpenRouter or Supabase

This Claude Code **web/remote** session routes all outbound traffic through a
policy-enforcing egress proxy. That proxy returns `403` to `CONNECT` for both hosts
this build depends on:

```
openrouter.ai:443                    -> 403 connect_rejected (policy denial)
aqogfbjaepkkdvzukgxv.supabase.co:443 -> 403 connect_rejected (policy denial)
TCP aws-0-us-east-2.pooler.supabase.com:5432 -> blocked (proxy is HTTPS-CONNECT only)
```

Verified via `curl http://127.0.0.1:39825/__agentproxy/status` (`recentRelayFailures`).
The proxy README states policy denials must be reported, not routed around.

**Consequence:** every gate that touches the network cannot run *from this session*.
This does not affect the application itself — Vercel functions and a local dev machine
have no such policy.

**Resolution — needs the human. Either:**
- (a) Add `openrouter.ai` and `*.supabase.co` to this environment's network allowlist
      (environment network policy: https://code.claude.com/docs/en/claude-code-on-the-web),
      then this session runs the whole build; or
- (b) Run the build from a local Claude Code session (`Read BUILD.md and execute it`),
      which has no egress policy.

## Phase 0 — Preflight  [BLOCKED]
- [x] P0.1a Credentials collected and written to .env.local   attempts: 1
- [x] P0.1b .env.local confirmed gitignored                   attempts: 1
- [x] P0.1c scripts/check-env.ts written                      attempts: 2
      note: attempt 1 used `dotenv/config`, which loads .env not .env.local.
            Fixed with scripts/_env.ts shared loader.
- [ ] P0.1d check-env.ts PASSES                               BLOCKED by B1
- [ ] P0.2  Model tool-calling smoke test passes              BLOCKED by B1
- [x] P0.3  State/decision/issue ledgers created              attempts: 1

## Work that can proceed while B1 stands

Everything not requiring live OpenRouter or Postgres. Roughly 70% of the build:
schema + migration SQL, all API route handlers, graph algorithms + unit tests,
the story bible, the 12 hand-written clue reports, deterministic seed generation,
all UI components, the agent loop and tool implementations, Playwright specs,
and the eval question set. Only the *execution* of network gates must wait.

## Anti-thrash log
- P0.1c attempt 2: root-caused to dotenv path, not a credential problem. No thrash.
