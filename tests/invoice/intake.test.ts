import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { AiRuntime } from "@/lib/ai/call";
import { FIXTURES_DIR } from "@/lib/ai/runtime";
import type { Db } from "@/lib/db/client";
import { earmarks, invoices } from "@/lib/db/schema";
import { createHeldEarmark, createSandboxDb, evalContract } from "@/lib/earmarks/sandbox";
import { getEvents } from "@/lib/events/append";
import { verifyChain } from "@/lib/events/chain";
import { loadRedemptionContext } from "@/lib/invoice/context";
import { approveInvoice, intakeUpload, rejectInvoice } from "@/lib/invoice/intake";
import { loadManifest, loadSample } from "@/lib/invoice/samples";
import { TEST_NOW } from "../helpers/db";

const ai: AiRuntime = { mode: "fixture", record: false, apiKeyPresent: false, fixturesDir: FIXTURES_DIR, now: () => TEST_NOW };
const deps = { ai, now: TEST_NOW, uploadsDir: null };
const sample = (id: string) => {
  const s = loadSample(id)!;
  return { bytes: s.bytes, mime: s.mime };
};

let db: Db;
beforeEach(() => {
  db = createSandboxDb(TEST_NOW, loadManifest()!.schoolEmail);
  createHeldEarmark(db, { id: "em_a", contract: evalContract(TEST_NOW), now: TEST_NOW, label: "test" });
  createHeldEarmark(db, { id: "em_b", contract: evalContract(TEST_NOW), now: TEST_NOW, label: "test" });
});

describe("intakeUpload", () => {
  it("stores a clean upload as REQUIRE_APPROVAL and logs received → trace → extracted → evaluated", async () => {
    const r = await intakeUpload(db, { earmarkId: "em_a", ...sample("01") }, deps);
    expect(r.ok && r.value.gate.verdict).toBe("REQUIRE_APPROVAL");
    if (!r.ok) return;
    const row = db.select().from(invoices).where(eq(invoices.id, r.value.invoiceId)).get()!;
    expect(row).toMatchObject({ source: "uploaded", amountMinor: 35000, institutionId: "ins_lakeview", verdict: "REQUIRE_APPROVAL", approvedBy: null });
    const evts = getEvents(db, "em_a");
    expect(evts.slice(-4).map((e) => e.type)).toEqual(["invoice.received", "trace.step", "invoice.extracted", "policy.evaluated"]);
    expect(evts.find((e) => e.type === "trace.step")!.payload).toMatchObject({ stage: "invoice.extract" });
    expect(JSON.stringify(evts.find((e) => e.type === "trace.step")!.payload)).not.toContain("Lakeview");
    expect((await verifyChain(evts)).ok).toBe(true);
  });

  it("blocks a swapped payout account with R05 and keeps the row for review", async () => {
    const r = await intakeUpload(db, { earmarkId: "em_a", ...sample("05") }, deps);
    expect(r.ok && r.value.gate.firstBlocking).toBe("R05_PAYOUT_ACCOUNT_MATCH");
    expect(r.ok && r.value.stored).toBe(true);
  });

  it("blocks the same file on another Earmark with R09 and stores no second row", async () => {
    await intakeUpload(db, { earmarkId: "em_a", ...sample("01") }, deps);
    const again = await intakeUpload(db, { earmarkId: "em_b", ...sample("08") }, deps);
    expect(again.ok && again.value.gate.firstBlocking).toBe("R09_NOT_DUPLICATE");
    expect(again.ok && again.value.stored).toBe(false);
    expect(db.select().from(invoices).all().filter((i) => i.earmarkId.startsWith("em_a") || i.earmarkId === "em_b")).toHaveLength(1);
    expect(getEvents(db, "em_b").at(-1)!.payload).toMatchObject({ verdict: "BLOCK", stored: false });
  });

  it("refuses bad input without calling the extractor", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await intakeUpload(db, { earmarkId: "em_a", bytes, mime: "text/html" }, deps)).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await intakeUpload(db, { earmarkId: "em_a", bytes: new Uint8Array(), mime: "application/pdf" }, deps)).toMatchObject({ ok: false });
    expect(await intakeUpload(db, { earmarkId: "em_a", bytes: new Uint8Array(10 * 1024 * 1024 + 1), mime: "application/pdf" }, deps)).toMatchObject({
      ok: false,
    });
    expect(await intakeUpload(db, { earmarkId: "em_nope", bytes, mime: "application/pdf" }, deps)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("reports a file with no recorded extraction in fixture mode and logs the failure", async () => {
    const r = await intakeUpload(db, { earmarkId: "em_a", bytes: new Uint8Array([9, 9, 9]), mime: "application/pdf" }, deps);
    expect(r).toMatchObject({ ok: false, error: { code: "AI_ERROR", detail: { reason: "AI_FIXTURE_MISSING" } } });
    expect(getEvents(db, "em_a").at(-1)).toMatchObject({ type: "invoice.extracted", payload: { ok: false } });
  });
});

describe("approve / reject", () => {
  it("approval clears the R11 warning → ALLOW, and the redemption context sees the approval", async () => {
    const r = await intakeUpload(db, { earmarkId: "em_a", ...sample("01") }, deps);
    if (!r.ok) throw new Error("upload failed");
    const a = approveInvoice(db, r.value.invoiceId, TEST_NOW);
    expect(a.ok && a.value.gate.verdict).toBe("ALLOW");
    expect(a.ok && a.value.invoice.verdict).toBe("ALLOW");
    expect(getEvents(db, "em_a").slice(-2).map((e) => e.type)).toEqual(["approval.granted", "policy.evaluated"]);
    // Approving again is a no-op.
    expect(approveInvoice(db, r.value.invoiceId, TEST_NOW).ok).toBe(true);
    const ctx = db.transaction((tx) => loadRedemptionContext(tx, r.value.invoiceId, "em_a"));
    expect(ctx.invoice.approvedBySender).toBe(true);
    expect(ctx.history.fileHashes.has(r.value.fileHash)).toBe(false);
  });

  it("approval still blocks when the Earmark was paused meanwhile", async () => {
    const r = await intakeUpload(db, { earmarkId: "em_a", ...sample("01") }, deps);
    if (!r.ok) throw new Error("upload failed");
    db.update(earmarks).set({ frozen: true }).where(eq(earmarks.id, "em_a")).run();
    const a = approveInvoice(db, r.value.invoiceId, TEST_NOW);
    expect(a.ok && a.value.gate.firstBlocking).toBe("R01_NOT_FROZEN");
  });

  it("cannot approve a blocked invoice, and a rejected one stays rejected", async () => {
    const blocked = await intakeUpload(db, { earmarkId: "em_a", ...sample("05") }, deps);
    if (!blocked.ok) throw new Error("upload failed");
    expect(approveInvoice(db, blocked.value.invoiceId, TEST_NOW)).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
    expect(rejectInvoice(db, blocked.value.invoiceId, TEST_NOW)).toMatchObject({ ok: false });

    const clean = await intakeUpload(db, { earmarkId: "em_b", ...sample("01") }, deps);
    if (!clean.ok) throw new Error("upload failed");
    expect(rejectInvoice(db, clean.value.invoiceId, TEST_NOW).ok).toBe(true);
    expect(rejectInvoice(db, clean.value.invoiceId, TEST_NOW).ok).toBe(true);
    expect(getEvents(db, "em_b").at(-1)!.type).toBe("approval.rejected");
    expect(approveInvoice(db, clean.value.invoiceId, TEST_NOW)).toMatchObject({ ok: false });
    expect(approveInvoice(db, "inv_missing", TEST_NOW)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("refuses to load a redemption context for an invoice on another Earmark", async () => {
    const r = await intakeUpload(db, { earmarkId: "em_a", ...sample("01") }, deps);
    if (!r.ok) throw new Error("upload failed");
    expect(() => db.transaction((tx) => loadRedemptionContext(tx, r.value.invoiceId, "em_b"))).toThrow(/not on earmark/);
  });
});
