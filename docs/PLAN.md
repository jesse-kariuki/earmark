# PLAN — Milestones (re-baselined to start Mon Nov 2, 2026)

The original plan started Oct 31; this version starts Nov 2 and still **freezes features at the end of
Nov 9**. Work milestones strictly in order. Each has: docs to read, tasks, and acceptance checks that must
pass before ticking it in `PROGRESS.md`. Target date is a guide; acceptance checks are the contract.

**Vertical slice first:** by end of M5 (Nov 5) one Earmark must go sentence → hold → invoice → gate →
capture → payout → remainder in mock mode, and in sandbox where Day-0 checks allow.

---

## M0 — Scaffold & PayPal spike · Nov 2
Read: `CLAUDE.md`, `03-PAYPAL-INTEGRATION.md` §0–2, `11-DEPLOYMENT.md`
- [ ] `create-next-app` (TS, App Router, Tailwind, ESLint, `src/`), pnpm, MIT `LICENSE`, `.gitignore` (`.env*`, `!.env.example`, `.data/`, `*.db`)
- [ ] shadcn/ui init; Vitest + coverage; Playwright; `tsconfig` strict; path alias `@/`
- [ ] `src/lib/env.ts` (Zod-parsed env, server-only) using `.env.example`
- [ ] `src/lib/paypal/{types,mock,sandbox,client}.ts` per the interface; mock honours Request-Id
- [ ] `scripts/paypal-smoke.ts` (`pnpm paypal:smoke`)
- [ ] ESLint `no-restricted-imports` money rule (01-ARCHITECTURE)
- [ ] `/api/health`; `render.yaml`; deploy hello-world to Render
- [ ] Human: create 3–4 sandbox accounts, fill `.env`
**Accept:** `pnpm typecheck && pnpm lint && pnpm test` green · `tests/paypal/mock.test.ts` passes (idempotent capture) ·
smoke script moves $1 end-to-end in sandbox OR the blocker is recorded with a chosen fallback · Day-0 findings written in `PROGRESS.md` · Render URL returns `/api/health` ok.

## M1 — Data, money, event chain · Nov 3 (AM)
Read: `02-DATA-MODEL.md`, `08-PROOF-RECEIPT.md`
- [ ] Drizzle schema + migrations, `client.ts`, `seed.ts`, `pnpm db:reset`, seed-on-boot
- [ ] `money.ts` + tests
- [ ] `events/canonical.ts`, `append.ts`, `chain.ts` (node + webcrypto sha) + tests
- [ ] `tests/helpers/*` (db, clock, factories)
**Accept:** seed produces 3 institutions + ~9 earmarks with valid chains (`verifyChain` ok for all) · tamper test fails at right seq · money edge-case tests pass.

## M2 — Compose, contract, authorize · Nov 3
Read: `04-AI-AGENTS.md` §1, `06-API-SPEC.md` (Earmarks), `07-UI-SCREENS.md` (1, 2, components)
- [ ] `lib/ai/call.ts` wrapper (fixture/live/record, trace events)
- [ ] Contract schema, compile, registry resolution (no fuzzy), `evals/contracts.json` (10 sentences)
- [ ] Layout: header, PersonaSwitcher, SandboxBadge, AI mode toggle
- [ ] `MoneyBar`, `StatusChip`, `ContractPanel`; `/compose`; `/earmarks/[id]` (timeline + money bar + pause switch)
- [ ] PayPal Buttons (intent=authorize) → order + authorize routes
**Accept:** 10/10 contract sentences compile to expected fields (fixture; live run recorded) · lookalike name does NOT resolve · browser flow ends with stored authorization id (mock; sandbox if M0 ok) · API flow test #1 passes.

## M3 — Policy gate & tickets · Nov 4 (AM)
Read: `05-POLICY-GATE.md`
- [ ] `policy/rules.ts` (R01–R17), `gate.ts`, `tickets.ts`, `crypto/hmac.ts`
- [ ] Full test suite incl. TOCTOU and double-redeem
**Accept:** 100% line+branch coverage on `src/lib/policy/**` · every rule has a pass and a fail test · `RuleChecklist` component renders a `GateResult` fixture.

## M4 — Legacy invoice intake + eval set · Nov 4
Read: `04-AI-AGENTS.md` §2, `09-ATTACK-LAB-AND-EVALS.md` §1
- [ ] `scripts/gen-fixtures.ts` → 12 invoices + `cases.json`
- [ ] `invoice/hash.ts`, `extract.ts` (no tools), `crosscheck.ts` → `GateContext`
- [ ] Upload route; `/invoices/[id]` review screen with approve/reject
- [ ] Record live extractor outputs once (`AI_RECORD=1 pnpm eval:live`) → `*.expected.json`
- [ ] `evals/run.ts`, `RESULTS.md`, `run.fixture.test.ts`
**Accept:** `pnpm eval` = 12/12 in fixture mode · live run result recorded in `RESULTS.md` (fix prompts until 12/12 or document misses) · upload of 05 shows BLOCK R05 in UI.

## M5 — Orchestrator, Guardian, webhooks (vertical slice) · Nov 5
Read: `03-PAYPAL-INTEGRATION.md` §3, `04-AI-AGENTS.md` §3, `05-POLICY-GATE.md` §4
- [ ] `orchestrator/execute.ts` (redeem → capture exact → payout to registry email → remainder event), failure paths
- [ ] Guardian agent with tools + PayPal toolkit read tools (mock stubs in mock mode)
- [ ] Webhook route + verification + dedupe; payout polling fallback
- [ ] `TraceDrawer` (first version)
**Accept:** integration tests: happy path, replay ×3 → 1 capture + 1 payout, capture fail, payout fail · sandbox happy path shows school paid + remainder released (or labelled fallback) · trace shows PayPal call with Request-Id.

## M6 — Connected institution mode · Nov 6 (AM)
Read: `05-POLICY-GATE.md` §5, `04-AI-AGENTS.md` §4, `06-API-SPEC.md` (Institution)
- [ ] `crypto/ed25519.ts`, `pnpm keys`, registry endpoint, `POST /api/institution/invoices`, `/api/school/issue`
- [ ] Registrar agent; `/school` console; `public/openapi.yaml`
**Accept:** school issues invoice → Guardian pays it with no upload (API flow test #2) · forged/altered signature → R12 · duplicate → R09.

## M7 — Proof Receipt & recipient view · Nov 6
Read: `08-PROOF-RECEIPT.md`, `04-AI-AGENTS.md` §5, `07-UI-SCREENS.md` (5, 6)
- [ ] `/receipt/[id]` with client verification + tamper demo button (judge mode)
- [ ] `explain.ts` + amount/payee guard + Swahili template fallback; `/r/[id]` mobile-first + confirm
**Accept:** e2e: receipt shows verified → tamper → broken at the edited event · guard test rejects `$800` · recipient page passes a 360px screenshot check.

## M8 — Ledger & trace polish · Nov 7
Read: `07-UI-SCREENS.md` (7, TraceDrawer)
- [ ] AG Grid Community ledger with expandable detail (Community-only features), summary cards, "Blocked attempts" filter
- [ ] TraceDrawer final: actors, plain language, PayPal/toolkit calls, "No tools" badge
**Accept:** filter, sort, expand work on seeded + live data · from any ledger row you reach the full trace in ≤ 2 clicks.

## M9 — Attack Lab, pause, guardrails · Nov 8
Read: `09-ATTACK-LAB-AND-EVALS.md` §2–3
- [ ] `/lab` + `POST /api/lab/:scenario` (5 scenarios), Run all
- [ ] Guardrail tests; pause switch end-to-end
- [ ] Playwright: `happy.spec.ts`, `lab.spec.ts`, `receipt.spec.ts`
**Accept:** all 5 attacks blocked, each names its rule · `pnpm e2e` green · CI workflow green.

## M10 — Design pass, README · Nov 9 → **FEATURE FREEZE at end of day**
Read: `07-UI-SCREENS.md`, `13-SUBMISSION-CHECKLIST.md`
- [ ] Empty/loading/error states everywhere; copy pass; responsive check
- [ ] README draft (structure in `README.md`), screenshots, architecture image (export Mermaid via `mmdc`)
**Accept:** a friend completes sender → school → recipient → receipt → lab with no help.

## M11 — Hardening & first take · Nov 10
Read: `11-DEPLOYMENT.md`, `12-DEMO-SCRIPT.md`
- [ ] Render: webhook registered, judge mode, reset, rate limits, live-call budget, secret scan
- [ ] Fresh-clone dry run (timed) · first video take
**Accept:** app runs from clean clone in < 10 min · take 1 exists.

## M12 — Submit · Nov 11 (Nov 12 = buffer only, deadline 11:00 pm Nairobi)
- [ ] Final edit, YouTube public + captions, Devpost text, sponsor tools ticked, tag `v1.0-submission`
**Accept:** submission confirmed; video link tested logged out.

---

## Stretch (only after M9 is green, before freeze)
- S1 Auto-void + reminder at expiry (`orchestrator/expiry.ts`, check on page load + Render cron)
- S2 APIMatic SDK + docs from `public/openapi.yaml`
- S3 Installments across terms (`final_capture: false` until last)
- S4 Bonus lab scenarios: forged signature (R12), agent overpay (R17)

## Cut order if late
Stretch → Swahili (keep template only) → Attack Lab to 3 scenarios → installments.
**Never cut:** policy gate, Proof Receipt, AG Grid ledger, video.
