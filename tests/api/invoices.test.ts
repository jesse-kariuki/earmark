// docs/06-API-SPEC.md integration tests #4 (swapped account → R05) and #5 (paused → R01), plus upload/approve/reject routes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as freeze } from "@/app/api/earmarks/[id]/freeze/route";
import { POST as upload } from "@/app/api/earmarks/[id]/invoices/upload/route";
import { POST as approve } from "@/app/api/invoices/[id]/approve/route";
import { GET as file } from "@/app/api/invoices/[id]/file/route";
import { POST as reject } from "@/app/api/invoices/[id]/reject/route";
import { setDb } from "@/lib/db";
import { DEMO_EARMARK_ID } from "@/lib/db/seed";
import { SAMPLES_DIR } from "@/lib/invoice/samples";
import { makeTestDb } from "../helpers/db";

const post = (body?: unknown) =>
  new Request("http://test.local/api", { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => ({ status: res.status, body: await res.json() });

beforeEach(() => {
  // Routes read the real clock, so the demo Earmark must be seeded relative to it.
  setDb(makeTestDb({ seedOptions: { now: Date.now() } }).db);
});

describe("invoice routes", () => {
  it("#4 upload of the swapped-account sample → BLOCK with R05", async () => {
    const r = await json(await upload(post({ sample: "05" }), ctx(DEMO_EARMARK_ID)));
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ verdict: "BLOCK", firstBlocking: "R05_PAYOUT_ACCOUNT_MATCH", stored: true });
  });

  it("#5 pause, then a valid invoice → BLOCK with R01", async () => {
    await freeze(post({ frozen: true }), ctx(DEMO_EARMARK_ID));
    const r = await json(await upload(post({ sample: "01-clean" }), ctx(DEMO_EARMARK_ID)));
    expect(r.body.data).toMatchObject({ verdict: "BLOCK", firstBlocking: "R01_NOT_FROZEN" });
  });

  it("accepts a multipart file, then approve → ALLOW", async () => {
    const form = new FormData();
    form.append("file", new File([readFileSync(join(SAMPLES_DIR, "01-clean.pdf"))], "invoice.pdf", { type: "application/pdf" }));
    const up = await json(await upload(new Request("http://test.local/api", { method: "POST", body: form }), ctx(DEMO_EARMARK_ID)));
    expect(up.body.data).toMatchObject({ verdict: "REQUIRE_APPROVAL", firstBlocking: "R11_EVIDENCE_SATISFIED" });
    const a = await json(await approve(post(), ctx(up.body.data.invoiceId)));
    expect(a.body.data).toMatchObject({ verdict: "ALLOW", firstBlocking: null });
    expect((await file(new Request("http://test.local"), ctx(up.body.data.invoiceId))).headers.get("content-type")).toBe("application/pdf");
  });

  it("reject, unknown sample, missing file and wrong type are refused cleanly", async () => {
    const up = await json(await upload(post({ sample: "03" }), ctx(DEMO_EARMARK_ID)));
    expect((await json(await reject(post(), ctx(up.body.data.invoiceId)))).body.data).toEqual({ invoiceId: up.body.data.invoiceId, rejected: true });
    expect((await json(await approve(post(), ctx(up.body.data.invoiceId)))).status).toBe(409);

    expect((await json(await upload(post({ sample: "99" }), ctx(DEMO_EARMARK_ID)))).status).toBe(404);
    expect((await json(await upload(new Request("http://test.local/api", { method: "POST", body: new FormData() }), ctx(DEMO_EARMARK_ID)))).status).toBe(400);
    const html = new FormData();
    html.append("file", new File(["<html>"], "x.html", { type: "text/html" }));
    expect((await json(await upload(new Request("http://test.local/api", { method: "POST", body: html }), ctx(DEMO_EARMARK_ID)))).status).toBe(400);
  });
});
