import { describe, expect, it } from "vitest";
import { createSandboxPayPal } from "@/lib/paypal/sandbox";
import { PayPalError, type PayPalTraceEntry } from "@/lib/paypal/types";

type Req = { url: string; method: string; headers: Record<string, string>; body?: string };

function fakeFetch(routes: Record<string, { status: number; body: unknown; headers?: Record<string, string> }>) {
  const requests: Req[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ url, method, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body as string | undefined });
    const path = new URL(url).pathname;
    const r = routes[`${method} ${path}`];
    if (!r) return new Response(JSON.stringify({ name: "NOT_MOCKED" }), { status: 404 });
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: r.headers });
  }) as typeof fetch;
  return { impl, requests };
}

const TOKEN = { status: 200, body: { access_token: "A21-secret-token", expires_in: 32400 } };

describe("sandbox PayPal client (fetch faked)", () => {
  it("sends Request-Id, converts minor units to PayPal strings, caches the token", async () => {
    const { impl, requests } = fakeFetch({
      "POST /v1/oauth2/token": TOKEN,
      "POST /v2/payments/authorizations/AUTH1/capture": { status: 201, body: { id: "CAP1", status: "COMPLETED" } },
      "GET /v2/payments/authorizations/AUTH1": {
        status: 200,
        body: { id: "AUTH1", status: "CAPTURED", amount: { currency_code: "USD", value: "400.00" } },
      },
    });
    const trace: PayPalTraceEntry[] = [];
    const pp = createSandboxPayPal({ clientId: "id", clientSecret: "sec", fetchImpl: impl, trace: (t) => trace.push(t) });

    const cap = await pp.captureAuthorization(
      { authorizationId: "AUTH1", amountMinor: 35000, currency: "USD", invoiceId: "inv_1", finalCapture: true },
      "pay_1:capture",
    );
    expect(cap).toEqual({ captureId: "CAP1", status: "COMPLETED" });
    expect(await pp.getAuthorization("AUTH1")).toEqual({ status: "CAPTURED", amountMinor: 40000 });

    expect(requests.filter((r) => r.url.endsWith("/v1/oauth2/token"))).toHaveLength(1);
    const capReq = requests.find((r) => r.url.endsWith("/capture"))!;
    expect(capReq.headers["PayPal-Request-Id"]).toBe("pay_1:capture");
    expect(JSON.parse(capReq.body!)).toEqual({
      amount: { currency_code: "USD", value: "350.00" },
      invoice_id: "inv_1",
      final_capture: true,
    });
    expect(JSON.stringify(trace)).not.toContain("A21-secret-token");
    expect(JSON.stringify(trace)).not.toContain("sec");
  });

  it("maps non-2xx to a typed PayPalError with debug_id", async () => {
    const { impl } = fakeFetch({
      "POST /v1/oauth2/token": TOKEN,
      "POST /v1/payments/payouts": {
        status: 403,
        body: { name: "AUTHORIZATION_ERROR", message: "Authorization error occurred", debug_id: "dbg123", details: [] },
      },
    });
    const pp = createSandboxPayPal({ clientId: "id", clientSecret: "sec", fetchImpl: impl });
    const err = await pp
      .createPayout(
        { senderBatchId: "b", senderItemId: "i", receiverEmail: "s@example.com", amountMinor: 100, currency: "USD", note: "n" },
        "b:payout",
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(err).toMatchObject({ name: "AUTHORIZATION_ERROR", status: 403, debugId: "dbg123" });
  });

  it("parses order approve link and authorization id", async () => {
    const { impl } = fakeFetch({
      "POST /v1/oauth2/token": TOKEN,
      "POST /v2/checkout/orders": {
        status: 201,
        body: { id: "ORD1", status: "CREATED", links: [{ href: "https://sandbox.paypal.com/approve?t=ORD1", rel: "approve" }] },
      },
      "POST /v2/checkout/orders/ORD1/authorize": {
        status: 201,
        body: {
          id: "ORD1",
          purchase_units: [{ payments: { authorizations: [{ id: "AUTH1", status: "CREATED", expiration_time: "2026-12-01T00:00:00Z" }] } }],
        },
      },
      "POST /v2/payments/authorizations/AUTH1/void": { status: 204, body: undefined },
    });
    const pp = createSandboxPayPal({ clientId: "id", clientSecret: "sec", fetchImpl: impl });
    expect(
      await pp.createAuthorizeOrder({ earmarkId: "em_1", amountMinor: 40000, currency: "USD", description: "d" }, "em_1:order"),
    ).toEqual({ orderId: "ORD1", approveUrl: "https://sandbox.paypal.com/approve?t=ORD1" });
    expect(await pp.authorizeOrder("ORD1", "em_1:authorize")).toEqual({
      authorizationId: "AUTH1",
      status: "CREATED",
      expirationTime: "2026-12-01T00:00:00Z",
    });
    expect(await pp.voidAuthorization("AUTH1", "em_1:void")).toEqual({ status: "VOIDED" });
  });
});
