---
description: Start or continue the next unchecked milestone from docs/PLAN.md
---
1. Read `CLAUDE.md` (if not already in context) and `PROGRESS.md`.
2. Find the first unchecked milestone in `docs/PLAN.md`. Read ONLY the docs it lists.
3. Restate its acceptance checks as a todo list. Note any Day-0 findings or deviations in `PROGRESS.md` that affect it.
4. Implement: tests first for `policy/`, `events/`, `money.ts`, `orchestrator/`. Small commits (`Mx: …`).
5. Run `/verify`. Only when every acceptance check passes: tick the milestone in `PROGRESS.md`, update
   "Numbers for the README", add a session-log line, commit.
6. If blocked on something only the human can do (sandbox accounts, keys, PayPal permissions), stop and say exactly what is needed.

$ARGUMENTS
