// docs/06-API-SPEC.md integration test #1: compile → create → approve → order → authorize → status `held`.
// Route handlers are called directly with PAYPAL_MODE=mock AI_MODE=fixture and a fresh in-memory DB.
import { beforeAll, describe, expect, it } from "vitest";
import { POST as compile } from "@/app/api/contracts/compile/route";
import { POST as approve } from "@/app/api/earmarks/[id]/approve-contract/route";
import { GET as getEvents } from "@/app/api/earmarks/[id]/events/route";
import { POST as freeze } from "@/app/api/earmarks/[id]/freeze/route";
import { POST as authorize } from "@/app/api/earmarks/[id]/paypal/authorize/route";
import { POST as order } from "@/app/api/earmarks/[id]/paypal/order/route";
import { GET as getEarmark } from "@/app/api/earmarks/[id]/route";
import { POST as createEarmark } from "@/app/api/earmarks/route";
import { setDb } from "@/lib/db";
import { verifyChain } from "@/lib/events/chain";
import type { ChainEvent } from "@/lib/events/types";
import { makeTestDb } from "../helpers/db";

const SENTENCE = "Pay Brian's Term 1 fees at Lakeview Secondary School, up to $400, only against a real invoice.";
const LOOKALIKE = "Pay Lakeview Secondary Schools Ltd up to $400 for Brian's fees.";

function post(body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://test.local/api", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const get = () => new Request("http://test.local/api");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function json(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe("API flow #1: compile → create → approve → order → authorize", () => {
  beforeAll(() => {
    setDb(makeTestDb().db);
  });

  let earmarkId = "";
  let orderId = "";

  it("compiles the sentence (fixture), resolves the payee and creates a draft", async () => {
    const r = await json(await compile(post({ sentence: SENTENCE })));
    expect(r.status).toBe(200);
    expect(r.body.data.contract).toMatchObject({ capMinor: 40000, payee: { institutionId: "ins_lakeview" } });
    expect(r.body.data.warnings).toEqual([]);
    expect(r.body.data.meta).toMatchObject({ stage: "contract.compile", source: expect.stringMatching(/fixture|recorded/) });

    const created = await json(
      await createEarmark(post({ sentence: SENTENCE, contract: r.body.data.contract, senderName: "Grace", recipientName: "Brian" })),
    );
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ status: "draft", capMinor: 40000, contractHash: null });
    earmarkId = created.body.data.id;
  });

  it("approves the contract (hash frozen) and is idempotent", async () => {
    const r = await json(await approve(post(), ctx(earmarkId)));
    expect(r.body.data).toMatchObject({ status: "awaiting_authorization", contractHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const again = await json(await approve(post(), ctx(earmarkId)));
    expect(again.body.data.contractHash).toBe(r.body.data.contractHash);
  });

  it("creates a PayPal order for the cap; a repeat returns the same order", async () => {
    const r = await json(await order(post(), ctx(earmarkId)));
    expect(r.status).toBe(200);
    orderId = r.body.data.orderId;
    expect(orderId).toMatch(/^ORDER-MOCK-/);
    expect((await json(await order(post(), ctx(earmarkId)))).body.data.orderId).toBe(orderId);
  });

  it("rejects an order id that is not this earmark's", async () => {
    const r = await json(await authorize(post({ orderId: "ORDER-OTHER" }), ctx(earmarkId)));
    expect(r).toMatchObject({ status: 400, body: { ok: false, error: { code: "VALIDATION" } } });
  });

  it("authorizes → held with a stored authorization id; a replay changes nothing", async () => {
    const r = await json(await authorize(post({ orderId }), ctx(earmarkId)));
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ status: "held", authorizationId: expect.stringMatching(/^AUTH-MOCK-/) });
    const replay = await json(await authorize(post({ orderId }), ctx(earmarkId)));
    expect(replay.body.data.authorizationId).toBe(r.body.data.authorizationId);

    const detail = await json(await getEarmark(get(), ctx(earmarkId)));
    expect(detail.body.data.money).toEqual({ capMinor: 40000, heldMinor: 40000, sentMinor: 0, releasedMinor: 0, pendingMinor: 0 });
    expect(detail.body.data.institution).toMatchObject({ id: "ins_lakeview", verified: true });
  });

  it("pause switch logs frozen/unfrozen once each", async () => {
    expect((await json(await freeze(post({ frozen: true }), ctx(earmarkId)))).body.data.frozen).toBe(true);
    await freeze(post({ frozen: true }), ctx(earmarkId)); // no-op
    expect((await json(await freeze(post({ frozen: false }), ctx(earmarkId)))).body.data.frozen).toBe(false);
  });

  it("logs exactly the expected chain, and it verifies", async () => {
    const r = await json(await getEvents(get(), ctx(earmarkId)));
    const events = r.body.data as ChainEvent[];
    expect(events.map((e) => e.type)).toEqual([
      "earmark.created",
      "contract.compiled",
      "contract.approved",
      "paypal.order_created",
      "paypal.authorized",
      "earmark.frozen",
      "earmark.unfrozen",
    ]);
    expect(await verifyChain(events)).toEqual({ ok: true, count: 7 });
  });
});

describe("API validation and errors", () => {
  beforeAll(() => {
    setDb(makeTestDb().db);
  });

  it("refuses to create an earmark for an unresolved (lookalike) payee", async () => {
    const r = await json(await compile(post({ sentence: LOOKALIKE })));
    expect(r.body.data.contract.payee.institutionId).toBeNull();
    expect(r.body.data.warnings.map((w: { code: string }) => w.code)).toEqual(["PAYEE_UNVERIFIED"]);
    expect(r.body.data.candidates.map((c: { id: string }) => c.id)).toEqual(["ins_lakeview", "ins_riverbend"]);

    const base = { sentence: LOOKALIKE, senderName: "G", recipientName: "B" };
    const created = await json(await createEarmark(post({ ...base, contract: r.body.data.contract })));
    expect(created).toMatchObject({ status: 400, body: { ok: false, error: { code: "VALIDATION" } } });

    // Even a hand-edited contract cannot point at the unverified lookalike.
    const forged = { ...r.body.data.contract, payee: { institutionName: "x", institutionId: "ins_lookalike" } };
    expect((await json(await createEarmark(post({ ...base, contract: forged })))).body.error.code).toBe("VALIDATION");
  });

  it("reports a missing fixture as AI_ERROR with the reason", async () => {
    const r = await json(await compile(post({ sentence: "A sentence nobody has recorded before, $10." })));
    expect(r).toMatchObject({ status: 502, body: { ok: false, error: { code: "AI_ERROR", detail: { reason: "AI_FIXTURE_MISSING" } } } });
  });

  it("refuses live AI when the cookie asks for it but no key is configured", async () => {
    const r = await json(await compile(post({ sentence: SENTENCE }, { cookie: "earmark_ai_mode=live" })));
    expect(r.body.error).toMatchObject({ code: "AI_ERROR", detail: { reason: "AI_NOT_CONFIGURED" } });
  });

  it("validates bodies and unknown ids", async () => {
    expect((await json(await compile(post({ sentence: "short" })))).body.error.code).toBe("VALIDATION");
    const badJson = new Request("http://t", { method: "POST", body: "{not json" });
    expect((await json(await compile(badJson))).body.error.code).toBe("VALIDATION");
    expect((await json(await getEarmark(get(), ctx("em_nope")))).status).toBe(404);
    // The seeded demo Earmark is already held, so a new order is refused.
    expect((await json(await order(post(), ctx("em_demo")))).body.error.code).toBe("INVALID_STATE");
  });
});
