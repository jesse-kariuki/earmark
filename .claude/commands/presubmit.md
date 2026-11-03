---
description: Walk the submission checklist and report what is missing
---
Open `docs/13-SUBMISSION-CHECKLIST.md` and check each item against the repo as it is now:
- README has no remaining `TODO` markers; numbers match `PROGRESS.md` and `evals/RESULTS.md`
- `LICENSE` is MIT; `.env` is not tracked; run `npx gitleaks detect` if available
- `pnpm build` output contains no secrets (grep `.next/static` for `PAYPAL_CLIENT_SECRET`, `sk-ant`, `TICKET_SECRET`)
- Fresh clone test: clone into /tmp, `cp .env.example .env`, `pnpm install && pnpm db:reset && pnpm build && pnpm test`; report elapsed time
- `/api/health` on the Render URL (if set in README)
Print a checklist with ✓/✗ and a one-line fix for each ✗. Do not change code unless asked.
