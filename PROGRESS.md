# PROGRESS

> The agent updates this file at the end of every milestone (and at the end of every session).
> Humans read it to see where things stand. Keep entries short.

## Current milestone
**M0 — Scaffold & PayPal spike** (see `docs/PLAN.md`)

## Milestones
- [ ] M0 Scaffold & PayPal spike — Nov 2
- [ ] M1 Data, money, event chain — Nov 3
- [ ] M2 Compose, contract, authorize — Nov 3
- [ ] M3 Policy gate & tickets — Nov 4
- [ ] M4 Legacy invoice intake + eval set — Nov 4
- [ ] M5 Orchestrator, Guardian, webhooks (vertical slice) — Nov 5
- [ ] M6 Connected institution mode — Nov 6
- [ ] M7 Proof Receipt & recipient view — Nov 6
- [ ] M8 Ledger & trace polish — Nov 7
- [ ] M9 Attack Lab, pause, guardrails — Nov 8
- [ ] M10 Design pass, README — Nov 9 (FREEZE)
- [ ] M11 Hardening & first take — Nov 10
- [ ] M12 Submit — Nov 11

## Day-0 findings (PayPal sandbox)
| Check | Result | Notes / fallback chosen |
|---|---|---|
| OAuth token | ✅ | Platform REST app client id/secret work |
| Payouts enabled on platform account | ✅ | Batch created `PENDING`, polled to `SUCCESS` (within the script's 6×5 s polling window). No fallback needed (`PAYOUT_MODE=real`) |
| Partial capture + final_capture releases remainder | ✅ | $1.00 of $2.00, `final_capture: true` → capture `COMPLETED`; auth status after: `CAPTURED`. Replay with same `PayPal-Request-Id` returned the same capture id |
| Capture funds available for payout | ✅ | Payout right after capture succeeded (no pre-funding needed so far) |
| Webhook event names present | ✅ | All 13 names in docs/03 §3.5 exist in `webhooks-event-types` |
| Agent Toolkit version + read tool names | ✅ | `@paypal/agent-toolkit` 1.11.0. Read tools: `get_order` (`orders: { get: true }`), `list_transactions` (`transactions: { list: true }`). No payouts tool → Payouts stays on REST |

## Numbers for the README / video
- Tests: 42 passing (M0) · policy coverage: —%
- Evals (fixture): —/12 invoices, —/10 contracts
- Evals (live, model —): —/12, —/10
- Attack Lab: —/5 blocked

## Decisions & deviations
<!-- date · what changed vs docs · why -->
- 2026-11-02 · `PayPalClient.createAuthorizeOrder` also returns optional `approveUrl` · smoke script needs the payer-action link (UI still uses the JS SDK).
- 2026-11-02 · PayPal calls report via an injected `trace` callback (no events table until M1) · M5 wires it to `trace.step` events.
- 2026-11-02 · ESLint money rule also blocks direct imports of `paypal/sandbox` and `paypal/mock` · otherwise the client restriction is trivially bypassed. Guarded by `tests/guardrails/money-imports.test.ts`.
- 2026-11-02 · `db:reset` is a no-op placeholder until M1 (`render.yaml` start command already calls it).
- 2026-11-02 · Void works and is also confirmed: auth status after void = `VOIDED`. Authorization status right after authorize = `CREATED`.
- 2026-11-02 · `money.ts` created early with only the PayPal-boundary conversions · M1 extends it.
- 2026-11-02 · `/verify` runs `pnpm test -- --coverage`; under pnpm 10 the `--` reaches Vitest and disables coverage · use `pnpm test --coverage`.
- 2026-11-03 · Working copy lost `.git`, `docs/`, `.claude/`, `CLAUDE.md` and all dotfiles · restored specs from `earmark-starter.zip`, rebuilt `eslint.config.mjs` (money rule), `.gitignore`, `next.config.ts`, `components.json`, `e2e/smoke.spec.ts`; fresh `git init`, so the M0 commits (f570b17, dad03cb) are gone. Any M0 edits to `docs/` must be redone from the notes above.

## Session log
<!-- 2026-11-02 · M0 · what was done · what's next -->
- 2026-11-02 · M0 (partial) · Next 15 + Tailwind 4 + shadcn scaffold, git init, Zod env, PayPal types/mock/sandbox/client, smoke script, ESLint money rule, /api/health, render.yaml, Vitest+coverage, Playwright smoke. typecheck/lint/test/e2e green. · Blocked on human: sandbox accounts + .env, then `pnpm paypal:smoke`; Render deploy. 
- 2026-11-02 · M0 · Day-0 sandbox smoke fully green (OAuth, partial final capture, idempotent replay, payout SUCCESS, void, webhook names, toolkit 1.11.0). Only remaining M0 item: Render deploy + `/api/health` on the public URL.
- 2026-11-03 · M0 · Recovered the repo after the working copy was partially wiped (see Decisions). typecheck/lint/test (42) and `next build` green. · Next: Render deploy + `/api/health` on the public URL, then M1.
