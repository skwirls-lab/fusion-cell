# Known Issues

- **B1 (blocking):** this remote session's egress policy denies `openrouter.ai`
  and `*.supabase.co`. See BUILD_STATE.md. Not an application defect.
- **B2 (sandbox only):** commands containing `pkill`/`kill` exit 144 silently in this
  remote session. See DECISIONS.md D8. Irrelevant on a laptop.
- **Root commit authorship:** `928f330` is authored as john@skwirls.com; the stop hook
  wants noreply@anthropic.com. Fixing it needs a history rewrite the sandbox refuses.
  One command on a laptop if it matters: `git rebase --root --exec "git commit --amend
  --no-edit --reset-author"` after setting user.email, then force-push with lease.
- **Prompt-injection posture is asserted by prompt text only.** Report bodies reach the
  model as JSON-escaped tool-result data and the system prompt says to ignore embedded
  instructions, but no seeded report contains an instruction and no test exercises it.
  Add a hostile report + eval question once a real model is available.
- **Eval scoring is substring-based.** See DECISIONS.md D15.
