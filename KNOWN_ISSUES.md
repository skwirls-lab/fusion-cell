# Known Issues

- **B1 (blocking):** this remote session's egress policy denies `openrouter.ai`
  and `*.supabase.co`. See BUILD_STATE.md. Not an application defect.
- **B2 (sandbox only):** commands containing `pkill`/`kill` exit 144 silently in this
  remote session. See DECISIONS.md D8. Irrelevant on a laptop.
- **Root commit authorship:** `928f330` is authored as john@skwirls.com; the stop hook
  wants noreply@anthropic.com. Fixing it needs a history rewrite the sandbox refuses.
  One command on a laptop if it matters: `git rebase --root --exec "git commit --amend
  --no-edit --reset-author"` after setting user.email, then force-push with lease.
