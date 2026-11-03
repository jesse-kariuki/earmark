// SQLite schema (docs/02-DATA-MODEL.md). Money columns are integer minor units (`*_minor`).
// `events` is append-only: only appendEvent() inserts, and DB triggers (drizzle/0001_events_append_only.sql) refuse UPDATE/DELETE.
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { IntentContract } from "@/lib/contract/schema";
import type { RuleResult } from "@/lib/policy/types";

export const EARMARK_STATUSES = [
  "draft",
  "awaiting_authorization",
  "held",
  "paying",
  "partially_paid",
  "paid",
  "voided",
  "expired",
] as const;
export type EarmarkStatus = (typeof EARMARK_STATUSES)[number];

export const institutions = sqliteTable("institutions", {
  id: text("id").primaryKey(), // ins_lakeview
  name: text("name").notNull(),
  paypalEmail: text("paypal_email").notNull(), // payout destination (sandbox business acct)
  publicKey: text("public_key"), // Ed25519 SPKI PEM, base64; null = legacy-only
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
  contractHash: text("contract_hash"), // sha256(canonical(contract)) once approved → frozen
  capMinor: integer("cap_minor").notNull(),
  currency: text("currency").notNull(),
  status: text("status").$type<EarmarkStatus>().notNull(),
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

export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    earmarkId: text("earmark_id")
      .notNull()
      .references(() => earmarks.id),
    source: text("source").$type<"signed" | "uploaded">().notNull(),
    fileHash: text("file_hash").notNull(), // sha256 of file bytes, or of canonical signed payload
    invoiceNumber: text("invoice_number"),
    institutionId: text("institution_id"), // resolved from registry, null if unknown
    payeeName: text("payee_name"),
    payeeAccount: text("payee_account"), // email as printed / signed
    amountMinor: integer("amount_minor"),
    currency: text("currency"),
    extracted: text("extracted", { mode: "json" }), // full ExtractedInvoice incl. confidences
    signature: text("signature"), // connected mode
    verdict: text("verdict").$type<"ALLOW" | "BLOCK" | "REQUIRE_APPROVAL" | "PENDING">().notNull(),
    reasons: text("reasons", { mode: "json" }).$type<RuleResult[]>().notNull(),
    approvedBy: text("approved_by"), // "sender" when human approves
    storagePath: text("storage_path"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("invoices_file_hash_uq").on(t.fileHash),
    uniqueIndex("invoices_inst_num_uq").on(t.institutionId, t.invoiceNumber),
  ],
);

export const tickets = sqliteTable("tickets", {
  id: text("id").primaryKey(), // tk_…
  earmarkId: text("earmark_id").notNull(),
  invoiceId: text("invoice_id").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  payeeEmail: text("payee_email").notNull(),
  mac: text("mac").notNull(), // HMAC-SHA256(TICKET_SECRET, canonical(fields))
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  redeemedAt: integer("redeemed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    earmarkId: text("earmark_id").notNull(),
    invoiceId: text("invoice_id").notNull(),
    ticketId: text("ticket_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    captureId: text("capture_id"),
    payoutBatchId: text("payout_batch_id"),
    payoutItemId: text("payout_item_id"),
    status: text("status").$type<"pending" | "captured" | "paid_out" | "failed">().notNull(),
    idempotencyKey: text("idempotency_key").notNull(), // = payment id
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("payments_invoice_uq").on(t.invoiceId), uniqueIndex("payments_ticket_uq").on(t.ticketId)],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    earmarkId: text("earmark_id").notNull(),
    seq: integer("seq").notNull(), // 0,1,2… per earmark
    type: text("type").notNull(),
    actor: text("actor").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    prevHash: text("prev_hash").notNull(), // 64 zeros for seq 0
    hash: text("hash").notNull(),
    // Stored as ms integer and hashed as such (not timestamp mode, so the hashed value round-trips exactly).
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("events_earmark_seq_uq").on(t.earmarkId, t.seq), index("events_earmark_idx").on(t.earmarkId)],
);

export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(), // PayPal event id → dedupe
  type: text("type").notNull(),
  verified: integer("verified", { mode: "boolean" }).notNull(),
  body: text("body", { mode: "json" }).notNull(),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
});

export type Institution = typeof institutions.$inferSelect;
export type Earmark = typeof earmarks.$inferSelect;
export type NewEarmark = typeof earmarks.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type EventRow = typeof events.$inferSelect;
