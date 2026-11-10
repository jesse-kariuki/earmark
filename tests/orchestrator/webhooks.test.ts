import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { earmarks, payments } from "@/lib/db/schema";
import { getEvents } from "@/lib/events/append";
import { handleWebhook } from "@/lib/orchestrator/webhooks";
import { createMockPayPal } from "@/lib/paypal/mock";
import { makeTestDb, TEST_NOW } from "../helpers/db";

const headers = (sig: string) => ({ authAlgo: "SHA256withRSA", certUrl: "https://x", transmissionId: "t", transmissionSig: sig, transmissionTime: "now" });

describe("handleWebhook", () => {
  it("records a verified payout success on the payment it names, once", async () => {
    const { db } = makeTestDb();
    // A payment that was sent but not yet confirmed.
    db.insert(payments)
      .values({ id: "pay_w", earmarkId: "em_demo", invoiceId: "inv_w", ticketId: "tk_w", amountMinor: 35000, currency: "USD", status: "paid_out", payoutBatchId: "B1", idempotencyKey: "pay_w", createdAt: new Date(TEST_NOW) })
      .run();
    db.update(earmarks).set({ status: "paying", capturedMinor: 35000, releasedMinor: 5000 }).where(eq(earmarks.id, "em_demo")).run();
    const pp = createMockPayPal();
    const body = { id: "WH-9", event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", resource: { payout_item_id: "I1", transaction_status: "SUCCESS", payout_item: { sender_item_id: "pay_w" } } };

    expect(await handleWebhook(db, pp, { webhookId: "WHID", headers: headers("mock-valid"), body }, TEST_NOW)).toBe("recorded");
    expect(await handleWebhook(db, pp, { webhookId: "WHID", headers: headers("mock-valid"), body }, TEST_NOW)).toBe("duplicate");
    expect(db.select().from(payments).where(eq(payments.id, "pay_w")).get()).toMatchObject({ payoutItemId: "I1" });
    expect(db.select().from(earmarks).where(eq(earmarks.id, "em_demo")).get()!.status).toBe("paid");
    expect(getEvents(db, "em_demo").filter((e) => e.type === "paypal.payout_succeeded")).toHaveLength(1);

    expect(await handleWebhook(db, pp, { webhookId: "WHID", headers: headers("bad"), body: { ...body, id: "WH-10" } }, TEST_NOW)).toBe("unverified");
    expect(await handleWebhook(db, pp, { webhookId: "WHID", headers: headers("mock-valid"), body: { id: "WH-11", event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", resource: {} } }, TEST_NOW)).toBe("ignored");
    expect(await handleWebhook(db, pp, { webhookId: "WHID", headers: headers("mock-valid"), body: { id: "WH-12", event_type: "CHECKOUT.ORDER.APPROVED", resource: {} } }, TEST_NOW)).toBe("ignored");
  });

  it("logs a capture webhook against the matching payment", async () => {
    const { db } = makeTestDb();
    db.insert(payments)
      .values({ id: "pay_c", earmarkId: "em_demo", invoiceId: "inv_c", ticketId: "tk_c", amountMinor: 100, currency: "USD", status: "captured", idempotencyKey: "pay_c", createdAt: new Date(TEST_NOW) })
      .run();
    const body = { id: "WH-C", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP-1", status: "COMPLETED", invoice_id: "inv_c" } };
    expect(await handleWebhook(db, createMockPayPal(), { webhookId: "WHID", headers: headers("mock-valid"), body }, TEST_NOW)).toBe("recorded");
    expect(getEvents(db, "em_demo").at(-1)!.payload).toMatchObject({ stage: "webhook", captureId: "CAP-1" });
    const unknown = { id: "WH-D", event_type: "PAYMENT.CAPTURE.DENIED", resource: { id: "CAP-2", invoice_id: "inv_zzz" } };
    expect(await handleWebhook(db, createMockPayPal(), { webhookId: "WHID", headers: headers("mock-valid"), body: unknown }, TEST_NOW)).toBe("ignored");
  });
});
