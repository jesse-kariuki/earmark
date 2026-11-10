# PROGRESS

> The agent updates this file at the end of every milestone (and at the end of every session).
> Humans read it to see where things stand. Keep entries short.

## Current milestone
**M7 — Proof Receipt & recipient view** done → next **M8 — Ledger & trace polish** · open human items: M0 Render deploy, M2/M4 live AI recordings (need ANTHROPIC_API_KEY), M2 sandbox Buttons run

## Milestones
- [ ] M0 Scaffold & PayPal spike — Nov 2
- [x] M1 Data, money, event chain — Nov 3
- [ ] M2 Compose, contract, authorize — Nov 3 · all code + tests done; waiting on human: live contract recording (`pnpm eval:contracts:live`, needs ANTHROPIC_API_KEY) and one sandbox PayPal Buttons run
- [x] M3 Policy gate & tickets — Nov 7 (planned Nov 4)
- [ ] M4 Legacy invoice intake + eval set — Nov 4 · all code + tests done (fixture 12/12, UI R05 e2e); waiting on human: live extractor run (`AI_RECORD=1 pnpm eval:live`, needs ANTHROPIC_API_KEY + ANTHROPIC_MODEL)
- [ ] M5 Orchestrator, Guardian, webhooks (vertical slice) — Nov 5 · mock slice + all integration tests done; waiting on human: sandbox happy path (needs `.env` with PayPal sandbox keys) and webhook registration on the Render URL
- [x] M6 Connected institution mode — Nov 10 (planned Nov 6)
- [x] M7 Proof Receipt & recipient view — Nov 10 (planned Nov 6)
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
- Tests: 305 passing (M3) + 5 Playwright · events + money + contract + policy coverage: 100%
- Evals (fixture): 12/12 invoices, 10/10 contracts (hand-authored fixtures until a live run is recorded)
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
- 2026-11-03 · Canonical JSON allows non-integer numbers except on `*Minor` keys · doc 08 said "integers only", which made `contractHash` impossible (`confidenceFloor: 0.85`). Doc 08 updated.
- 2026-11-03 · `events` is append-only at the DB level (triggers) + a guardrail test · stronger than the ESLint check doc 08 suggested. M7 tamper demo drops/recreates `events_no_update`.
- 2026-11-03 · `events.created_at` is a plain ms integer (not Drizzle timestamp mode) · the hashed value must round-trip exactly.
- 2026-11-03 · `contract/schema.ts` and `policy/types.ts` (RuleResult, RULE_IDS) created in M1 · needed to type DB columns; M2/M3 extend them.
- 2026-11-03 · Seeded demo Earmark uses `AUTH-SEED-…` ids that the in-memory mock PayPal doesn't know · M5 must let the mock accept/register seeded authorizations. In sandbox mode the demo is seeded `awaiting_authorization`.
- 2026-11-03 · AI SDK v7: `generateText` + `Output.object` + `instructions` (not `generateObject`/`system`) · doc 04 updated.
- 2026-11-03 · Contract draft uses `null` for unstated expiry/threshold/period; code applies defaults · avoids the model inventing dates. Doc 04 updated.
- 2026-11-03 · Payee resolution matches verified institutions only (+ `institutions.aliases` column, migration 0002) · the lookalike exists in the registry, so "exact match" alone would resolve it. Docs 02/04 updated.
- 2026-11-03 · Order/authorize routes call `lib/orchestrator` (only module allowed to import the PayPal client) · new `INVALID_STATE` error code. Doc 06 updated.
- 2026-11-03 · Route handlers read the AI-mode cookie from the Request (not `next/headers`) · keeps handlers callable from Vitest.
- 2026-11-03 · The 10 contract fixtures are hand-authored drafts · they prove the code path, not the model. A live run (`pnpm eval:contracts:live`) records real outputs that fixture mode then prefers.
- 2026-11-03 · `pnpm db:reset` and `pnpm keys` run via `tsx` (a devDependency) · Render's default install includes devDeps; revisit if the build sets `NODE_ENV=production` before install.
- 2026-11-07 · Working copy lost root files, `src/`, `tests/`, `scripts/`, the contents of `node_modules` and `.env` (cause unknown) · no work lost: disk artifacts predate HEAD and `git fsck` found nothing dangling. Restored the deleted paths from HEAD, reinstalled, baseline 154 tests green. `.env` is gitignored, so it must be recreated. The repo has no remote.
- 2026-11-07 · R11 warns on EVERY upload until approved, with no contract opt-out · compile defaults to `invoice_any`, so doc 05's "default for uploads" never happened and uploads reached ALLOW with no human. Doc 05 updated.
- 2026-11-07 · R09 warns when there is no invoice number, and compares `invoiceNumberKey()` (ignores case and punctuation) · a re-saved upload has a new hash, so a null or respelled number could otherwise pay twice. Doc 05 updated.
- 2026-11-07 · R07 also fails amounts that are missing, ≤ 0 or not whole, and a remaining cap that is not a safe integer · the spec's `amount > remaining` passes negatives and NaN. Comparisons across the gate fail closed; flags must be literally `true`. Doc 05 updated.
- 2026-11-07 · R10 reads a new `invoice.purposeText`; a weak word such as "fees" alone warns, and so do non-ASCII letters · "school" and "term" are not purpose words, or eval 10 would pass. Clean fixtures and the demo invoice must name a strong word (tuition, boarding, "school fees"…) and the full contract period. Doc 05 updated.
- 2026-11-07 · Rule results echo invoice values only after a strict shape check · they reach the Guardian, so free text there would break money rule 4.
- 2026-11-07 · `issueTicket(db, ctx)` runs the gate itself, and `redeemTicket` reads Earmark facts from the row; `loadContext` supplies only invoice, registry and history · neither trusts a caller's verdict or stale state. Redeem moves the Earmark to `paying`, which is what stops two tickets spending one cap. Doc 05 updated.
- 2026-11-07 · `render.yaml` generates `TICKET_SECRET` · `src/lib/env.ts` still has a public default, because refusing it under NODE_ENV=production would break `next build` on a fresh clone. M11 secret scan must confirm it is set.
- 2026-11-07 · Vitest compiles JSX itself (`esbuild.jsx: automatic`) and includes `*.test.tsx` · tsconfig's `jsx: preserve` is for Next. RuleChecklist is tested with `renderToStaticMarkup`.

- 2026-11-10 · Extractor fixtures live at `evals/fixtures/invoice.extract/<sha256>.json` (written by `pnpm fixtures`, which also writes `manifest.json` with the printed school email), not `NN.expected.json` · keeps one fixture convention for every AI stage. Chromium stamps dates into PDFs, so regenerating changes hashes and orphans live recordings.
- 2026-11-10 · `pnpm eval` writes `evals/RESULTS.fixture.md`; only `pnpm eval:live` writes `RESULTS.md` · a fixture run must not overwrite the live number we quote.
- 2026-11-10 · Eval runner and (planned) Attack Lab run in a throwaway in-memory DB with a labelled fake hold (`src/lib/earmarks/sandbox.ts`) · reruns would otherwise hit R09 on the previous run's invoice, and attacks never touch the real ledger.
- 2026-11-10 · An upload that fails R09 is not stored (both unique indexes would refuse it); its events say `stored: false`. Every other upload is stored, including blocked ones · a blocked invoice still claims its number, so a later genuine invoice with the same number is R09 (known limitation).
- 2026-11-10 · Upload route also takes JSON `{ sample: "05" }` · the demo needs the 12 synthetic invoices in fixture mode; the bytes go through the same pipeline. Doc 06 updated.

- 2026-11-10 · New event type `paypal.capture_failed` · doc 03 §5 wants an event on capture failure and none fit. Doc 02 updated.
- 2026-11-10 · Fixture-mode Guardian is scripted (same tools, fixed order) and labelled `scripted` in the trace · fixture mode makes no model calls. Doc 04 updated.
- 2026-11-10 · PayPal Agent Toolkit tools are wrapped, not passed through · it is built for AI SDK v4 (`parameters`); we use v7 (`inputSchema`). Doc 04 updated.
- 2026-11-10 · The mock PayPal adopts holds our DB recorded · seeded and pre-restart Earmarks could not be captured otherwise (M3 handoff item).
- 2026-11-10 · Payment status updates are allowed in `lib/orchestrator`; the guardrail now forbids only payment/ticket inserts and ticket updates outside `tickets.ts` · the orchestrator has to record capture/payout progress.
- 2026-11-10 · e2e deletes `.data/e2e.db` before booting its server (`scripts/rm-db.mjs`) · reruns hit R09 on the previous run's sample invoice.

- 2026-11-10 · Signed payload gains optional `description` · R10 needs the purpose and period, and line labels alone rarely carry "Term 1 2027". Doc 05 updated.
- 2026-11-10 · A signed invoice is stored only if its signature verifies and it is not a duplicate · the Institution API is public, so a forged invoice must not claim the school's next invoice number. Doc 05 updated.
- 2026-11-10 · The Registrar submits in-process through the same flow as `POST /api/institution/invoices` (no HTTP hop to itself) · same code path, simpler on Render.

- 2026-11-10 · Explanation guard treats only `$`/`USD`/`KES`-prefixed or two-decimal numbers as money · doc 04's regex matches every digit, so "Term 1 2027" would be rejected. In fixture mode the template is used directly (no model call).
- 2026-11-10 · Tamper route is `POST /api/admin/tamper/:earmarkId` with optional `{ seq }`; it defaults to the capture event · one button, the most telling event.

### Handoff from the M3 money review
- M4: `history` must exclude the current invoice and use `invoiceNumberKey`. Set `approvedBySender` with `row.approvedBy === "sender"`, never truthiness. `loadContext` must confirm the invoice row belongs to `ticket.earmarkId` (GateContext has no invoice earmark id). Build `purposeText` from description + line labels. Give `ExtractedInvoice` strings a `.max()`.
- M5: pay `Redemption.ticket.payeeEmail` (`payments` stores no payee). A crash after redeem leaves the Earmark in `paying` and `redeemTicket` cannot re-run, so execute needs a resume path. Each gate refusal appends an event, so rate-limit the route. TAMPERED/EXPIRED/STALE refusals currently leave no event.
- OPEN (human decision): no rule ties an invoice to the contract's beneficiary, so a genuine Lakeview invoice for another student passes on Brian's Earmark. Signed invoices carry `earmarkRef` and `studentName`; uploads carry `studentName`.
- Not fixed: lookalike invoice numbers (`LSS-2027-OO1`); uploads are still human-approved, signed ones are signature-bound.

## Session log
<!-- 2026-11-02 · M0 · what was done · what's next -->
- 2026-11-02 · M0 (partial) · Next 15 + Tailwind 4 + shadcn scaffold, git init, Zod env, PayPal types/mock/sandbox/client, smoke script, ESLint money rule, /api/health, render.yaml, Vitest+coverage, Playwright smoke. typecheck/lint/test/e2e green. · Blocked on human: sandbox accounts + .env, then `pnpm paypal:smoke`; Render deploy. 
- 2026-11-02 · M0 · Day-0 sandbox smoke fully green (OAuth, partial final capture, idempotent replay, payout SUCCESS, void, webhook names, toolkit 1.11.0). Only remaining M0 item: Render deploy + `/api/health` on the public URL.
- 2026-11-03 · M0 · Recovered the repo after the working copy was partially wiped (see Decisions). typecheck/lint/test (42) and `next build` green. · Next: Render deploy + `/api/health` on the public URL, then M1.
- 2026-11-03 · M1 · Drizzle schema + migrations (incl. append-only triggers), `createDb`/`getDb`, seed-on-boot via `instrumentation.ts`, seed (3 institutions, 9 earmarks, 115 events, all chains verify), `db:reset`/`keys`, money helpers, canonical/chain/append + parity test, test helpers. 100 tests green; `next build` + boot seed verified. · Next: M2.
- 2026-11-03 · M2 · `lib/ai/call.ts` (fixture/recorded/live + record + trace.step), contract draft/compile/registry, 10 contract evals (fixture 10/10), API routes (compile, create, approve, order, authorize, detail, events, freeze, ai-mode), orchestrator authorize, header (persona switcher, AI toggle), MoneyBar/StatusChip/ContractPanel/EventTimeline, `/compose`, `/earmarks/[id]`, PayPal Buttons (sandbox) + mock hold. 154 tests + 5 e2e green. · Human: ANTHROPIC_API_KEY → `pnpm eval:contracts:live`; try the sandbox Buttons once. Next: M3.
- 2026-11-10 · M7 · `/receipt/[id]` (WebCrypto verification in the browser, expected-vs-got on the broken event, copy link, judge-mode tamper button), `lib/admin/{tamper,reset}.ts` + routes, header Reset (judge mode), `explain.ts` (guard on amounts / emails / institutions, EN + SW template fallback), `/r/[id]` mobile card + confirm, `recipient.notified` once. e2e: verified → tamper → broken at the capture event; 360px recipient check.
- 2026-11-10 · M6 · Ed25519 sign/verify, `invoice/signed.ts`, `intakeSigned`, Registrar (with tamper demo), institution registry/invoices/status routes, `/api/school/issue`, `/school` console, `public/openapi.yaml`, signed-invoice view. API #2 and #3, forged and altered → R12, school e2e green.
- 2026-11-10 · M5 · `orchestrator/execute.ts` (redeem → capture exact, final → remainder → payout to the ticket's registry email → confirm; resumable with fixed Request-Ids), `webhooks.ts` + route (verify, dedupe), Guardian (6 tools, scripted/live), toolkit read tools (`get_order`, `list_transactions`), `flows/pay.ts`, approve/upload run the Guardian, TraceDrawer v1 + trace route, page-load nudge. Integration: happy, replay ×3, capture 4xx/5xx, payout fail + retry, simulated payout, webhooks. 7 e2e green. · Human: sandbox run.
- 2026-11-10 · M4 · `pnpm fixtures` (Chromium → 11 PDFs + 1 skewed photo + hand-authored extractions), `invoice/{hash,extract,crosscheck,context,intake,samples}.ts`, AI wrapper sends file parts with no tools, upload/approve/reject/file routes, Invoices tab + `/invoices/[id]` review, eval runner. Fixture eval 12/12 first run. Handoff items done: history excludes the current invoice, `approvedBy === "sender"`, redemption context checks the Earmark, purposeText, `.max()` on strings. · Human: live extractor run.
- 2026-11-07 · M3 · Recovered the working copy again (see Decisions). `policy/rules.ts` (R01–R17), `gate.ts`, `tickets.ts`, `crypto/hmac.ts`, `invoice/schema.ts`, `RuleChecklist`, guardrail: only the orchestrator redeems, only tickets.ts writes payments. money-reviewer found real holes behind 100% coverage (uploads reaching ALLOW, R09 bypass, stale-context cap double-spend, invoice text in reasons, NaN passing); all fixed with tests, and the fixes were not re-reviewed by the agent. 305 tests + 5 e2e green, policy 100%. `pnpm eval` does not exist until M4. · Next: M4. Human: recreate `.env`, add a private git remote, decide the beneficiary check.
