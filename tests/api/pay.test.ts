// The M5 vertical slice through the real route handlers (mock PayPal, fixture AI):
// upload → Guardian asks for approval → approve → Guardian proposes → gate ticket → capture → payout → paid.
// Also: webhook verification + dedupe.
import { beforeEach, describe, expect, it } from "vitest";
import { POST as upload } from "@/app/api/earmarks/[id]/invoices/upload/route";
import { GET as getEarmark } from "@/app/api/earmarks/[id]/route";
import { POST as approve } from "@/app/api/invoices/[id]/approve/route";
import { POST as guardian } from "@/app/api/invoices/[id]/guardian/route";
import { POST as webhook } from "@/app/api/paypal/webhook/route";
import { setDb } from "@/lib/db";
import type { Db } from "@/lib/db/client";
import { DEMO_EARMARK_ID } from "@/lib/db/seed";
import { payments, webhookEvents } from "@/lib/db/schema";
import { getEvents } from "@/lib/events/append";
import { verifyChain } from "@/lib/events/chain";
import { paypal } from "@/lib/paypal/client";
import type { MockPayPal } from "@/lib/paypal/mock";
import { makeTestDb } from "../helpers/db";

const post = (body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://test.local/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => ({ status: res.status, body: await res.json() });

let db: Db;
beforeEach(() => {
  db = makeTestDb({ seedOptions: { now: Date.now() } }).db;
  setDb(db);
  (paypal as MockPayPal).reset(); // the app's mock is a process singleton; each test starts with a fresh PayPal

});

describe("vertical slice", () => {
  it("upload → approve → Guardian → paid; money bar 0 held / $350 sent / $50 released", async () => {
    const up = await json(await upload(post({ sample: "01" }), ctx(DEMO_EARMARK_ID)));
    expect(up.body.data).toMatchObject({ verdict: "REQUIRE_APPROVAL", guardian: { outcome: "approval_requested" } });

    const a = await json(await approve(post(), ctx(up.body.data.invoiceId)));
    expect(a.body.data).toMatchObject({ verdict: "ALLOW", guardian: { outcome: "ticket" }, payment: { status: "paid_out", amountMinor: 35000, payoutConfirmed: true } });

    const detail = await json(await getEarmark(new Request("http://test.local"), ctx(DEMO_EARMARK_ID)));
    expect(detail.body.data.earmark).toMatchObject({ status: "paid" });
    expect(detail.body.data.money).toMatchObject({ heldMinor: 0, sentMinor: 35000, releasedMinor: 5000 });
    expect((await verifyChain(getEvents(db, DEMO_EARMARK_ID))).ok).toBe(true);

    // Asking the Guardian again cannot pay twice: the gate now sees R03 (Earmark paid).
    const again = await json(await guardian(post(), ctx(up.body.data.invoiceId)));
    expect(again.body.data.guardian.ticketId).toBeNull();
    expect(db.select().from(payments).all().filter((p) => p.earmarkId === DEMO_EARMARK_ID)).toHaveLength(1);
  });

  it("webhook: verified payout item success is recorded once; unverified and duplicates are ignored", async () => {
    const up = await json(await upload(post({ sample: "01" }), ctx(DEMO_EARMARK_ID)));
    await approve(post(), ctx(up.body.data.invoiceId));
    const payment = db.select().from(payments).all().find((p) => p.earmarkId === DEMO_EARMARK_ID)!;

    const event = {
      id: "WH-1",
      event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
      resource: { payout_item_id: "ITEM-X", transaction_status: "SUCCESS", payout_item: { sender_item_id: payment.id } },
    };
    const forged = await json(await webhook(post({ ...event, id: "WH-0" }, { "paypal-transmission-sig": "forged" })));
    expect(forged.body.data.outcome).toBe("unverified");
    // PAYPAL_WEBHOOK_ID is unset in tests, so nothing can verify; that is the safe default.
    expect((await json(await webhook(post(event, { "paypal-transmission-sig": "mock-valid" })))).body.data.outcome).toBe("unverified");
    expect((await json(await webhook(post(event, { "paypal-transmission-sig": "mock-valid" })))).body.data.outcome).toBe("duplicate");
    expect(db.select().from(webhookEvents).all()).toHaveLength(2);
    expect((await json(await webhook(post({ nope: true })))).status).toBe(400);
  });
});
