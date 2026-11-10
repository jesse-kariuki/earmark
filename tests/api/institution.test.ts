// docs/06 integration tests #2 (connected invoice $350 → Guardian → paid; money bar 0 / 350 / 50) and #3 (same signed
// invoice again → CONFLICT_DUPLICATE, still exactly one payment and one payout). Plus forged/altered → R12.
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as submit } from "@/app/api/institution/invoices/route";
import { GET as status } from "@/app/api/institution/invoices/[id]/route";
import { GET as registry } from "@/app/api/institution/registry/route";
import { POST as issue } from "@/app/api/school/issue/route";
import { GET as getEarmark } from "@/app/api/earmarks/[id]/route";
import { issueInvoice } from "@/lib/agents/registrar";
import { generateEd25519KeyPair } from "@/lib/crypto/ed25519";
import { loadSchoolKeys } from "@/lib/crypto/ed25519";
import { setDb } from "@/lib/db";
import type { Db } from "@/lib/db/client";
import { DEMO_EARMARK_ID } from "@/lib/db/seed";
import { invoices, payments } from "@/lib/db/schema";
import { paypal } from "@/lib/paypal/client";
import type { MockPayPal } from "@/lib/paypal/mock";
import { makeTestDb } from "../helpers/db";

const keys = loadSchoolKeys({}, join(process.cwd(), ".data", "keys", "school.json"));
const post = (body: unknown) => new Request("http://test.local/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => ({ status: res.status, body: await res.json() });
const LINES = [
  { label: "Tuition", amountMinor: 25000 },
  { label: "Boarding", amountMinor: 10000 },
];

let db: Db;
beforeEach(() => {
  db = makeTestDb({ seedOptions: { now: Date.now(), schoolPublicKey: keys.publicKey } }).db;
  setDb(db);
  (paypal as MockPayPal).reset();
});

describe("connected institution mode", () => {
  it("#2 school issues a signed invoice → Guardian pays it with no upload", async () => {
    const r = await json(await issue(post({ earmarkRef: DEMO_EARMARK_ID, lineItems: LINES })));
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ signatureValid: true, verdict: "ALLOW", guardian: { outcome: "ticket" }, payment: { status: "paid_out", payoutConfirmed: true } });
    const detail = await json(await getEarmark(new Request("http://test.local"), ctx(DEMO_EARMARK_ID)));
    expect(detail.body.data.money).toMatchObject({ heldMinor: 0, sentMinor: 35000, releasedMinor: 5000 });
    const s = await json(await status(new Request("http://test.local"), ctx(r.body.data.invoiceId)));
    expect(s.body.data).toMatchObject({ paid: true, verdict: "ALLOW" });
  });

  it("#3 the same signed invoice again → CONFLICT_DUPLICATE; still one payment and one payout", async () => {
    const wire = issueInvoice(db, { earmarkRef: DEMO_EARMARK_ID, lineItems: LINES }, keys, Date.now());
    if (!wire.ok) throw new Error(wire.error.message);
    expect((await json(await submit(post(wire.value)))).status).toBe(201);
    const again = await json(await submit(post(wire.value)));
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({ code: "CONFLICT_DUPLICATE", detail: { ruleIds: ["R09_NOT_DUPLICATE"] } });
    expect(db.select().from(payments).all().filter((p) => p.earmarkId === DEMO_EARMARK_ID)).toHaveLength(1);
    expect((paypal as MockPayPal).inspect().payouts).toHaveLength(1);
  });

  it("an altered invoice (total changed after signing) → BLOCK R12, nothing stored, nothing paid", async () => {
    const r = await json(await issue(post({ earmarkRef: DEMO_EARMARK_ID, lineItems: LINES, tamper: true })));
    expect(r.body.data).toMatchObject({ invoiceId: null, signatureValid: false, verdict: "BLOCK", firstBlocking: "R12_SIGNATURE_VALID" });
    expect(db.select().from(invoices).all().filter((i) => i.source === "signed" && i.earmarkId === DEMO_EARMARK_ID)).toHaveLength(0);
    // The genuine invoice with the same number still goes through afterwards.
    expect((await json(await issue(post({ earmarkRef: DEMO_EARMARK_ID, lineItems: LINES })))).body.data.verdict).toBe("ALLOW");
  });

  it("a forged signature (another key) → BLOCK R12", async () => {
    const forged = issueInvoice(db, { earmarkRef: DEMO_EARMARK_ID, lineItems: LINES }, { privateKey: generateEd25519KeyPair().privateKey }, Date.now());
    if (!forged.ok) throw new Error("issue failed");
    const r = await json(await submit(post(forged.value)));
    expect(r.body.data).toMatchObject({ signatureValid: false, firstBlocking: "R12_SIGNATURE_VALID", payment: null });
  });

  it("unknown Earmark → 404; bad body → 400; registry lists keys but not payout emails", async () => {
    expect((await json(await issue(post({ earmarkRef: "em_nope", lineItems: LINES })))).status).toBe(404);
    expect((await json(await submit(post({ payload: {}, signature: "x", keyId: "y" })))).status).toBe(400);
    const reg = await json(await registry());
    expect(reg.body.data.find((r: { id: string }) => r.id === "ins_lakeview")).toMatchObject({ verified: true, publicKey: keys.publicKey });
    expect(JSON.stringify(reg.body.data)).not.toContain("@");
  });
});
