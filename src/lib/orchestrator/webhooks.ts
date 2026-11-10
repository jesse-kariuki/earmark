import "server-only";
// PayPal webhooks (docs/03-PAYPAL-INTEGRATION.md §3.5): verify → dedupe on event id → map to our payment → record.
// Webhooks only ever CONFIRM what the orchestrator already did (or report a failure); they never start a payment.
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { payments, webhookEvents } from "@/lib/db/schema";
import { appendEvent } from "@/lib/events/append";
import type { PayPalClient, WebhookVerification } from "@/lib/paypal/types";
import { recordPayoutResult } from "./execute";

export const WebhookBody = z.object({
  id: z.string().min(1).max(100),
  event_type: z.string().min(1).max(100),
  resource: z.record(z.string(), z.unknown()).default({}),
});

const PayoutItemResource = z.object({
  payout_item_id: z.string(),
  transaction_status: z.string(),
  payout_item: z.object({ sender_item_id: z.string() }),
});

const CaptureResource = z.object({ id: z.string(), status: z.string().optional(), invoice_id: z.string().optional() });

export type WebhookOutcome = "recorded" | "duplicate" | "unverified" | "ignored";

export async function handleWebhook(
  db: Db,
  paypal: PayPalClient,
  input: { webhookId: string | undefined; headers: WebhookVerification["headers"]; body: z.infer<typeof WebhookBody> },
  now: number,
): Promise<WebhookOutcome> {
  const { body } = input;
  if (db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.id, body.id)).get()) return "duplicate";

  const verified = input.webhookId ? await paypal.verifyWebhookSignature({ webhookId: input.webhookId, headers: input.headers, event: body }).catch(() => false) : false;
  const inserted = db
    .insert(webhookEvents)
    .values({ id: body.id, type: body.event_type, verified, body, receivedAt: new Date(now) })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id })
    .get();
  if (!inserted) return "duplicate"; // a concurrent delivery of the same event won the insert
  if (!verified) return "unverified";

  if (body.event_type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
    const r = PayoutItemResource.safeParse(body.resource);
    if (!r.success) return "ignored";
    const paymentId = r.data.payout_item.sender_item_id; // we send the payment id as sender_item_id
    const result = recordPayoutResult(db, paymentId, { payoutItemId: r.data.payout_item_id, transactionStatus: r.data.transaction_status, source: "webhook" }, now);
    return result.ok ? "recorded" : "ignored";
  }

  if (body.event_type.startsWith("PAYMENT.CAPTURE.")) {
    const r = CaptureResource.safeParse(body.resource);
    if (!r.success || !r.data.invoice_id) return "ignored";
    const p = db.select().from(payments).where(eq(payments.invoiceId, r.data.invoice_id)).get();
    if (!p) return "ignored";
    appendEvent(
      db,
      { earmarkId: p.earmarkId, type: "trace.step", actor: "paypal", payload: { stage: "webhook", eventType: body.event_type, webhookEventId: body.id, captureId: r.data.id, status: r.data.status ?? null } },
      { now },
    );
    return "recorded";
  }
  return "ignored";
}
