// docs/03 §5 + PLAN M5: happy path, replay ×3 → one capture + one payout, capture fail, payout fail, cap never exceeded.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { FIXTURES_DIR } from "@/lib/ai/runtime";
import type { Db } from "@/lib/db/client";
import { DEMO_EARMARK_ID } from "@/lib/db/seed";
import { earmarks, payments } from "@/lib/db/schema";
import { getEvents } from "@/lib/events/append";
import { verifyChain } from "@/lib/events/chain";
import { invoiceGateContext } from "@/lib/invoice/context";
import { approveInvoice, intakeUpload } from "@/lib/invoice/intake";
import { loadSample } from "@/lib/invoice/samples";
import { moneyBar } from "@/lib/earmarks/summary";
import { advancePayment, confirmPayout, executeTicket, type ExecuteDeps, pendingPaymentIds, recordPayoutResult } from "@/lib/orchestrator/execute";
import { createMockPayPal, type MockPayPal } from "@/lib/paypal/mock";
import { issueTicket } from "@/lib/policy/tickets";
import { makeTestDb, TEST_NOW, TEST_SEED_OPTIONS } from "../helpers/db";

let db: Db;
let pp: MockPayPal;
let deps: ExecuteDeps;

beforeEach(() => {
  db = makeTestDb().db;
  pp = createMockPayPal({
    resolveAuthorization: (id) => {
      const e = db.select().from(earmarks).where(eq(earmarks.authorizationId, id)).get();
      return e ? { amountMinor: e.capMinor, currency: e.currency } : null;
    },
  });
  deps = { paypal: pp, now: () => TEST_NOW, payoutMode: "real" };
});

/** Upload the clean sample, approve it, and mint a ticket the way the Guardian's proposePayment does. */
async function approvedTicket(sample = "01"): Promise<{ ticketId: string; invoiceId: string }> {
  const s = loadSample(sample)!;
  const ai = { mode: "fixture" as const, record: false, apiKeyPresent: false, fixturesDir: FIXTURES_DIR, now: () => TEST_NOW };
  const up = await intakeUpload(db, { earmarkId: DEMO_EARMARK_ID, bytes: s.bytes, mime: s.mime }, { ai, now: TEST_NOW, uploadsDir: null });
  if (!up.ok) throw new Error(up.error.message);
  const a = approveInvoice(db, up.value.invoiceId, TEST_NOW);
  if (!a.ok || a.value.gate.verdict !== "ALLOW") throw new Error("not allowed");
  const ticket = issueTicket(db, invoiceGateContext(db, up.value.invoiceId, TEST_NOW, { amountMinor: 35000 })!);
  return { ticketId: ticket.id, invoiceId: up.value.invoiceId };
}

const earmark = () => db.select().from(earmarks).where(eq(earmarks.id, DEMO_EARMARK_ID)).get()!;
const types = () => getEvents(db, DEMO_EARMARK_ID).map((e) => e.type);

describe("executeTicket", () => {
  it("happy path: capture $350 → remainder $50 released → payout to the registry email → paid", async () => {
    const { ticketId } = await approvedTicket();
    const r = await executeTicket(db, deps, ticketId);
    expect(r).toMatchObject({ ok: true, value: { status: "paid_out", amountMinor: 35000, payoutConfirmed: true } });

    expect(earmark()).toMatchObject({ status: "paid", capturedMinor: 35000, releasedMinor: 5000 });
    expect(moneyBar(earmark())).toMatchObject({ heldMinor: 0, sentMinor: 35000, releasedMinor: 5000 });
    const { payouts, authorizations } = pp.inspect();
    expect(payouts).toEqual([expect.objectContaining({ amountMinor: 35000, receiverEmail: TEST_SEED_OPTIONS.schoolEmail })]);
    expect(authorizations[0]).toMatchObject({ status: "CAPTURED", capturedMinor: 35000 });
    expect(types().slice(-9)).toEqual([
      "ticket.issued",
      "ticket.redeemed",
      "trace.step",
      "paypal.captured",
      "remainder.released",
      "trace.step",
      "paypal.payout_sent",
      "trace.step",
      "paypal.payout_succeeded",
    ]);
    const capture = getEvents(db, DEMO_EARMARK_ID).find((e) => e.type === "paypal.captured")!;
    expect(capture.payload).toMatchObject({ requestId: expect.stringMatching(/^pay_.+:capture$/) });
    const traced = getEvents(db, DEMO_EARMARK_ID).filter((e) => e.type === "trace.step" && (e.payload as { stage: string }).stage === "paypal");
    expect(traced.map((e) => (e.payload as { op: string }).op)).toEqual(["capture", "payout", "payout.get"]);
    expect((await verifyChain(getEvents(db, DEMO_EARMARK_ID))).ok).toBe(true);
  });

  it("replay ×3 → exactly one capture and one payout", async () => {
    const { ticketId } = await approvedTicket();
    const first = await executeTicket(db, deps, ticketId);
    const again = await Promise.all([executeTicket(db, deps, ticketId), executeTicket(db, deps, ticketId), executeTicket(db, deps, ticketId)]);
    expect(first.ok).toBe(true);
    for (const r of again) expect(r).toMatchObject({ ok: false, error: { code: "CONFLICT_DUPLICATE" } });
    // Re-driving the payment itself is also a no-op.
    const paymentId = first.ok ? first.value.paymentId : "";
    await advancePayment(db, deps, paymentId);
    await advancePayment(db, deps, paymentId);
    expect(pp.calls.filter((c) => c.op === "capture")).toHaveLength(1);
    expect(pp.calls.filter((c) => c.op === "payout")).toHaveLength(1);
    expect(db.select().from(payments).where(eq(payments.earmarkId, DEMO_EARMARK_ID)).all()).toHaveLength(1);
    expect(types().filter((t) => t === "paypal.captured")).toHaveLength(1);
  });

  it("capture refused by PayPal → payment failed, Earmark back to held, nothing captured", async () => {
    const { ticketId } = await approvedTicket();
    pp.failNext("capture", { name: "AUTHORIZATION_VOIDED", status: 422 });
    const r = await executeTicket(db, deps, ticketId);
    expect(r).toMatchObject({ ok: false, error: { code: "PAYPAL_ERROR", detail: { name: "AUTHORIZATION_VOIDED" } } });
    expect(earmark()).toMatchObject({ status: "held", capturedMinor: 0, releasedMinor: 0 });
    const p = db.select().from(payments).where(eq(payments.earmarkId, DEMO_EARMARK_ID)).get()!;
    expect(p).toMatchObject({ status: "failed", captureId: null });
    expect(getEvents(db, DEMO_EARMARK_ID).at(-1)).toMatchObject({ type: "paypal.capture_failed", payload: { retryable: false } });
    expect(pp.calls.filter((c) => c.op === "payout")).toHaveLength(0);
    expect(await advancePayment(db, deps, p.id)).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
  });

  it("capture 5xx is retryable: stays paying, and a retry with the same Request-Id completes it", async () => {
    const { ticketId } = await approvedTicket();
    pp.failNext("capture", { status: 503 });
    const r = await executeTicket(db, deps, ticketId);
    expect(r.ok).toBe(false);
    expect(earmark().status).toBe("paying");
    const p = db.select().from(payments).where(eq(payments.earmarkId, DEMO_EARMARK_ID)).get()!;
    expect(p.status).toBe("pending");
    expect(pendingPaymentIds(db, DEMO_EARMARK_ID)).toEqual([p.id]);
    expect(await advancePayment(db, deps, p.id)).toMatchObject({ ok: true, value: { status: "paid_out" } });
    expect(new Set(pp.calls.filter((c) => c.op === "capture").map((c) => c.requestId))).toEqual(new Set([`${p.id}:capture`]));
  });

  it("payout fails → payment failed + event, money stays captured, and the retry pays exactly once", async () => {
    const { ticketId } = await approvedTicket();
    pp.failNext("payout", { name: "INSUFFICIENT_FUNDS", status: 422 });
    const r = await executeTicket(db, deps, ticketId);
    expect(r).toMatchObject({ ok: false, error: { code: "PAYPAL_ERROR" } });
    const p = db.select().from(payments).where(eq(payments.earmarkId, DEMO_EARMARK_ID)).get()!;
    expect(p).toMatchObject({ status: "failed", captureId: expect.any(String), payoutBatchId: null });
    expect(earmark()).toMatchObject({ status: "paying", capturedMinor: 35000 });
    expect(types().at(-1)).toBe("paypal.payout_failed");

    expect(await advancePayment(db, deps, p.id)).toMatchObject({ ok: true, value: { status: "paid_out", payoutConfirmed: true } });
    expect(pp.inspect().payouts).toHaveLength(1);
    expect(pp.calls.filter((c) => c.op === "capture")).toHaveLength(1);
    expect(earmark().status).toBe("paid");
  });

  it("simulated payout mode labels the payout and still completes", async () => {
    const { ticketId } = await approvedTicket();
    const r = await executeTicket(db, { ...deps, payoutMode: "simulated" }, ticketId);
    expect(r).toMatchObject({ ok: true, value: { payoutConfirmed: true } });
    expect(pp.inspect().payouts).toHaveLength(0);
    expect(getEvents(db, DEMO_EARMARK_ID).find((e) => e.type === "paypal.payout_sent")!.payload).toMatchObject({ simulated: true });
  });

  it("a failed payout item is recorded once; webhooks and polls after that are no-ops", async () => {
    const { ticketId } = await approvedTicket();
    pp.failNext("capture", { status: 503 }); // leave it before payout so we can drive it step by step
    await executeTicket(db, deps, ticketId);
    const p = db.select().from(payments).where(eq(payments.earmarkId, DEMO_EARMARK_ID)).get()!;
    // Drive capture + payout, but intercept the confirmation by recording an item failure first.
    await advancePayment(db, { ...deps, paypal: { ...pp, getPayoutBatch: async () => ({ batchStatus: "PROCESSING", items: [] }) } }, p.id);
    expect(recordPayoutResult(db, p.id, { payoutItemId: "ITEM-1", transactionStatus: "UNCLAIMED", source: "webhook" }, TEST_NOW)).toMatchObject({ ok: true, value: { status: "failed" } });
    expect(recordPayoutResult(db, p.id, { payoutItemId: "ITEM-1", transactionStatus: "SUCCESS", source: "webhook" }, TEST_NOW)).toMatchObject({ ok: true, value: { status: "failed" } });
    expect(await confirmPayout(db, deps, p.id)).toMatchObject({ ok: true, value: { status: "failed" } });
    expect(types().filter((t) => t === "paypal.payout_failed")).toHaveLength(1);
  });

  it("refuses a ticket whose gate no longer passes (paused after approval)", async () => {
    const { ticketId } = await approvedTicket();
    db.update(earmarks).set({ frozen: true }).where(eq(earmarks.id, DEMO_EARMARK_ID)).run();
    expect(await executeTicket(db, deps, ticketId)).toMatchObject({ ok: false, error: { code: "POLICY_BLOCKED", detail: { ruleIds: ["R01_NOT_FROZEN"] } } });
    expect(pp.calls).toHaveLength(0);
  });

  it("unknown payment and ticket ids are NOT_FOUND", async () => {
    expect(await advancePayment(db, deps, "pay_nope")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await confirmPayout(db, deps, "pay_nope")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await executeTicket(db, deps, "tk_nope")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
