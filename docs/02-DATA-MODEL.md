# 02 — Data Model (SQLite + Drizzle)

Five core tables + two support tables. The `events` table is the source of truth for the receipt.
All money columns are **integer minor units** (`*_minor`). IDs are prefixed strings via `nanoid`
(`em_`, `inv_`, `pay_`, `evt_`, `ins_`, `tk_`).

## `src/lib/db/schema.ts` (starting point — adjust, but keep names)

```ts
import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const institutions = sqliteTable("institutions", {
  id: text("id").primaryKey(),                    // ins_lakeview
  name: text("name").notNull(),
  aliases: text("aliases", { mode: "json" }).$type<string[]>().notNull().default([]), // exact-match alternates
  paypalEmail: text("paypal_email").notNull(),    // payout destination (sandbox business acct)
  publicKey: text("public_key"),                  // Ed25519 PEM/base64; null = legacy-only
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  country: text("country").notNull().default("KE"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const earmarks = sqliteTable("earmarks", {
  id: text("id").primaryKey(),
  senderName: text("sender_name").notNull(),
  recipientName: text("recipient_name").notNull(),
  sentence: text("sentence").notNull(),
  contract: text("contract", { mode: "json" }).$type<IntentContract>().notNull(),
  contractHash: text("contract_hash"),            // sha256(canonical(contract)) once approved → frozen
  capMinor: integer("cap_minor").notNull(),
  currency: text("currency").notNull(),           // "USD"
  status: text("status").notNull(),               // see 01-ARCHITECTURE state machine
  frozen: integer("frozen", { mode: "boolean" }).notNull().default(false),
  paypalOrderId: text("paypal_order_id"),
  authorizationId: text("authorization_id"),
  authorizedAt: integer("authorized_at", { mode: "timestamp_ms" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  capturedMinor: integer("captured_minor").notNull().default(0),
  releasedMinor: integer("released_minor").notNull().default(0),
  recipientConfirmedAt: integer("recipient_confirmed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  earmarkId: text("earmark_id").notNull().references(() => earmarks.id),
  source: text("source").notNull(),               // "signed" | "uploaded"
  fileHash: text("file_hash").notNull(),          // sha256 of file bytes, or of canonical signed payload
  invoiceNumber: text("invoice_number"),
  institutionId: text("institution_id"),          // resolved from registry, null if unknown
  payeeName: text("payee_name"),
  payeeAccount: text("payee_account"),            // email as printed / signed
  amountMinor: integer("amount_minor"),
  currency: text("currency"),
  extracted: text("extracted", { mode: "json" }), // full ExtractedInvoice incl. confidences
  signature: text("signature"),                   // connected mode
  verdict: text("verdict").notNull(),             // ALLOW | BLOCK | REQUIRE_APPROVAL | PENDING
  reasons: text("reasons", { mode: "json" }).$type<RuleResult[]>().notNull(),
  approvedBy: text("approved_by"),                // "sender" when human approves
  storagePath: text("storage_path"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => ({
  fileHashUq: uniqueIndex("invoices_file_hash_uq").on(t.fileHash),
  numUq: uniqueIndex("invoices_inst_num_uq").on(t.institutionId, t.invoiceNumber),
}));

export const tickets = sqliteTable("tickets", {
  id: text("id").primaryKey(),                    // tk_…
  earmarkId: text("earmark_id").notNull(),
  invoiceId: text("invoice_id").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  payeeEmail: text("payee_email").notNull(),
  mac: text("mac").notNull(),                     // HMAC-SHA256(TICKET_SECRET, canonical(fields))
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  redeemedAt: integer("redeemed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  earmarkId: text("earmark_id").notNull(),
  invoiceId: text("invoice_id").notNull(),
  ticketId: text("ticket_id").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  captureId: text("capture_id"),
  payoutBatchId: text("payout_batch_id"),
  payoutItemId: text("payout_item_id"),
  status: text("status").notNull(),               // pending | captured | paid_out | failed
  idempotencyKey: text("idempotency_key").notNull(), // = payment id
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => ({
  invoiceUq: uniqueIndex("payments_invoice_uq").on(t.invoiceId),
  ticketUq: uniqueIndex("payments_ticket_uq").on(t.ticketId),
}));

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  earmarkId: text("earmark_id").notNull(),
  seq: integer("seq").notNull(),                  // 0,1,2… per earmark
  type: text("type").notNull(),
  actor: text("actor").notNull(),                 // sender | school | recipient | guardian | gate | orchestrator | paypal | system
  payload: text("payload", { mode: "json" }).notNull(),
  prevHash: text("prev_hash").notNull(),          // "GENESIS" (64 zeros) for seq 0
  hash: text("hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => ({
  seqUq: uniqueIndex("events_earmark_seq_uq").on(t.earmarkId, t.seq),
  byEarmark: index("events_earmark_idx").on(t.earmarkId),
}));

export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(),                    // PayPal event id → dedupe
  type: text("type").notNull(),
  verified: integer("verified", { mode: "boolean" }).notNull(),
  body: text("body", { mode: "json" }).notNull(),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
});
```

Also add an `agent_traces` table (or store trace steps as `trace.step` events) — **prefer events**, so the
trace is covered by the hash chain. See `08-PROOF-RECEIPT.md` for event types.

## Event types (exhaustive list — use these strings)

```
earmark.created            contract.compiled          contract.approved
paypal.order_created       paypal.authorized          invoice.received
invoice.extracted          invoice.signature_checked  policy.evaluated
approval.requested         approval.granted           approval.rejected
ticket.issued              ticket.redeemed            paypal.captured            paypal.capture_failed
paypal.payout_sent         paypal.payout_succeeded    paypal.payout_failed
remainder.released         recipient.notified         recipient.confirmed
earmark.frozen             earmark.unfrozen           earmark.voided
earmark.expired            trace.step                 attack.started
```

## Seed (`src/lib/db/seed.ts`) — runs on boot and on reset

- Institutions: `ins_lakeview` (Lakeview Secondary School, verified, has public key, school sandbox email),
  `ins_lookalike` ("Lakeview Secondary Schools Ltd", unverified, different email, no key),
  `ins_riverbend` (Riverbend Academy, verified) for ledger variety.
- Earmarks: one fresh `held` Earmark for the live demo (`em_demo`; `AUTH-SEED-…` id in mock mode; in sandbox
  mode it is seeded as `awaiting_authorization` with no PayPal ids, since a real auth can't be faked), plus ~8 historical
  Earmarks across 4 beneficiaries (paid, voided, blocked attempts) so the AG Grid ledger looks like a
  sponsor/scholarship-fund view. Historical ones get full, valid event chains generated by the real
  `appendEvent()`.
- Keys: school keypair from `SCHOOL_PRIVATE_KEY`/`SCHOOL_PUBLIC_KEY` env; if absent, `scripts/gen-keys.ts`
  writes a dev pair to `.data/keys/` (gitignored).
- Reset: `POST /api/admin/reset` (guarded by `DEMO_RESET_TOKEN` or judge mode) → drop, migrate, seed.

## Money helpers (`src/lib/money.ts`)

```ts
toMinor("350.00") === 35000
toPayPalValue(35000) === "350.00"
formatMoney(35000, "USD") === "$350.00"
kesEstimate(35000) // display only, labelled "≈ KES (estimate)", fixed rate from env KES_DISPLAY_RATE
```
Unit-test rounding edge cases (`"0.1" + "0.2"`, `"400"`, `"399.999"` → reject >2 dp).
