import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { pickTamperTarget, tamperEvent } from "@/lib/admin/tamper";
import { events } from "@/lib/db/schema";
import { getEvents } from "@/lib/events/append";
import { verifyChain } from "@/lib/events/chain";
import { makeTestDb } from "../helpers/db";

describe("tamper demo", () => {
  it("edits one event so the chain breaks exactly there, and leaves the append-only trigger in place", async () => {
    const { db } = makeTestDb();
    const id = "em_hist_01"; // seeded and paid, so it has a paypal.captured event
    expect((await verifyChain(getEvents(db, id))).ok).toBe(true);
    const seq = pickTamperTarget(db, id)!;
    expect(getEvents(db, id)[seq]!.type).toBe("paypal.captured");

    const r = tamperEvent(db, id, seq);
    expect(r).toMatchObject({ ok: true, value: { field: "amountMinor", from: 35000, to: 30000 } });
    expect(await verifyChain(getEvents(db, id))).toMatchObject({ ok: false, brokenAt: seq, reason: "hash_mismatch" });
    // The trigger is back: ordinary code still cannot rewrite history.
    expect(() => db.update(events).set({ type: "x" }).where(eq(events.earmarkId, id)).run()).toThrow(/append-only/);
  });

  it("marks an event without an amount, and reports a missing event", async () => {
    const { db } = makeTestDb();
    expect(tamperEvent(db, "em_demo", 0)).toMatchObject({ ok: true, value: { field: "tampered", to: true } });
    expect(await verifyChain(getEvents(db, "em_demo"))).toMatchObject({ ok: false, brokenAt: 0 });
    expect(tamperEvent(db, "em_demo", 999)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(pickTamperTarget(db, "em_none")).toBeNull();
  });
});
