# Earmark — money that remembers why it was sent

> *Send money with a reason, and keep the reason attached.*
> Built for the PayPal AI Hackathon (2026). **Sandbox only. All names are fictional.**

<!-- AGENT: keep this README as the public face of the project. Fill every <!-- TODO --> by M10. -->

**Demo:** <!-- TODO Render URL --> · **Video (2:50):** <!-- TODO YouTube --> · **Licence:** MIT

## The problem
Families abroad send money for specific things — school fees, hospital bills, rent — but cannot verify where
it ends up. Kenya alone received a record US$5.04 billion in diaspora remittances in 2025 (Central Bank of Kenya).

## What Earmark does
1. **Intent Contracts** — write a sentence; Claude compiles it into rules you can read and approve.
2. **Held, not sent** — a PayPal authorization holds the money; only the verified invoice amount is captured.
3. **Two-agent settlement** — a Guardian agent (for the sender) verifies a Registrar-signed invoice (from the school).
4. **Attack Lab** — run real attacks yourself and see which rule stops each one.
5. **Proof Receipt** — a hash-chained log your browser verifies.

<!-- TODO screenshots: compose, trace drawer, receipt, ledger, lab -->

## How PayPal is used
| Step | API |
|---|---|
| Hold | Orders v2 `intent: AUTHORIZE` + `/authorize` via PayPal JS SDK Buttons |
| Capture exact amount | Payments v2 `/authorizations/{id}/capture` with `final_capture` |
| Pay the school | Payouts v1 `/payments/payouts` |
| Cancel / expire | Payments v2 `/authorizations/{id}/void` |
| Confirm | Webhooks + signature verification, polling fallback |
| Agent tools | `@paypal/agent-toolkit` (AI SDK) read tools; PayPal MCP server for development |
Every write carries `PayPal-Request-Id`; a replayed invoice never pays twice.

## How AI is used — and what it is not allowed to do
The model **drafts** contracts, **extracts** invoice fields, and **explains** decisions. It never decides or
moves money: a deterministic policy gate (17 named rules) decides, and only the orchestrator can call
capture/payout, by redeeming a single-use ticket the gate minted. The invoice reader has no tools.

## Results
<!-- TODO from PROGRESS.md -->
- Tests: — passing, policy gate 100% branch coverage
- Evals: —/12 invoices, —/10 contracts (model: —, temperature 0)
- Attack Lab: 5/5 blocked

## Run it locally (< 10 minutes)
```bash
git clone <repo> && cd earmark
cp .env.example .env          # works as-is in mock mode
pnpm install
pnpm db:reset
pnpm dev                      # http://localhost:3000
pnpm test && pnpm eval        # offline, deterministic
```
For the real sandbox set `PAYPAL_MODE=sandbox` and fill the PayPal vars (see `.env.example`), and
`AI_MODE=live` with an Anthropic key. Sandbox test accounts: <!-- TODO -->

## Architecture
<!-- TODO export docs/01-ARCHITECTURE.md mermaid to docs/architecture.png -->

## Limitations (honest)
- Sandbox only. Holding and redistributing funds for others needs licensing and a partner model in production.
- PayPal authorizations are honoured for 3 days (valid 29); demo Earmarks are short. Re-authorization is roadmap.
- KES amounts are display estimates, not FX quotes. Payouts go to PayPal accounts; M-Pesa/bank rails are roadmap.

## Built during the submission period
All code in this repository was written during the hackathon submission period.
