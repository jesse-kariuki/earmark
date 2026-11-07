// Docs/05 §4: capability tickets. Single use, HMAC-bound, 5 minutes, re-gated at redemption (TOCTOU guard).
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { earmarks, type NewEarmark, payments, tickets } from "@/lib/db/schema";
import { getEvents } from "@/lib/events/append";
import { verifyChain } from "@/lib/events/chain";
import { issueTicket, redeemTicket, TICKET_TTL_MS } from "@/lib/policy/tickets";
import type { GateContext } from "@/lib/policy/types";
import { makeTestDb, TEST_NOW } from "../helpers/db";
import { makeContract, makeEarmark } from "../helpers/factories";
import { baseCtx, SCHOOL_EMAIL } from "../helpers/gate";

let db: Db;
let ctx: GateContext;
const issue = (c = ctx) => issueTicket(db, c);
// Earmark facts come from the row; invoice, registry and history from loadContext. Tests change either between issue and redeem.
const setEarmark = (patch: Partial<NewEarmark>) => db.update(earmarks).set(patch).where(eq(earmarks.id, ctx.earmark.id)).run();
const redeem = (id: string, now = TEST_NOW + 1000) => redeemTicket(db, id, now, () => ctx);
const rowOf = (id: string) => db.select().from(tickets).where(eq(tickets.id, id)).get()!;
const earmarkStatus = () => db.select().from(earmarks).where(eq(earmarks.id, ctx.earmark.id)).get()?.status;
const paymentCount = () => db.select().from(payments).all().length;

function expectRefused(result: ReturnType<typeof redeem>, code: string, reason?: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe(code);
  if (reason) expect(result.error.detail?.reason).toBe(reason);
  expect(paymentCount()).toBe(0);
}

beforeEach(() => {
  ({ db } = makeTestDb({ seed: false }));
  ctx = baseCtx();
  ctx.proposal = { amountMinor: 35000 };
  makeEarmark(db, { id: ctx.earmark.id });
});

describe("issueTicket", () => {
  it("issues a 5-minute ticket bound to the invoice, paying the REGISTRY email", () => {
    ctx.invoice.payeeAccount = SCHOOL_EMAIL.toUpperCase(); // R05 passes; the printed spelling is not what we store
    const t = issue();
    expect(t).toMatchObject({
      earmarkId: ctx.earmark.id,
      invoiceId: ctx.invoice.id,
      amountMinor: 35000,
      currency: "USD",
      payeeEmail: SCHOOL_EMAIL,
      expiresAt: TEST_NOW + TICKET_TTL_MS,
    });
    expect(TICKET_TTL_MS).toBe(5 * 60 * 1000);
    expect(t.id).toMatch(/^tk_/);
    expect(t.mac).toMatch(/^[0-9a-f]{64}$/);
    expect(rowOf(t.id)).toMatchObject({ mac: t.mac, amountMinor: 35000, redeemedAt: null });
  });

  it("logs ticket.issued from the gate", () => {
    const t = issue();
    const [event] = getEvents(db, ctx.earmark.id);
    expect(event).toMatchObject({ type: "ticket.issued", actor: "gate", createdAt: TEST_NOW });
    expect(event?.payload).toEqual({
      ticketId: t.id,
      invoiceId: ctx.invoice.id,
      amountMinor: 35000,
      currency: "USD",
      payeeEmail: SCHOOL_EMAIL,
    });
  });

  it.each(["BLOCK", "REQUIRE_APPROVAL"] as const)("throws on %s", (verdict) => {
    if (verdict === "BLOCK") ctx.earmark.frozen = true;
    else ctx.earmark.contract.evidence.required = "invoice_and_approval";
    expect(() => issue()).toThrow(/ALLOW/);
    expect(db.select().from(tickets).all()).toEqual([]);
  });

  it("runs the gate itself, so an unresolved payee or missing amount cannot get a ticket", () => {
    const noPayee = baseCtx();
    noPayee.earmark.contract.payee.institutionId = null;
    expect(() => issue(noPayee)).toThrow(/BLOCK/);
    const noAmount = baseCtx();
    noAmount.invoice.amountMinor = null;
    expect(() => issue(noAmount)).toThrow(/BLOCK/);
  });
});

describe("redeemTicket", () => {
  it("creates one pending payment, marks the ticket and moves the Earmark to paying", () => {
    const t = issue();
    const result = redeem(t.id);
    if (!result.ok) throw new Error("expected ok");

    expect(result.value.ticket.id).toBe(t.id);
    const payment = db.select().from(payments).where(eq(payments.ticketId, t.id)).get()!;
    expect(payment).toMatchObject({
      id: result.value.paymentId,
      earmarkId: ctx.earmark.id,
      invoiceId: ctx.invoice.id,
      amountMinor: 35000,
      currency: "USD",
      status: "pending",
      idempotencyKey: result.value.paymentId,
    });
    expect(rowOf(t.id).redeemedAt?.getTime()).toBe(TEST_NOW + 1000);
    expect(earmarkStatus()).toBe("paying");
  });

  it("logs ticket.redeemed from the orchestrator", () => {
    const t = issue();
    const result = redeem(t.id);
    if (!result.ok) throw new Error("expected ok");
    expect(getEvents(db, ctx.earmark.id).at(-1)).toMatchObject({
      type: "ticket.redeemed",
      actor: "orchestrator",
      payload: { ticketId: t.id, paymentId: result.value.paymentId },
    });
  });

  it("refuses an unknown ticket", () => {
    expectRefused(redeem("tk_nope"), "NOT_FOUND");
  });

  it("refuses a ticket whose Earmark does not exist", () => {
    const orphan = baseCtx();
    orphan.earmark.id = "em_gone";
    expectRefused(redeem(issue(orphan).id), "NOT_FOUND");
  });

  it("works exactly once (double redeem)", () => {
    const t = issue();
    expect(redeem(t.id).ok).toBe(true);
    const second = redeem(t.id);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatchObject({ code: "CONFLICT_DUPLICATE", detail: { reason: "TICKET_ALREADY_REDEEMED" } });
    expect(paymentCount()).toBe(1);
  });

  it("the unique index refuses a second payment for a ticket even if the code path were bypassed", () => {
    expect(redeem(issue().id).ok).toBe(true);
    const dup = { ...db.select().from(payments).get()!, id: "pay_dup", invoiceId: "inv_other" };
    expect(() => db.insert(payments).values(dup).run()).toThrow(/UNIQUE/);
  });

  it.each([
    ["amount", sql`amount_minor = 80000`],
    ["payee", sql`payee_email = 'attacker@example.com'`],
    ["invoice", sql`invoice_id = 'inv_other'`],
    ["earmark", sql`earmark_id = 'em_other'`],
    ["currency", sql`currency = 'KES'`],
    ["expiry", sql`expires_at = expires_at + 3600000`],
  ])("refuses a ticket whose %s was tampered with", (_field, assignment) => {
    const t = issue();
    db.run(sql`UPDATE tickets SET ${assignment} WHERE id = ${t.id}`);
    expectRefused(redeem(t.id), "INVALID_STATE", "TICKET_TAMPERED");
    expect(rowOf(t.id).redeemedAt).toBeNull();
  });

  it("is valid until just before expiry and refuses at it", () => {
    const t = issue();
    expectRefused(redeem(t.id, t.expiresAt), "INVALID_STATE", "TICKET_EXPIRED");
    expect(redeem(t.id, t.expiresAt - 1).ok).toBe(true);
  });

  it("re-runs the gate: a freeze between issue and redeem blocks it", () => {
    const t = issue();
    setEarmark({ frozen: true });
    const result = redeem(t.id);
    expectRefused(result, "POLICY_BLOCKED");
    if (!result.ok) expect(result.error.detail).toMatchObject({ ruleIds: ["R01_NOT_FROZEN"] });
    expect(rowOf(t.id).redeemedAt).toBeNull();
    expect(earmarkStatus()).toBe("held");
  });

  it("logs the blocked re-evaluation so the trace shows why no money moved", () => {
    const t = issue();
    setEarmark({ frozen: true });
    redeem(t.id);
    expect(getEvents(db, ctx.earmark.id).at(-1)).toMatchObject({
      type: "policy.evaluated",
      actor: "gate",
      payload: { invoiceId: ctx.invoice.id, ticketId: t.id, verdict: "BLOCK", firstBlocking: "R01_NOT_FROZEN", failed: ["R01_NOT_FROZEN"] },
    });
  });

  it.each<[string, (c: GateContext) => void, string]>([
    ["expired", () => void setEarmark({ expiresAt: new Date(TEST_NOW) }), "R02_NOT_EXPIRED"],
    ["duplicate", (c) => void c.history.fileHashes.add(c.invoice.fileHash), "R09_NOT_DUPLICATE"],
    ["voided", () => void setEarmark({ status: "voided" }), "R03_FUNDS_HELD"],
    ["cap used up", () => void setEarmark({ capturedMinor: 10000 }), "R07_WITHIN_CAP"],
    [
      "invoice amount changed (ticket no longer matches)",
      (c) => {
        c.invoice.amountMinor = 30000;
        c.invoice.lineItemsSumMinor = 30000;
      },
      "R17_PROPOSAL_MATCHES_INVOICE",
    ],
  ])("blocks when, since issue: %s", (_name, mutate, rule) => {
    const t = issue();
    mutate(ctx);
    expectRefused(redeem(t.id), "POLICY_BLOCKED");
    expect(getEvents(db, ctx.earmark.id).at(-1)?.payload).toMatchObject({ firstBlocking: rule });
  });

  it("uses the redemption time, not whatever time the context carries", () => {
    const t = issue();
    setEarmark({ expiresAt: new Date(TEST_NOW + 500) });
    expectRefused(redeem(t.id, TEST_NOW + 1000), "POLICY_BLOCKED");
  });

  it("re-gates against the ticket amount, ignoring any proposal the context carries", () => {
    const t = issue();
    ctx.invoice.amountMinor = 30000;
    ctx.invoice.lineItemsSumMinor = 30000;
    ctx.proposal = { amountMinor: 30000 }; // a caller cannot talk its way past a stale ticket
    expectRefused(redeem(t.id), "POLICY_BLOCKED");
  });

  it("blocks when the sender's approval is no longer valid", () => {
    ctx.earmark.contract.evidence.required = "invoice_and_approval";
    setEarmark({ contract: makeContract({ evidence: { required: "invoice_and_approval" } }) });
    ctx.invoice.approvedBySender = true;
    const t = issue();
    ctx.invoice.approvedBySender = false;
    const result = redeem(t.id);
    expectRefused(result, "POLICY_BLOCKED");
    if (!result.ok) expect(result.error.detail).toMatchObject({ ruleIds: ["R11_EVIDENCE_SATISFIED"] });
  });

  it("refuses when the registry payout account changed after issue, even if the invoice now matches", () => {
    const t = issue();
    ctx.registry.byId.ins_lakeview!.paypalEmail = "new-bursar@example.com";
    ctx.invoice.payeeAccount = "new-bursar@example.com";
    expectRefused(redeem(t.id), "INVALID_STATE", "TICKET_STALE");
  });

  it("refuses when the contract's institution has gone from the fresh context", () => {
    const t = issue();
    setEarmark({ contract: makeContract({ payee: { institutionName: "Lakeview", institutionId: null } }) });
    expectRefused(redeem(t.id), "INVALID_STATE", "TICKET_STALE");
  });

  it("refuses when the Earmark currency changed after issue", () => {
    const t = issue();
    setEarmark({ currency: "EUR" });
    ctx.invoice.currency = "EUR";
    expectRefused(redeem(t.id), "INVALID_STATE", "TICKET_STALE");
  });

  it("treats a context for a different invoice as a bug", () => {
    const t = issue();
    const wrongInvoice = { ...ctx, invoice: { ...ctx.invoice, id: "inv_other" } };
    expect(() => redeemTicket(db, t.id, TEST_NOW, () => wrongInvoice)).toThrow(/does not match/);
    expect(paymentCount()).toBe(0);
  });

  it("two tickets for different invoices cannot both spend the same cap", () => {
    const first = issue();
    const secondCtx: GateContext = {
      ...ctx,
      invoice: { ...ctx.invoice, id: "inv_second", fileHash: "hash_second", invoiceNumber: "LSS-2027-002" },
    };
    const second = issue(secondCtx);

    expect(redeem(first.id).ok).toBe(true);
    // capturedMinor is still 0 because the capture has not happened. The Earmark row's status is the guard,
    // and it holds even when the caller's context is stale: redeemTicket reads the row itself.
    const result = redeemTicket(db, second.id, TEST_NOW + 2000, () => secondCtx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.detail).toMatchObject({ ruleIds: ["R03_FUNDS_HELD"] });
    expect(paymentCount()).toBe(1);
  });

  it("a second ticket for an already paid invoice is refused", () => {
    const first = issue();
    const second = issue();
    expect(redeem(first.id).ok).toBe(true);
    setEarmark({ status: "partially_paid", capturedMinor: 1000 }); // the first payment finished and left cap available
    const result = redeem(second.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: "CONFLICT_DUPLICATE", detail: { reason: "INVOICE_ALREADY_PAID" } });
    expect(paymentCount()).toBe(1);
  });

  it("ignores Earmark facts in the caller's context: the row decides", () => {
    const t = issue();
    setEarmark({ frozen: true, status: "voided" });
    const hopeful = { ...ctx, earmark: { ...ctx.earmark, frozen: false, status: "held" as const } };
    const result = redeemTicket(db, t.id, TEST_NOW + 1000, () => hopeful);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.detail?.ruleIds).toContain("R01_NOT_FROZEN");
    expect(paymentCount()).toBe(0);
  });

  it("every event it writes keeps the chain valid", async () => {
    redeem(issue().id);
    await expect(verifyChain(getEvents(db, ctx.earmark.id))).resolves.toMatchObject({ ok: true });
  });
});
