# 03 — PayPal Integration

Money moves in four PayPal steps: **authorize → capture (exact amount) → payout → confirm by webhook**,
plus **void** for cancel/expiry. The Agent Toolkit gives the Guardian read tools. Every write carries a
`PayPal-Request-Id`.

Base URLs: sandbox `https://api-m.sandbox.paypal.com`, live never used.

## 0. Day-0 checks (do these FIRST — milestone M0)

Run `pnpm paypal:smoke` (`scripts/paypal-smoke.ts`) against the sandbox and record answers in
`PROGRESS.md → Day-0 findings`:

- [ ] OAuth token works with the **platform** app's client id/secret.
- [ ] Payouts is enabled for the platform sandbox business account (may need "Payouts" feature toggled
      in the sandbox app settings / funded balance). If 403 `AUTHORIZATION_ERROR` → see Fallback A.
- [ ] Capturing **less** than the authorized amount with `final_capture: true` succeeds and the
      authorization ends in a state with no remaining capturable amount (record exact `status` values).
- [ ] After capture, the platform balance can fund the payout (sandbox captures may sit `PENDING`;
      record the behaviour). If not → fund the platform sandbox account with sandbox balance up front.
- [ ] The webhook event names below appear in the sandbox app's webhook event list.
- [ ] `@paypal/agent-toolkit` current version + its exported tool names (re-read README; there is no
      payouts tool as far as we know — Payouts goes over REST).

## 1. Sandbox accounts (`.env`)

| Account | Type | Used for |
|---|---|---|
| Platform (Earmark) | Business, owns the REST app | Orders, captures, payouts, webhooks |
| Sender (Wanjiru) | Personal | Approves the PayPal Buttons popup |
| School (Lakeview) | Business | Payout receiver (`institutions.paypal_email`) |
| Lookalike | Personal/Business | Receiver email used only in attack fixtures (should never get paid) |

## 2. Client design

```
src/lib/paypal/
  types.ts     # PayPalClient interface + DTOs
  sandbox.ts   # real fetch implementation
  mock.ts      # in-memory implementation (deterministic, honours Request-Id)
  client.ts    # export const paypal: PayPalClient = env.PAYPAL_MODE === "sandbox" ? sandbox : mock
  toolkit.ts   # Agent Toolkit tools for the Guardian (read-only actions)
  webhooks.ts  # verifyWebhook()
```

```ts
export interface PayPalClient {
  createAuthorizeOrder(i: { earmarkId: string; amountMinor: number; currency: string; description: string }, requestId: string): Promise<{ orderId: string }>;
  authorizeOrder(orderId: string, requestId: string): Promise<{ authorizationId: string; status: string; expirationTime?: string }>;
  getAuthorization(authId: string): Promise<{ status: string; amountMinor: number }>;
  captureAuthorization(i: { authorizationId: string; amountMinor: number; currency: string; invoiceId: string; finalCapture: boolean }, requestId: string): Promise<{ captureId: string; status: string }>;
  voidAuthorization(authId: string, requestId: string): Promise<{ status: string }>;
  createPayout(i: { senderBatchId: string; senderItemId: string; receiverEmail: string; amountMinor: number; currency: string; note: string }, requestId: string): Promise<{ batchId: string; batchStatus: string }>;
  getPayoutBatch(batchId: string): Promise<{ batchStatus: string; items: { payoutItemId: string; transactionStatus: string }[] }>;
}
```

Requirements:
- Token cached until `expires_in - 60s`.
- Every call logs `{method, path, requestId, status, debug_id}` into a `trace.step` event (redact secrets).
- Non-2xx → typed `PayPalError { name, message, debugId, details }`.
- Mock: same `requestId` → returns the stored first response (proves idempotency in unit tests).
  Mock also exposes `mock.failNext("capture" | "payout")` for failure-path tests.

## 3. Endpoints

### 3.1 Hold the money (Orders v2)

```http
POST /v2/checkout/orders
PayPal-Request-Id: em_123:order
{
  "intent": "AUTHORIZE",
  "purchase_units": [{
    "reference_id": "em_123",
    "custom_id": "em_123",
    "description": "Earmark: Term 1 fees, Lakeview Secondary School",
    "amount": { "currency_code": "USD", "value": "400.00" }
  }]
}
```
Frontend: PayPal JS SDK `<script src="https://www.paypal.com/sdk/js?client-id=...&intent=authorize&currency=USD">`
(use `@paypal/react-paypal-js` with `intent: "authorize"`). `createOrder` → our `POST /api/earmarks/:id/paypal/order`;
`onApprove` → our `POST /api/earmarks/:id/paypal/authorize` which calls:

```http
POST /v2/checkout/orders/{order_id}/authorize
PayPal-Request-Id: em_123:authorize
```
Store `purchase_units[0].payments.authorizations[0].id`, `authorized_at = now`, and append `paypal.authorized`.

**Honor period:** an authorization is valid 29 days but funds are only guaranteed for 3 days. Demo Earmarks
default `expiresAt = now + 3 days`. README states the limit; re-authorization is a stretch item.

### 3.2 Take only what is real (Payments v2)

```http
POST /v2/payments/authorizations/{authorization_id}/capture
PayPal-Request-Id: pay_789:capture
{
  "amount": { "currency_code": "USD", "value": "350.00" },
  "invoice_id": "inv_456",
  "final_capture": true,
  "note_to_payer": "Lakeview Secondary School — Term 1 fees (verified)"
}
```
MVP = one invoice per Earmark → `final_capture: true`; remainder = `cap - captured` → append
`remainder.released` with that amount. (Installments stretch → `final_capture: false` until the last.)

### 3.3 Pay the school (Payouts v1)

```http
POST /v1/payments/payouts
PayPal-Request-Id: pay_789:payout
{
  "sender_batch_header": {
    "sender_batch_id": "pay_789",
    "email_subject": "Earmark payment received",
    "email_message": "Term 1 fees for Brian Kamau, verified invoice inv_456"
  },
  "items": [{
    "recipient_type": "EMAIL",
    "amount": { "value": "350.00", "currency": "USD" },
    "receiver": "<institutions.paypal_email>",
    "sender_item_id": "pay_789",
    "note": "Invoice LSS-2026-T1-0042"
  }]
}
```
Response → `batch_header.payout_batch_id`. Poll `GET /v1/payments/payouts/{batch_id}` every 5s up to 2 min
as fallback if webhooks don't arrive. `sender_batch_id` uniqueness is a second idempotency layer.

### 3.4 Release / cancel

```http
POST /v2/payments/authorizations/{authorization_id}/void
PayPal-Request-Id: em_123:void
```
Used on sender cancel and on expiry (stretch: automatic via a cron-ish check on page load + Render cron).

### 3.5 Webhooks

Route: `POST /api/paypal/webhook`. Subscribe to:

```
PAYMENT.AUTHORIZATION.CREATED     PAYMENT.AUTHORIZATION.VOIDED
PAYMENT.CAPTURE.COMPLETED         PAYMENT.CAPTURE.DENIED      PAYMENT.CAPTURE.PENDING
PAYMENT.PAYOUTSBATCH.SUCCESS      PAYMENT.PAYOUTSBATCH.DENIED PAYMENT.PAYOUTSBATCH.PROCESSING
PAYMENT.PAYOUTS-ITEM.SUCCEEDED    PAYMENT.PAYOUTS-ITEM.FAILED PAYMENT.PAYOUTS-ITEM.BLOCKED
PAYMENT.PAYOUTS-ITEM.UNCLAIMED    PAYMENT.PAYOUTS-ITEM.RETURNED
```
(Confirm exact names in the sandbox app's list on day 0.)

Verification:
```http
POST /v1/notifications/verify-webhook-signature
{
  "auth_algo":        <header PAYPAL-AUTH-ALGO>,
  "cert_url":         <header PAYPAL-CERT-URL>,
  "transmission_id":  <header PAYPAL-TRANSMISSION-ID>,
  "transmission_sig": <header PAYPAL-TRANSMISSION-SIG>,
  "transmission_time":<header PAYPAL-TRANSMISSION-TIME>,
  "webhook_id":       env.PAYPAL_WEBHOOK_ID,
  "webhook_event":    <parsed body>
}
→ { "verification_status": "SUCCESS" }
```
Handler: dedupe on `body.id` in `webhook_events`; map `resource.custom_id` / `sender_item_id` → payment;
append `paypal.*` events; update payment/earmark status. Unverified → store with `verified=false`, ignore.
Return 200 quickly in all handled cases.

Webhooks need a public URL → develop the webhook step against the Render deployment.

### 3.6 Agent Toolkit (Guardian read tools)

```ts
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";

export const paypalToolkit = new PayPalAgentToolkit({
  clientId: env.PAYPAL_CLIENT_ID,
  clientSecret: env.PAYPAL_CLIENT_SECRET,
  configuration: {
    actions: {
      orders: { get: true },          // READ ONLY. Never enable create/capture for the agent.
      transactions: { list: true },   // confirm exact key name in README on day 0
    },
    context: { sandbox: true },
  },
});
// guardian tools = { ...ourTools, ...paypalToolkit.getTools() }
```
In `PAYPAL_MODE=mock`, replace with stub tools of the same names that read from the mock store.
**Found in sandbox (2026-11-12):** the toolkit's `execute` returns the PayPal response as a JSON *string*
(and a `{ok:false,status:404,…}` string on errors); `paypal/toolkit.ts` parses it before the Guardian reads it.
Show the toolkit tool calls in the trace drawer — judges for "Best Use of PayPal + AI" need to see them.

**MCP server (developer + demo):** add `.mcp.json` so Claude Code (and the demo narrative) can query the
sandbox through PayPal's MCP server:
```json
{ "mcpServers": { "paypal": { "command": "npx", "args": ["-y", "@paypal/mcp", "--tools=all"],
  "env": { "PAYPAL_ACCESS_TOKEN": "${PAYPAL_ACCESS_TOKEN}", "PAYPAL_ENVIRONMENT": "SANDBOX" } } } }
```
Use it during development to inspect orders/transactions; mention it in the README "How PayPal is used".

### 3.7 What the code does (M5)

- Capture 4xx → payment `failed`, Earmark back to `held`, `paypal.capture_failed {retryable:false}`. Capture 5xx or a
  network error is ambiguous → payment stays `pending`, the Earmark page retries with the same `pay_x:capture`.
- Payout failure → payment `failed` with the capture kept; the Earmark page retries with the same `pay_x:payout`
  (and `sender_batch_id = pay_x`), so it can never pay twice. Earmark → `paid` only on payout item SUCCESS
  (poll on page load, or a verified webhook).
- The mock PayPal adopts holds recorded in our DB (seeded `AUTH-SEED-…`, or holds made before a dev restart).

## 4. Fallbacks

- **A. Payouts not enabled:** try enabling in sandbox app → if still blocked, capture to platform and
  send the school leg as a second sandbox order paid from the platform account where allowed. If neither
  works, set `PAYOUT_MODE=simulated`: orchestrator records `paypal.payout_sent` with `simulated: true`,
  UI shows a "Simulated payout" chip, README says so plainly. Never hide it.
- **B. Webhooks unreachable locally:** poll `getPayoutBatch` / `getAuthorization`.
- **C. Capture pending in sandbox:** treat `PENDING` as captured-for-demo but record status honestly.

## 5. Tests

- `tests/paypal/mock.test.ts`: same Request-Id twice → one capture; failNext → typed error.
- `tests/orchestrator/execute.test.ts`: happy path, replay (no second payout), capture fail → status back
  to `held` + event, payout fail → payment `failed` + event, never captures more than remaining cap.
- `scripts/paypal-smoke.ts` (manual, sandbox): order → (prints approve URL; waits for Enter) → authorize →
  capture $1.00 of $2.00 final → payout $1.00 → void on a second auth. Prints every ID + status.
