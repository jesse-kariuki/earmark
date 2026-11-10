import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { GUARDIAN_TOOL_NAMES, type GuardianDeps, guardianToolset, runGuardian } from "@/lib/agents/guardian";
import { FIXTURES_DIR } from "@/lib/ai/runtime";
import type { Db } from "@/lib/db/client";
import { DEMO_EARMARK_ID } from "@/lib/db/seed";
import { earmarks, tickets } from "@/lib/db/schema";
import { getEvents } from "@/lib/events/append";
import { approveInvoice, intakeUpload } from "@/lib/invoice/intake";
import { loadSample } from "@/lib/invoice/samples";
import type { PayPalReadTools } from "@/lib/paypal/toolkit";
import { makeTestDb, TEST_NOW } from "../helpers/db";

let db: Db;
let readCalls: string[];
let authStatus: string;

const readTools: PayPalReadTools = {
  source: "mock-stub",
  async get_order({ id }) {
    readCalls.push(id);
    return { id, status: "COMPLETED", purchase_units: [{ payments: { authorizations: [{ id: "AUTH", status: authStatus }] } }] };
  },
  async list_transactions() {
    return { transaction_details: [] };
  },
};

const deps = (over: Partial<GuardianDeps> = {}): GuardianDeps => ({ db, now: () => TEST_NOW, readTools, mode: "fixture", apiKeyPresent: false, ...over });

async function upload(sample: string): Promise<string> {
  const s = loadSample(sample)!;
  const ai = { mode: "fixture" as const, record: false, apiKeyPresent: false, fixturesDir: FIXTURES_DIR, now: () => TEST_NOW };
  const r = await intakeUpload(db, { earmarkId: DEMO_EARMARK_ID, bytes: s.bytes, mime: s.mime }, { ai, now: TEST_NOW, uploadsDir: null });
  if (!r.ok) throw new Error(r.error.message);
  return r.value.invoiceId;
}

beforeEach(() => {
  db = makeTestDb().db;
  readCalls = [];
  authStatus = "CREATED";
});

describe("Guardian (scripted, fixture mode)", () => {
  it("REQUIRE_APPROVAL → checks the hold in PayPal, then asks the sender once", async () => {
    const id = await upload("01");
    const r = await runGuardian(deps(), id);
    expect(r).toMatchObject({ outcome: "approval_requested", ticketId: null, source: "scripted" });
    expect(readCalls).toHaveLength(1);
    await runGuardian(deps(), id);
    expect(getEvents(db, DEMO_EARMARK_ID).filter((e) => e.type === "approval.requested")).toHaveLength(1);
  });

  it("after approval → proposes exactly the invoice amount and gets a single-use ticket", async () => {
    const id = await upload("01");
    approveInvoice(db, id, TEST_NOW);
    const r = await runGuardian(deps(), id);
    expect(r).toMatchObject({ outcome: "ticket", ticketId: expect.stringMatching(/^tk_/) });
    expect(db.select().from(tickets).where(eq(tickets.id, r.ticketId!)).get()).toMatchObject({ amountMinor: 35000, redeemedAt: null });
    const tools = getEvents(db, DEMO_EARMARK_ID)
      .filter((e) => e.type === "trace.step" && (e.payload as { stage: string }).stage === "guardian")
      .map((e) => (e.payload as { tool?: string }).tool)
      .filter(Boolean);
    expect(tools).toEqual(["getEarmark", "get_order", "getInvoiceSummary", "proposePayment"]);
  });

  it("BLOCK → no proposal, names the rule", async () => {
    const id = await upload("05");
    const r = await runGuardian(deps(), id);
    expect(r).toMatchObject({ outcome: "blocked", ticketId: null, ruleIds: ["R05_PAYOUT_ACCOUNT_MATCH"] });
    expect(db.select().from(tickets).all().filter((t) => t.earmarkId === DEMO_EARMARK_ID)).toHaveLength(0);
  });

  it("stops when PayPal does not show a live hold", async () => {
    const id = await upload("01");
    approveInvoice(db, id, TEST_NOW);
    authStatus = "VOIDED";
    expect(await runGuardian(deps(), id)).toMatchObject({ outcome: "hold_missing", ticketId: null });
  });

  it("the gate refuses a proposal made after the Earmark was paused", async () => {
    const id = await upload("01");
    approveInvoice(db, id, TEST_NOW);
    db.update(earmarks).set({ frozen: true }).where(eq(earmarks.id, DEMO_EARMARK_ID)).run();
    const set = guardianToolset(deps(), id);
    expect(set.impl.proposePayment({ invoiceId: id, amountMinor: 35000 })).toMatchObject({ blocked: true, verdict: "BLOCK", ruleIds: ["R01_NOT_FROZEN"] });
  });
});

describe("Guardian tools (live mode uses the same set)", () => {
  it("has no capture, payout or void tool", async () => {
    const id = await upload("01");
    const names = Object.keys(guardianToolset(deps(), id).tools);
    expect(names.sort()).toEqual([...GUARDIAN_TOOL_NAMES].sort());
    for (const n of names) expect(n).not.toMatch(/capture|payout|void|refund|create_order|authorize/i);
  });

  it("an overpaying proposal is blocked by R17, a proposal for another invoice is refused", async () => {
    const id = await upload("01");
    approveInvoice(db, id, TEST_NOW);
    const { impl } = guardianToolset(deps(), id);
    expect(impl.proposePayment({ invoiceId: id, amountMinor: 40000 })).toMatchObject({ blocked: true, ruleIds: ["R17_PROPOSAL_MATCHES_INVOICE"] });
    expect(impl.proposePayment({ invoiceId: "inv_other", amountMinor: 35000 })).toMatchObject({ blocked: true, reason: "wrong invoice" });
  });

  it("the invoice summary carries no free text from the document", async () => {
    const id = await upload("11"); // the hidden-instruction invoice
    const summary = guardianToolset(deps(), id).impl.getInvoiceSummary();
    const text = JSON.stringify(summary);
    expect(text).not.toMatch(/ignore previous|quickfees|school fees|Tuition|Lakeview Secondary/i);
    expect(Object.keys(summary)).not.toContain("description");
  });

  it("live mode runs the model loop with the toolset and reports the ticket it obtained", async () => {
    const id = await upload("01");
    approveInvoice(db, id, TEST_NOW);
    const r = await runGuardian(
      deps({
        mode: "live",
        model: "test-model",
        apiKeyPresent: true,
        liveRun: async ({ tools, instructions }) => {
          expect(instructions).toMatch(/cannot move money yourself/);
          const exec = (t: { execute?: unknown }) => t.execute as (input: unknown, opts: unknown) => Promise<unknown>;
          await exec(tools.getEarmark)({}, {});
          await exec(tools.getInvoiceSummary)({}, {});
          await exec(tools.proposePayment)({ invoiceId: id, amountMinor: 35000 }, {});
          return { text: "Paid.", steps: 3 };
        },
      }),
      id,
    );
    expect(r).toMatchObject({ outcome: "ticket", source: "live", steps: 3 });
  });

  it("a failing model loop pays nothing and says so", async () => {
    const id = await upload("01");
    const r = await runGuardian(deps({ mode: "live", model: "m", apiKeyPresent: true, liveRun: async () => Promise.reject(new Error("overloaded")) }), id);
    expect(r).toMatchObject({ outcome: "error", ticketId: null });
  });
});
