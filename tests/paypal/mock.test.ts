import { beforeEach, describe, expect, it } from "vitest";
import { createMockPayPal, type MockPayPal } from "@/lib/paypal/mock";
import { PayPalError, requestIdFor, type PayPalTraceEntry } from "@/lib/paypal/types";

const NOW = new Date("2026-11-02T09:00:00.000Z");

async function holdOf(pp: MockPayPal, amountMinor: number, id = "em_1") {
  const { orderId } = await pp.createAuthorizeOrder(
    { earmarkId: id, amountMinor, currency: "USD", description: "test" },
    requestIdFor(id, "order"),
  );
  return pp.authorizeOrder(orderId, requestIdFor(id, "authorize"));
}

describe("mock PayPal", () => {
  let pp: MockPayPal;
  let trace: PayPalTraceEntry[];

  beforeEach(() => {
    trace = [];
    pp = createMockPayPal({ now: () => NOW, trace: (t) => trace.push(t) });
  });

  it("issues deterministic ids and a 29-day authorization", async () => {
    const auth = await holdOf(pp, 40000);
    expect(auth).toEqual({
      authorizationId: "AUTH-MOCK-000002",
      status: "CREATED",
      expirationTime: "2026-12-01T09:00:00.000Z",
    });
    expect(await pp.getAuthorization(auth.authorizationId)).toEqual({ status: "CREATED", amountMinor: 40000 });
  });

  it("same PayPal-Request-Id twice → one capture, same response", async () => {
    const { authorizationId } = await holdOf(pp, 40000);
    const input = { authorizationId, amountMinor: 35000, currency: "USD", invoiceId: "inv_1", finalCapture: true };

    const first = await pp.captureAuthorization(input, "pay_1:capture");
    const second = await pp.captureAuthorization(input, "pay_1:capture");

    expect(second).toEqual(first);
    expect(pp.inspect().authorizations[0]).toMatchObject({ capturedMinor: 35000, status: "CAPTURED" });
    expect(pp.calls.filter((c) => c.op === "capture")).toHaveLength(2);
    expect(new Set(pp.calls.filter((c) => c.op === "capture").map((c) => c.requestId))).toEqual(new Set(["pay_1:capture"]));
  });

  it("final capture of less than the hold leaves nothing capturable", async () => {
    const { authorizationId } = await holdOf(pp, 40000);
    await pp.captureAuthorization({ authorizationId, amountMinor: 35000, currency: "USD", invoiceId: "inv_1", finalCapture: true }, "p:1");
    await expect(
      pp.captureAuthorization({ authorizationId, amountMinor: 5000, currency: "USD", invoiceId: "inv_2", finalCapture: true }, "p:2"),
    ).rejects.toMatchObject({ name: "UNPROCESSABLE_ENTITY", message: "AUTHORIZATION_ALREADY_COMPLETED" });
  });

  it("never captures more than the remaining hold", async () => {
    const { authorizationId } = await holdOf(pp, 40000);
    await expect(
      pp.captureAuthorization({ authorizationId, amountMinor: 40001, currency: "USD", invoiceId: "inv_1", finalCapture: true }, "p:1"),
    ).rejects.toMatchObject({ message: "MAX_CAPTURE_AMOUNT_EXCEEDED" });
    await pp.captureAuthorization({ authorizationId, amountMinor: 30000, currency: "USD", invoiceId: "inv_1", finalCapture: false }, "p:2");
    expect(pp.inspect().authorizations[0]?.status).toBe("PARTIALLY_CAPTURED");
    await expect(
      pp.captureAuthorization({ authorizationId, amountMinor: 10001, currency: "USD", invoiceId: "inv_2", finalCapture: true }, "p:3"),
    ).rejects.toBeInstanceOf(PayPalError);
  });

  it("rejects float money", async () => {
    const { authorizationId } = await holdOf(pp, 40000);
    await expect(
      pp.captureAuthorization({ authorizationId, amountMinor: 350.5, currency: "USD", invoiceId: "inv_1", finalCapture: true }, "p:1"),
    ).rejects.toThrow(/Invalid minor amount/);
  });

  it("failNext(capture) → typed PayPalError once, then a retry with the same Request-Id succeeds", async () => {
    const { authorizationId } = await holdOf(pp, 40000);
    const input = { authorizationId, amountMinor: 35000, currency: "USD", invoiceId: "inv_1", finalCapture: true };
    pp.failNext("capture");

    const err = await pp.captureAuthorization(input, "pay_1:capture").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(err).toMatchObject({ name: "MOCK_INJECTED_FAILURE", status: 500, debugId: "mock-debug-fail-capture" });
    expect(pp.inspect().authorizations[0]?.capturedMinor).toBe(0);

    await expect(pp.captureAuthorization(input, "pay_1:capture")).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("payout: same Request-Id replays; same sender_batch_id with a new Request-Id is refused", async () => {
    const input = {
      senderBatchId: "pay_1",
      senderItemId: "pay_1",
      receiverEmail: "school@example.com",
      amountMinor: 35000,
      currency: "USD",
      note: "Invoice 42",
    };
    const first = await pp.createPayout(input, "pay_1:payout");
    expect(await pp.createPayout(input, "pay_1:payout")).toEqual(first);
    await expect(pp.createPayout(input, "pay_1:payout-retry")).rejects.toMatchObject({ name: "USER_BUSINESS_ERROR" });
    expect(pp.inspect().payouts).toHaveLength(1);
    expect(await pp.getPayoutBatch(first.batchId)).toMatchObject({ batchStatus: "SUCCESS" });
  });

  it("failNext(payout) → typed error and no payout recorded", async () => {
    pp.failNext("payout", { name: "AUTHORIZATION_ERROR", status: 403 });
    await expect(
      pp.createPayout(
        { senderBatchId: "b", senderItemId: "i", receiverEmail: "s@example.com", amountMinor: 100, currency: "USD", note: "n" },
        "b:payout",
      ),
    ).rejects.toMatchObject({ name: "AUTHORIZATION_ERROR", status: 403 });
    expect(pp.inspect().payouts).toHaveLength(0);
  });

  it("void releases a hold once; capture after void fails", async () => {
    const { authorizationId } = await holdOf(pp, 40000);
    expect(await pp.voidAuthorization(authorizationId, "em_1:void")).toEqual({ status: "VOIDED" });
    expect(await pp.voidAuthorization(authorizationId, "em_1:void")).toEqual({ status: "VOIDED" }); // replay
    await expect(pp.voidAuthorization(authorizationId, "em_1:void-2")).rejects.toBeInstanceOf(PayPalError);
    await expect(
      pp.captureAuthorization({ authorizationId, amountMinor: 1, currency: "USD", invoiceId: "i", finalCapture: true }, "p:1"),
    ).rejects.toBeInstanceOf(PayPalError);
  });

  it("traces every call with its Request-Id and no secrets", async () => {
    await holdOf(pp, 40000);
    expect(trace.map((t) => [t.method, t.path, t.requestId, t.status])).toEqual([
      ["POST", "/v2/checkout/orders", "em_1:order", 201],
      ["POST", "/v2/checkout/orders/ORDER-MOCK-000001/authorize", "em_1:authorize", 201],
    ]);
  });

  it("reset() clears state and ids", async () => {
    await holdOf(pp, 100);
    pp.reset();
    expect(pp.calls).toHaveLength(0);
    expect(pp.inspect().authorizations).toHaveLength(0);
    expect((await holdOf(pp, 100)).authorizationId).toBe("AUTH-MOCK-000002");
  });
});

describe("adopting holds the app recorded", () => {
  it("captures against a known hold it never issued, and still 404s an unknown one", async () => {
    const pp = createMockPayPal({ resolveAuthorization: (id) => (id === "AUTH-SEED-0001" ? { amountMinor: 40000, currency: "USD" } : null) });
    const cap = await pp.captureAuthorization({ authorizationId: "AUTH-SEED-0001", amountMinor: 35000, currency: "USD", invoiceId: "inv_1", finalCapture: true }, "pay_1:capture");
    expect(cap.status).toBe("COMPLETED");
    expect(pp.inspect().authorizations[0]).toMatchObject({ id: "AUTH-SEED-0001", status: "CAPTURED", capturedMinor: 35000 });
    await expect(pp.getAuthorization("AUTH-NOPE")).rejects.toMatchObject({ name: "RESOURCE_NOT_FOUND" });
  });
});
