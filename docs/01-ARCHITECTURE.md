# 01 — Architecture

## One-line summary

One Next.js app. Claude handles language and vision. A deterministic policy gate makes every money
decision. Only the orchestrator talks to PayPal's money-moving endpoints.

## Component diagram

```mermaid
flowchart TB
  subgraph Personas
    S[Sender UI<br/>compose · detail · invoice review · ledger]
    SC[School console]
    R[Recipient view /r/:id]
    P[Public Proof Receipt /receipt/:id]
    L[Attack Lab /lab]
  end

  subgraph NextApp[Next.js server]
    C1[1 Intent Compiler<br/>LLM → Zod contract]
    C2[2 Invoice Intake<br/>legacy: quarantined extractor<br/>connected: signature verify]
    C3[3 Policy Gate<br/>PURE rules → verdict + ticket]
    C4[4 Guardian Agent<br/>tools: getEarmark, proposePayment,<br/>requestApproval, PayPal toolkit read tools]
    C5[5 Orchestrator<br/>redeem ticket → capture → payout → release]
    C6[6 Event Log<br/>append-only hash chain]
    REG[Registrar Agent / Institution API<br/>signs invoices]
    DB[(SQLite via Drizzle)]
  end

  CL[(Claude via AI SDK)]
  PP[(PayPal Sandbox<br/>Orders · Payments · Payouts · Webhooks)]
  MCP[(PayPal Agent Toolkit / MCP<br/>read tools)]

  S --> C1 --> C6
  S -->|upload| C2
  SC --> REG --> C2
  C2 --> C3
  C3 --> C4
  C4 -->|proposePayment| C3
  C3 -->|ticket| C5
  C5 --> PP
  PP -->|webhooks| C5
  C5 --> C6
  C1 -.-> CL
  C2 -.->|vision, no tools| CL
  C4 -.-> CL
  C4 -.-> MCP
  C6 --> DB
  P -->|GET events| C6
  L --> C2
```

## Trust boundaries

| Boundary | Untrusted input | Defence |
|---|---|---|
| Sender sentence → contract | Free text | `generateObject` + Zod; sender must confirm; contract frozen (hashed) once approved |
| Invoice file → extractor | Image/PDF possibly containing prompt injection | Extractor has **no tools**, temperature 0, Zod output only, output fields are data never instructions |
| Extractor output → gate | Possibly wrong/malicious values | Gate cross-checks against contract, registry, previous hashes, arithmetic; confidence floor |
| Guardian agent → money | LLM tool calls | Guardian can only `proposePayment`; gate mints single-use ticket; orchestrator redeems |
| Signed invoice → gate | Forged JSON | Ed25519 signature checked against registry public key |
| PayPal webhook → event log | Spoofed POST | Verify via `POST /v1/notifications/verify-webhook-signature`; dedupe on event id |
| Public receipt | — | Read-only; client recomputes hashes itself |

## End-to-end sequence (happy path, connected mode)

```mermaid
sequenceDiagram
  actor W as Wanjiru (Sender)
  participant App
  participant AI as Claude
  participant Gate as Policy Gate
  participant G as Guardian
  participant O as Orchestrator
  participant PP as PayPal
  actor Sch as School

  W->>App: "Pay Brian's Term 1 fees ... up to $400"
  App->>AI: compile (generateObject)
  AI-->>App: IntentContract JSON
  App-->>W: contract beside sentence
  W->>App: approve contract
  App->>PP: POST /v2/checkout/orders (intent AUTHORIZE)
  W->>PP: approve in PayPal Buttons
  App->>PP: POST /v2/checkout/orders/{id}/authorize
  PP-->>App: authorization_id  (event: authorized)
  Sch->>App: issue signed invoice $350 (Registrar)
  App->>Gate: evaluate(invoice, contract, registry, history)
  Gate-->>App: ALLOW
  App->>G: run Guardian (structured fields only)
  G->>PP: (toolkit) get order — confirm hold exists
  G->>Gate: proposePayment(invoiceId, 350.00)
  Gate-->>G: ticket tk_… (single use)
  G-->>O: ticket
  O->>PP: capture 350.00 final_capture=true (Request-Id pay_x:capture)
  O->>PP: payout 350.00 → school email (Request-Id pay_x:payout)
  PP-->>O: webhooks CAPTURE.COMPLETED / PAYOUTS-ITEM.SUCCEEDED
  O->>App: events captured, paid_out, remainder_released ($50)
  App-->>W: money bar: $350 sent · $50 released
```

## Earmark state machine

```mermaid
stateDiagram-v2
  [*] --> draft: sentence compiled
  draft --> awaiting_authorization: contract approved
  awaiting_authorization --> held: PayPal authorized
  held --> held: invoice blocked / awaiting approval
  held --> paying: ticket redeemed
  paying --> paid: capture + payout succeeded (final)
  paying --> partially_paid: capture ok, non-final (installments, stretch)
  partially_paid --> paying
  paying --> held: capture/payout failed (retryable)
  held --> voided: sender cancels → void auth
  held --> expired: expires_at passed → void auth
  paid --> [*]
  voided --> [*]
  expired --> [*]
  note right of held: frozen flag is orthogonal —<br/>gate refuses everything while frozen
```

Status values (DB): `draft | awaiting_authorization | held | paying | partially_paid | paid | voided | expired`.

## Module dependency rules

```
app/*  → lib/agents, lib/orchestrator, lib/contract, lib/invoice, lib/events, lib/db (read)
lib/agents      → lib/policy (proposePayment only), lib/paypal/toolkit (read tools), lib/db (read)
lib/orchestrator→ lib/policy/tickets (redeem), lib/paypal/client (capture/payout/void), lib/events
lib/policy      → nothing with I/O. Takes a fully-built `GateContext` object. Pure functions.
lib/events/canonical.ts → no Node imports (used in browser)
lib/paypal/client.ts exports money-moving fns; ESLint restricts their import to lib/orchestrator/** and scripts/**
```

Add to `.eslintrc`:
```js
"no-restricted-imports": ["error", { patterns: [{
  group: ["**/lib/paypal/client", "@/lib/paypal/client"],
  message: "Only lib/orchestrator may move money."
}]}]
```
…with an `overrides` entry that turns it off for `src/lib/orchestrator/**`, `src/lib/paypal/**`, `scripts/**`, `tests/**`.

## Why these choices

- **Single Next.js app**: one deployable, server routes keep secrets, fewer moving parts on camera.
- **SQLite + seed on boot**: zero setup for judges; reset button rebuilds demo state. Render free disk is
  ephemeral — acceptable *because* we seed on boot.
- **AI SDK**: the PayPal Agent Toolkit ships an AI SDK adapter, so Guardian tools and PayPal tools live in one `tools` object.
- **Deterministic gate**: the defensible story for an agent that spends money.
