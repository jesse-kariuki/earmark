# 00 — Product Overview

## Pitch

**Earmark is money that remembers why it was sent.**
Tagline: *"Send money with a reason, and keep the reason attached."*

A sponsor abroad (a relative, a scholarship fund, a diaspora group) writes a purpose in plain language.
An AI agent compiles it into enforceable rules, holds the money as a PayPal authorization, and captures
and pays the institution only after verifying the invoice. The sender gets a tamper-evident Proof Receipt
instead of a "did you get it?" phone call.

## Problem

Families abroad send money for specific things (school fees, hospital bills, rent) but cannot control or
verify where it ends up. It lands in a wallet and is redirected, or it is lost to a doctored invoice.
Today's tools move money fast and say nothing about its purpose.

## Audience (be specific in every artefact)

Sponsors who fund other people's bills from abroad, **starting with Kenyan school fees**. Strongest fit:
sponsors who (a) cannot verify a request from far away, (b) need the money to reach its stated purpose,
or (c) answer to someone else (scholarship funds, churches, diaspora associations, employers).

Honest framing: a direct transfer is cheaper and simpler when you trust the recipient and the bill is
routine. Earmark does not claim otherwise.

## The five differentiators (each must be visible in the demo)

1. **Intent Contracts** — sentence → structured rules (payee, cap, purpose, expiry, evidence, approval
   threshold). Model drafts, sender confirms, code enforces.
2. **Funds held, not sent** — PayPal authorization; capture only the verified invoice amount; remainder released.
3. **Two-agent settlement** — Guardian (works for sender) + Registrar (works for school). Connected mode =
   signed invoice checked against a registry. Legacy mode = vision extraction + human approval.
4. **Attack Lab** — five real attacks through the real pipeline; shows the rule that stopped each.
5. **Proof Receipt** — hash-chained event log verified in the browser.

## Personas (no logins — a persona switcher in the header)

| Persona | Fictional name | Role |
|---|---|---|
| Sender | Wanjiru Kamau (Atlanta) | Writes the Earmark, approves PayPal, reviews invoices |
| School | Lakeview Secondary School (bursar: Mr. Otieno) | Issues signed invoices, sees paid status |
| Recipient | Brian Kamau (student) | Sees a plain confirmation in English/Swahili, taps to confirm |
| Judge | — | Attack Lab, public receipt, ledger |

Seed also includes an **unregistered lookalike**: "Lakeview Secondary Schools Ltd" with a different
PayPal email — used by attack scenarios.

## Scoring map (five equally weighted criteria)

| Criterion | What the judge must see |
|---|---|
| Technological Implementation | Real sandbox authorize → verified capture → payout; Agent Toolkit + MCP; webhooks; idempotency; tests + evals |
| Design | One coherent app, three personas, money bar everywhere, readable trace, shareable receipt |
| Potential Impact | One named audience, one measurable pain, Kenya remittance figure (US$5.04B in 2025, CBK data) |
| Innovation | Intent Contracts, two-agent settlement, live Attack Lab |
| Presentation | < 3 min video, one family's story, ends on a blocked fraud attempt |

## Scope

| # | Priority | Feature | Done when |
|---|---|---|---|
| 1 | Must | Create an Earmark: sentence → compiled contract → PayPal authorization | Authorization ID stored; contract visible beside sentence |
| 2 | Must | Legacy invoice intake (photo/PDF) → extract → cross-check | Clean, altered-account and inflated samples get correct verdicts with reasons |
| 3 | Must | Policy gate (payee, cap, expiry, duplicate, evidence, approval threshold) | Unit test per rule; no payment path skips the gate |
| 4 | Must | Execute: capture exact amount, pay school, release remainder | Sandbox run shows school paid, remainder released, replay → no second payout |
| 5 | Must | Proof Receipt with in-browser hash verification | Editing one stored event → receipt shows failed check |
| 6 | Must | AG Grid ledger with detail rows | Filter, sort, expand work on seeded + live data |
| 7 | Must | Agent trace in plain language | Reviewer can see why any payment was allowed/blocked |
| 8 | Must | Hosted demo, README, seed data, reset button | Stranger runs it from fresh clone in < 10 min |
| 9 | Should | Connected institution mode (school console, signed invoices, registry) | School issues invoice; Guardian pays with no upload |
| 10 | Should | Attack Lab, 5 scenarios | Each blocked, names its rule |
| 11 | Should | Recipient view EN/SW | Plain confirmation + confirm tap |
| 12 | Stretch | Auto-void + reminder at expiry | Unspent auth voided, sender told |
| 13 | Stretch | APIMatic SDK + docs for Institution API | Published docs |
| 14 | Stretch | Installments across terms | One Earmark pays 3 invoices |

**Cut list (do NOT build):** real identity checks, logins/OAuth, mobile app, live FX (KES is a labelled
display estimate only), mobile-money/bank rails (roadmap slide only), any claim of production-grade escrow.

**Cut order if late:** stretch → Swahili → Attack Lab to 3 scenarios → installments.
**Never cut:** policy gate, Proof Receipt, AG Grid ledger, video.
