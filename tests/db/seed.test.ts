import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { IntentContract } from "@/lib/contract/schema";
import { earmarks, events, institutions, invoices, payments } from "@/lib/db/schema";
import { DEMO_EARMARK_ID, isSeeded } from "@/lib/db/seed";
import { getEvents } from "@/lib/events/append";
import { verifyChain } from "@/lib/events/chain";
import { EVENT_TYPES } from "@/lib/events/types";
import { addMinor } from "@/lib/money";
import { makeTestDb, TEST_NOW } from "../helpers/db";

describe("seed", () => {
  const { db, seeded } = makeTestDb();

  it("creates 3 institutions with the right verification and keys", () => {
    const rows = db.select().from(institutions).all();
    expect(rows.map((r) => r.id).sort()).toEqual(["ins_lakeview", "ins_lookalike", "ins_riverbend"]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.ins_lakeview).toMatchObject({ verified: true, paypalEmail: "sb-lakeview@business.example.com" });
    expect(byId.ins_lakeview!.publicKey).toBeTruthy();
    expect(byId.ins_lookalike).toMatchObject({ verified: false, publicKey: null, name: "Lakeview Secondary Schools Ltd" });
    expect(byId.ins_riverbend).toMatchObject({ verified: true });
    expect(isSeeded(db)).toBe(true);
  });

  it("creates 9 earmarks: 1 held demo + 8 historical across 4 beneficiaries", () => {
    const rows = db.select().from(earmarks).all();
    expect(rows).toHaveLength(9);
    expect(seeded!.earmarks).toHaveLength(9);
    expect(new Set(rows.map((r) => r.recipientName)).size).toBe(4);
    const statuses = rows.map((r) => r.status).sort();
    expect(statuses).toEqual(["expired", "expired", "held", "paid", "paid", "paid", "paid", "paid", "voided"]);
  });

  it("every seeded earmark has a valid hash chain", async () => {
    for (const id of seeded!.earmarks) {
      const chain = getEvents(db, id);
      expect(chain.length, id).toBeGreaterThanOrEqual(5);
      expect(await verifyChain(chain), id).toEqual({ ok: true, count: chain.length });
    }
  });

  it("uses only the documented event types", () => {
    const types = new Set(db.select({ type: events.type }).from(events).all().map((r) => r.type));
    for (const t of types) expect(EVENT_TYPES).toContain(t);
  });

  it("stores contracts that pass the Intent Contract schema", () => {
    for (const row of db.select().from(earmarks).all()) {
      expect(IntentContract.safeParse(row.contract).success, row.id).toBe(true);
      expect(row.contractHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.capMinor).toBe(row.contract.capMinor);
    }
  });

  it("demo earmark is held with mock PayPal ids and a happy-path prefix chain", () => {
    const demo = db.select().from(earmarks).where(eq(earmarks.id, DEMO_EARMARK_ID)).get()!;
    expect(demo).toMatchObject({ status: "held", capMinor: 40000, capturedMinor: 0, frozen: false });
    expect(demo.authorizationId).toMatch(/^AUTH-SEED-/);
    expect(demo.expiresAt.getTime()).toBe(TEST_NOW + 3 * 24 * 60 * 60 * 1000);
    expect(getEvents(db, DEMO_EARMARK_ID).map((e) => e.type)).toEqual([
      "earmark.created",
      "contract.compiled",
      "contract.approved",
      "paypal.order_created",
      "paypal.authorized",
    ]);
  });

  it("money adds up: captured + released = cap for every finished earmark", () => {
    for (const row of db.select().from(earmarks).all()) {
      if (row.status === "held") continue;
      expect(addMinor(row.capturedMinor, row.releasedMinor), row.id).toBe(row.capMinor);
      const paid = db.select().from(payments).where(eq(payments.earmarkId, row.id)).all();
      const paidTotal = addMinor(0, ...paid.map((p) => p.amountMinor));
      expect(paidTotal, row.id).toBe(row.capturedMinor);
    }
  });

  it("paid earmarks log capture → payout → remainder with matching amounts", () => {
    const paid = db.select().from(earmarks).where(eq(earmarks.status, "paid")).all();
    expect(paid).toHaveLength(5);
    for (const row of paid) {
      const chain = getEvents(db, row.id);
      const captured = chain.find((e) => e.type === "paypal.captured")!.payload as { amountMinor: number };
      const remainder = chain.find((e) => e.type === "remainder.released")!.payload as { amountMinor: number };
      expect(captured.amountMinor).toBe(row.capturedMinor);
      expect(remainder.amountMinor).toBe(row.releasedMinor);
      const order = chain.map((e) => e.type);
      expect(order.indexOf("ticket.redeemed")).toBeLessThan(order.indexOf("paypal.captured"));
      expect(order.indexOf("paypal.captured")).toBeLessThan(order.indexOf("paypal.payout_sent"));
    }
  });

  it("includes blocked attempts: a lookalike invoice (R04) and a reused invoice (R09)", () => {
    const blocked = db.select().from(invoices).where(eq(invoices.verdict, "BLOCK")).all();
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ institutionId: "ins_lookalike" });
    const allPolicy = db
      .select({ payload: events.payload })
      .from(events)
      .where(eq(events.type, "policy.evaluated"))
      .all()
      .map((r) => r.payload as { verdict: string; firstBlocking?: string });
    const firstBlocking = allPolicy.filter((p) => p.verdict === "BLOCK").map((p) => p.firstBlocking).sort();
    expect(firstBlocking).toEqual(["R04_PAYEE_IS_CONTRACT_INSTITUTION", "R09_NOT_DUPLICATE"]);
  });

  it("in sandbox mode the demo earmark waits for real authorization", async () => {
    const sandbox = makeTestDb({ seedOptions: { paypalMode: "sandbox" } });
    const demo = sandbox.db.select().from(earmarks).where(eq(earmarks.id, DEMO_EARMARK_ID)).get()!;
    expect(demo).toMatchObject({ status: "awaiting_authorization", authorizationId: null, paypalOrderId: null });
    const chain = getEvents(sandbox.db, DEMO_EARMARK_ID);
    expect(chain.map((e) => e.type)).toEqual(["earmark.created", "contract.compiled", "contract.approved"]);
    expect(await verifyChain(chain)).toMatchObject({ ok: true });
  });
});
