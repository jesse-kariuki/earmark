# CLAUDE.md — Earmark (PayPal AI Hackathon)

> You are the implementation agent for **Earmark**: money that remembers why it was sent.
> Read this file fully at the start of every session. Then read `PROGRESS.md` to find where we are,
> and open only the `docs/` files the current milestone links to.

## 1. What we are building (one paragraph)

A sponsor abroad writes a purpose in plain language ("Pay Brian's Term 1 fees at Lakeview Secondary
School, up to $400, only against a real invoice"). An AI step compiles it into an **Intent Contract**
(structured, schema-validated rules). The sender approves a **PayPal authorization** (money held, not sent).
When the school's invoice arrives — either **signed by the school (connected mode)** or **uploaded as a
photo/PDF (legacy mode)** — a quarantined extractor reads it, a **deterministic policy gate** checks it,
and only then does the orchestrator **capture the exact invoice amount**, **pay the school via Payouts**,
and **release the remainder**. Every step is appended to a **hash-chained event log** that a public
**Proof Receipt** page verifies in the browser. An **Attack Lab** runs real attacks through the real
pipeline and shows which rule blocked each one.

Full product context: `docs/00-PRODUCT-OVERVIEW.md`.

## 2. Non-negotiable rules (the "money rules")

These are what judges will probe. Never violate them, even to make a test pass.

1. **The model never decides money.** LLM calls draft contracts, extract invoice fields and write
   explanations. Only `src/lib/policy/gate.ts` (pure, deterministic) decides ALLOW / BLOCK / REQUIRE_APPROVAL.
2. **Only the orchestrator moves money.** `src/lib/orchestrator/` is the only module allowed to import
   `capture`, `payout` or `void` from `src/lib/paypal/`. An ESLint `no-restricted-imports` rule enforces this.
3. **Capability tickets.** The Guardian agent can only call `proposePayment`. The gate mints a single-use,
   HMAC-signed, 5-minute ticket bound to `{earmarkId, invoiceId, amountMinor, currency, payeeEmail}`.
   The orchestrator redeems it exactly once (DB unique constraint on `payments.ticket_id`).
4. **Quarantined extractor.** The model that reads untrusted invoice content has **no tools** and returns
   only a Zod-validated object. The tool-using Guardian **never sees raw invoice text** — only the
   structured fields plus the gate result.
5. **Idempotency everywhere.** One invoice `file_hash` → at most one payment (unique index). Every PayPal
   write carries `PayPal-Request-Id` derived from the payment ID + step (`pay_123:capture`, `pay_123:payout`).
6. **Money is integers.** Store and compute in minor units (`amountMinor: number`, cents). Convert to the
   PayPal string (`"350.00"`) only at the PayPal client boundary. Never use floats for money.
7. **Events are append-only.** Never `UPDATE` or `DELETE` rows in `events`. All state changes go through
   `appendEvent()`; the hash chain is the source of truth for the receipt.
8. **Secrets stay server-side.** No secret in any `"use client"` file or `NEXT_PUBLIC_*` var except
   `NEXT_PUBLIC_PAYPAL_CLIENT_ID`.
9. **Sandbox only, fictional names only.** Every page shows a "Sandbox" badge. No real school names/logos.

## 3. Tech stack (decided — do not swap without asking)

| Layer | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript (strict), pnpm |
| DB | SQLite via `better-sqlite3` + Drizzle ORM; seed on boot |
| AI | Vercel AI SDK (`ai`) + `@ai-sdk/anthropic` (Claude); `generateObject` with Zod for extraction/compile |
| PayPal agent tools | `@paypal/agent-toolkit/ai-sdk` (`PayPalAgentToolkit`, sandbox context) + PayPal MCP server (`npx -y @paypal/mcp`) |
| Money movement | PayPal REST via our own thin `fetch` client: Orders v2, Payments v2, Payouts v1, Webhooks |
| Signing | Ed25519 via Node `crypto` |
| UI | Tailwind + shadcn/ui, lucide icons, AG Grid Community for the ledger |
| Tests | Vitest (unit + integration), Playwright (1–2 e2e smoke flows) |
| Hosting | Render web service |

## 4. Run modes (make everything testable offline)

Two env switches make the whole app runnable and testable with **no network**:

| Var | Values | Effect |
|---|---|---|
| `PAYPAL_MODE` | `mock` \| `sandbox` | `mock` = in-memory fake PayPal (`src/lib/paypal/mock.ts`) with the same interface, deterministic IDs, honours `PayPal-Request-Id`. Tests always use `mock`. |
| `AI_MODE` | `fixture` \| `live` | `fixture` = returns recorded outputs from `evals/fixtures/<stage>/<hash>.json` (or `recorded/<stage>/…`) keyed by file hash / sentence hash. `live` calls Claude. Video "judge mode" uses `fixture`; a toggle in the header switches to `live`. |

**Rule:** every feature must work in `PAYPAL_MODE=mock AI_MODE=fixture` before it is wired to sandbox/live.

## 5. Commands

```bash
pnpm install
pnpm dev                 # Next dev server (http://localhost:3000)
pnpm db:reset            # drop + migrate + seed SQLite (also runs on boot)
pnpm test                # vitest run (must be green before every commit)
pnpm test:watch
pnpm eval                # run the 12-invoice eval set, prints pass rate, writes evals/RESULTS.fixture.md (eval:live writes RESULTS.md)
pnpm eval:live           # same with AI_MODE=live (costs tokens)
pnpm e2e                 # playwright smoke (happy path + one attack)
pnpm paypal:smoke        # scripts/paypal-smoke.ts — real sandbox: authorize → capture → payout → void
pnpm keys                # scripts/gen-keys.ts — dev Ed25519 keypair for the school
pnpm fixtures            # scripts/gen-fixtures.ts — regenerate the 12 eval invoices
pnpm typecheck && pnpm lint
```

If a command does not exist yet, creating it is part of the current milestone.

## 6. Repository layout (target)

```
src/
  app/                       # Next.js routes (see docs/06-API-SPEC.md, docs/07-UI-SCREENS.md)
    (sender)/compose, earmarks/[id], invoices/[id], ledger
    school/                  # school console
    r/[id]/                  # recipient view (mobile-first)
    receipt/[id]/            # public Proof Receipt
    lab/                     # Attack Lab
    api/...                  # route handlers
  lib/
    db/        schema.ts, client.ts, seed.ts
    money.ts                 # minor-unit helpers, formatting, KES display estimate
    contract/  schema.ts, compile.ts            # Intent Contract
    invoice/   schema.ts, extract.ts, hash.ts, crosscheck.ts
    policy/    rules.ts, gate.ts, tickets.ts    # PURE. No I/O except passed-in context.
    agents/    guardian.ts, registrar.ts, explain.ts
    orchestrator/ execute.ts, webhooks.ts, expiry.ts
    paypal/    client.ts, sandbox.ts, mock.ts, types.ts, toolkit.ts
    events/    canonical.ts, chain.ts, append.ts   # canonical.ts is isomorphic (browser + node)
    crypto/    ed25519.ts, hmac.ts
    attacks/   scenarios.ts
  components/  MoneyBar, StatusChip, TraceDrawer, ContractPanel, PersonaSwitcher, SandboxBadge, ...
tests/         unit + integration (mirrors src/lib)
evals/         fixtures/ (12 invoices + expected.json), run.ts, RESULTS.md
scripts/       paypal-smoke.ts, gen-fixtures.ts, gen-keys.ts
docs/          the specs (read on demand)
```

## 7. How to work

1. Open `PROGRESS.md`, take the **first unchecked milestone** in `docs/PLAN.md`.
2. Read only the docs that milestone lists. Restate its acceptance tests to yourself.
3. Write/extend the tests first for anything in `policy/`, `events/`, `money.ts`, `orchestrator/`.
4. Implement in small commits. Run `pnpm typecheck && pnpm lint && pnpm test` before each commit.
5. When every acceptance check passes, tick it in `PROGRESS.md`, add a 2–4 line log entry
   (what changed, anything surprising, any deviation from the docs), and commit.
6. If a doc is wrong or PayPal behaves differently than documented, **update the doc in the same commit**
   and note it under "Decisions & deviations" in `PROGRESS.md`.
7. Stop and ask the human when: a PayPal sandbox account/permission is missing, a cost-bearing live call is
   needed beyond evals, or a change would break a money rule.

## 8. Code conventions

- TypeScript `strict`, no `any` in `lib/`. Zod at every boundary (HTTP input, LLM output, webhook body).
- Result types for expected failures: `{ ok: true, value } | { ok: false, error }`. Throw only for bugs.
- Every rule result carries a stable `ruleId` (e.g. `R05_PAYOUT_ACCOUNT_MATCH`) and a plain-English `reason`.
  UI, trace, Attack Lab and evals all key off `ruleId` — never rename one without updating all four.
- Server-only modules start with `import "server-only"`.
- Commit messages: `M3: quarantined extractor + crosschecks`. Never commit `.env*` (except `.env.example`) or `*.db`.
- Keep the UI copy short, calm and specific. Status chips = icon + word + colour (never colour alone).

## 9. Definition of done (whole project)

See `docs/13-SUBMISSION-CHECKLIST.md`. Short version: fresh clone → running in < 10 min; happy path
runs end-to-end in sandbox; all 5 Attack Lab scenarios blocked with named rules; eval pass rate in README;
tampering with one event makes the receipt fail; video < 3:00.
