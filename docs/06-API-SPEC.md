# 06 — API Spec (Next.js route handlers)

All handlers: Zod-validate input, return `{ ok: true, data } | { ok: false, error: { code, message } }`,
rate-limit write routes (simple in-memory token bucket per IP, 30/min) on the hosted demo.

## Earmarks (sender)

| Method & path | Body / query | Does |
|---|---|---|
| `POST /api/contracts/compile` | `{ sentence }` | LLM compile → draft contract + resolution warnings. No DB write. |
| `POST /api/earmarks` | `{ sentence, contract, senderName, recipientName }` | Validates; creates earmark `draft`; events `earmark.created`, `contract.compiled` |
| `POST /api/earmarks/:id/approve-contract` | — | Freezes contract (hash) → `awaiting_authorization`; `contract.approved` |
| `POST /api/earmarks/:id/paypal/order` | — | Orders v2 create (AUTHORIZE) → `{ orderId }` |
| `POST /api/earmarks/:id/paypal/authorize` | `{ orderId }` | Authorize → store auth id → `held` |
| `GET  /api/earmarks` | `?status=` | List for ledger (joined with payments, invoices counts) |
| `GET  /api/earmarks/:id` | — | Detail incl. money bar numbers `{ heldMinor, sentMinor, releasedMinor }` |
| `POST /api/earmarks/:id/freeze` | `{ frozen: boolean }` | Toggle pause; event |
| `POST /api/earmarks/:id/cancel` | — | Void authorization → `voided` |
| `GET  /api/earmarks/:id/events` | — | Full ordered event chain (public; used by receipt) |
| `GET  /api/earmarks/:id/trace` | — | Events of type `trace.step`, `policy.evaluated`, `ticket.*`, `paypal.*` rendered for the drawer |

## Invoices

| Method & path | Body | Does |
|---|---|---|
| `POST /api/earmarks/:id/invoices/upload` | multipart `file` | sha256 → duplicate pre-check → store file in `.data/uploads` → extract → crosscheck → gate → save invoice + events. Returns verdict + reasons. |
| `POST /api/invoices/:id/approve` | — | Sender approval → sets approvedBySender → re-run gate → if ALLOW, run Guardian |
| `POST /api/invoices/:id/reject` | — | `approval.rejected` |
| `POST /api/invoices/:id/guardian` | — | Runs Guardian agent; if it obtains a ticket, the handler calls `orchestrator.execute(ticketId)`. Streams trace steps (SSE or simple polling). |

## Institution API (connected mode — public, documented in `public/openapi.yaml`)

| Method & path | Body | Does |
|---|---|---|
| `GET  /api/institution/registry` | — | Public list `{ id, name, verified, publicKey }` |
| `POST /api/institution/invoices` | `{ payload, signature, keyId }` | Verify signature → create invoice `source=signed` → gate → auto-run Guardian if ALLOW |
| `GET  /api/institution/invoices/:id` | — | Status for the school console (paid / blocked + reasons) |
| `POST /api/school/issue` *(demo helper)* | `{ earmarkRef, lineItems }` | Server-side Registrar signs with the seeded school key and calls the endpoint above (so the console needs no key handling in the browser) |

## Recipient

| `GET /api/r/:id` | Recipient-safe view: beneficiary, institution, amount paid, date, messages EN/SW |
| `POST /api/r/:id/confirm` | `recipient.confirmed` event |

## PayPal & admin

| `POST /api/paypal/webhook` | See 03 §3.5 |
| `POST /api/admin/reset` | Header `x-reset-token` or judge mode → drop/migrate/seed |
| `POST /api/lab/:scenario` | Runs an Attack Lab scenario end-to-end (see 09) |
| `GET  /api/health` | `{ ok, paypalMode, aiMode, dbSeededAt }` (Render health check) |

## Error codes

`VALIDATION`, `NOT_FOUND`, `CONFLICT_DUPLICATE`, `POLICY_BLOCKED` (with `ruleIds`), `PAYPAL_ERROR`
(with `debugId`), `AI_ERROR`, `RATE_LIMITED`, `FROZEN`.

## Integration tests (`tests/api/*.test.ts`)

Call route handlers directly (import `POST` from the route module with a `Request`), with
`PAYPAL_MODE=mock AI_MODE=fixture` and a fresh in-memory SQLite per test file. Required:
1. compile → create → approve → order → authorize → status `held`.
2. connected invoice $350 → Guardian → paid; money bar = 0 held / 350 sent / 50 released.
3. Same signed invoice posted again → `CONFLICT_DUPLICATE`, still exactly one payment & one payout.
4. Upload swapped-account fixture → BLOCK with R05.
5. Freeze then post a valid invoice → BLOCK with R01.
