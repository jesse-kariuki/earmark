---
description: Run the full local quality gate and report results
---
Run, in order, and stop at the first failure to fix it:
```
pnpm typecheck
pnpm lint
pnpm test -- --coverage
pnpm eval
```
Then (if the app builds and Playwright is set up) `pnpm e2e`.

Report a short table: command · pass/fail · key numbers (tests passing, policy coverage %, eval x/12, contracts x/10).
Also check the money rules in `CLAUDE.md` §2 against the diff since the last commit (`git diff HEAD~1`):
flag any import of `lib/paypal/client` outside `lib/orchestrator`, any write to `events` outside `appendEvent`,
any float money, any secret in a client file.
