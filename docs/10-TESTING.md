# 10 — Testing Strategy

Goal: a judge (or you at 2 am) can run `pnpm test` and see the money rules proven. Fast (< 30 s), offline,
deterministic: `PAYPAL_MODE=mock AI_MODE=fixture`, in-memory SQLite, injected clock.

## Layers

| Layer | Tool | Scope | Must-have files |
|---|---|---|---|
| Unit | Vitest | `money`, `policy/*`, `events/*`, `crypto/*`, `contract/schema`, `invoice/crosscheck`, explanation guard | `tests/money.test.ts`, `tests/policy/gate.test.ts`, `tests/policy/tickets.test.ts`, `tests/events/chain.test.ts`, `tests/crypto/ed25519.test.ts` |
| Integration | Vitest | route handlers + orchestrator + mock PayPal + fixture AI | `tests/api/flow.test.ts`, `tests/orchestrator/execute.test.ts`, `tests/paypal/mock.test.ts`, `tests/webhooks.test.ts` |
| Eval | Vitest + runner | 12 invoices + 10 contracts | `evals/run.fixture.test.ts` |
| Guardrails | Vitest | structural safety properties | `tests/guardrails/*.test.ts` |
| E2E | Playwright | happy path (connected) + Attack Lab run-all + receipt tamper | `e2e/happy.spec.ts`, `e2e/lab.spec.ts`, `e2e/receipt.spec.ts` |
| Manual sandbox | script | real PayPal | `scripts/paypal-smoke.ts` |

## Test utilities

- `tests/helpers/db.ts` → `makeTestDb()` (in-memory better-sqlite3 + migrate + seed).
- `tests/helpers/clock.ts` → `fixedNow(iso)`.
- `tests/helpers/factories.ts` → `makeContract()`, `makeEarmark()`, `makeSignedInvoice(key)`, `baseGateCtx()`.
- Mock PayPal exposes `mock.calls` (array of `{op, requestId, body}`) for assertions like
  "exactly one payout call with receiver = registry email".

## Coverage thresholds (`vitest.config.ts`)

```ts
coverage: { provider: "v8", thresholds: {
  "src/lib/policy/**": { lines: 100, branches: 100 },
  "src/lib/events/**": { lines: 95 },
  "src/lib/orchestrator/**": { lines: 90 },
}}
```

## Key assertions that map to pitch claims (put these numbers in the README)

| Claim | Test |
|---|---|
| "No payment path skips the gate" | orchestrator refuses without a valid ticket; only `redeemTicket` creates payments |
| "A replay never pays twice" | post same signed invoice ×3 + redeem same ticket ×2 → 1 capture, 1 payout call |
| "Only the verified amount is captured" | capture body amount === invoice amount; `final_capture: true`; remainder event = cap − amount |
| "Swapped account can't redirect money" | even with R05 forced to pass (test-only override), payout receiver is still registry email |
| "Prompt injection has nothing to act on" | extractor called with no tools; Guardian input contains no raw invoice text |
| "Tampering is detected" | chain verify fails at the edited seq |

## CI

GitHub Actions `ci.yml`: pnpm install → typecheck → lint → test (with coverage) → eval (fixture) →
playwright (with `pnpm build && pnpm start` in mock/fixture mode). Badge in README.
