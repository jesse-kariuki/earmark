// In-memory PayPal with the same interface as sandbox.ts.
// Deterministic IDs, honours PayPal-Request-Id (same id → first successful response), failure injection.

import { minorToDecimalString } from "@/lib/money";
import {
  PayPalError,
  type CaptureInput,
  type CreateAuthorizeOrderInput,
  type PayPalClient,
  type PayPalTracer,
  type PayoutBatch,
  type PayoutInput,
} from "./types";

export type MockOp = "order" | "authorize" | "capture" | "void" | "payout";

export type MockCall = { op: MockOp; requestId: string; body: unknown };

type Order = { id: string; amountMinor: number; currency: string; status: "CREATED" | "COMPLETED"; authorizationId?: string };
type Authorization = {
  id: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  capturedMinor: number;
  status: "CREATED" | "PARTIALLY_CAPTURED" | "CAPTURED" | "VOIDED";
  expirationTime: string;
};
type Payout = { batchId: string; senderBatchId: string; itemId: string; amountMinor: number; receiverEmail: string };

const HONOR_PERIOD_MS = 29 * 24 * 60 * 60 * 1000;

export type MockPayPal = PayPalClient & {
  readonly calls: MockCall[];
  failNext(op: MockOp, error?: Partial<{ name: string; message: string; status: number }>): void;
  reset(): void;
  /** Read-only view for the Guardian's stub toolkit tools and test assertions. */
  inspect(): { orders: Order[]; authorizations: Authorization[]; payouts: Payout[] };
};

export function createMockPayPal(opts: { now?: () => Date; trace?: PayPalTracer } = {}): MockPayPal {
  const now = opts.now ?? (() => new Date());
  const trace = opts.trace ?? (() => {});

  let seq = 0;
  let orders = new Map<string, Order>();
  let auths = new Map<string, Authorization>();
  let payouts = new Map<string, Payout>();
  let replies = new Map<string, unknown>();
  let failures = new Map<MockOp, PayPalError>();
  const calls: MockCall[] = [];

  const nextId = (prefix: string) => `${prefix}-MOCK-${String(++seq).padStart(6, "0")}`;

  function fail(name: string, message: string, status = 422): never {
    throw new PayPalError({ name, message, status, debugId: `mock-debug-${seq}` });
  }

  /** Records the call, replays a cached reply for a repeated Request-Id, applies injected failures. */
  async function write<T>(op: MockOp, path: string, requestId: string, body: unknown, run: () => T): Promise<T> {
    calls.push({ op, requestId, body });
    const key = `${op}|${requestId}`;
    const started = Date.now();
    if (replies.has(key)) {
      trace({ method: "POST", path, requestId, status: 200, durationMs: Date.now() - started });
      return structuredClone(replies.get(key)) as T;
    }
    const injected = failures.get(op);
    if (injected) {
      failures.delete(op);
      trace({ method: "POST", path, requestId, status: injected.status, debugId: injected.debugId, durationMs: 0 });
      throw injected;
    }
    try {
      const result = run();
      replies.set(key, structuredClone(result));
      trace({ method: "POST", path, requestId, status: 201, durationMs: Date.now() - started });
      return result;
    } catch (e) {
      if (e instanceof PayPalError) {
        trace({ method: "POST", path, requestId, status: e.status, debugId: e.debugId, durationMs: Date.now() - started });
      }
      throw e;
    }
  }

  function getAuth(id: string): Authorization {
    const a = auths.get(id);
    if (!a) fail("RESOURCE_NOT_FOUND", `Authorization ${id} not found`, 404);
    return a;
  }

  const client: MockPayPal = {
    calls,

    failNext(op, error = {}) {
      failures.set(
        op,
        new PayPalError({
          name: error.name ?? "MOCK_INJECTED_FAILURE",
          message: error.message ?? `Injected ${op} failure`,
          status: error.status ?? 500,
          debugId: `mock-debug-fail-${op}`,
        }),
      );
    },

    reset() {
      seq = 0;
      orders = new Map();
      auths = new Map();
      payouts = new Map();
      replies = new Map();
      failures = new Map();
      calls.length = 0;
    },

    inspect() {
      return {
        orders: [...orders.values()].map((o) => ({ ...o })),
        authorizations: [...auths.values()].map((a) => ({ ...a })),
        payouts: [...payouts.values()].map((p) => ({ ...p })),
      };
    },

    createAuthorizeOrder(i: CreateAuthorizeOrderInput, requestId) {
      return write("order", "/v2/checkout/orders", requestId, i, () => {
        minorToDecimalString(i.amountMinor); // validates integer amount
        const id = nextId("ORDER");
        orders.set(id, { id, amountMinor: i.amountMinor, currency: i.currency, status: "CREATED" });
        return { orderId: id, approveUrl: `https://mock.paypal.local/checkoutnow?token=${id}` };
      });
    },

    authorizeOrder(orderId, requestId) {
      return write("authorize", `/v2/checkout/orders/${orderId}/authorize`, requestId, { orderId }, () => {
        const order = orders.get(orderId);
        if (!order) fail("RESOURCE_NOT_FOUND", `Order ${orderId} not found`, 404);
        if (order.status !== "CREATED") fail("UNPROCESSABLE_ENTITY", "ORDER_ALREADY_AUTHORIZED");
        const id = nextId("AUTH");
        const expirationTime = new Date(now().getTime() + HONOR_PERIOD_MS).toISOString();
        auths.set(id, {
          id,
          orderId,
          amountMinor: order.amountMinor,
          currency: order.currency,
          capturedMinor: 0,
          status: "CREATED",
          expirationTime,
        });
        order.status = "COMPLETED";
        order.authorizationId = id;
        return { authorizationId: id, status: "CREATED", expirationTime };
      });
    },

    async getAuthorization(authId) {
      const a = getAuth(authId);
      trace({ method: "GET", path: `/v2/payments/authorizations/${authId}`, status: 200, durationMs: 0 });
      return { status: a.status, amountMinor: a.amountMinor };
    },

    captureAuthorization(i: CaptureInput, requestId) {
      return write("capture", `/v2/payments/authorizations/${i.authorizationId}/capture`, requestId, i, () => {
        const a = getAuth(i.authorizationId);
        if (a.status === "VOIDED" || a.status === "CAPTURED") fail("UNPROCESSABLE_ENTITY", "AUTHORIZATION_ALREADY_COMPLETED");
        if (i.currency !== a.currency) fail("UNPROCESSABLE_ENTITY", "CURRENCY_MISMATCH");
        minorToDecimalString(i.amountMinor);
        if (i.amountMinor <= 0 || i.amountMinor > a.amountMinor - a.capturedMinor) {
          fail("UNPROCESSABLE_ENTITY", "MAX_CAPTURE_AMOUNT_EXCEEDED");
        }
        a.capturedMinor += i.amountMinor;
        a.status = i.finalCapture || a.capturedMinor === a.amountMinor ? "CAPTURED" : "PARTIALLY_CAPTURED";
        return { captureId: nextId("CAPTURE"), status: "COMPLETED" };
      });
    },

    voidAuthorization(authId, requestId) {
      return write("void", `/v2/payments/authorizations/${authId}/void`, requestId, { authId }, () => {
        const a = getAuth(authId);
        if (a.status !== "CREATED" && a.status !== "PARTIALLY_CAPTURED") {
          fail("UNPROCESSABLE_ENTITY", "PREVIOUSLY_VOIDED_OR_CAPTURED");
        }
        a.status = "VOIDED";
        return { status: "VOIDED" };
      });
    },

    createPayout(i: PayoutInput, requestId) {
      return write("payout", "/v1/payments/payouts", requestId, i, () => {
        minorToDecimalString(i.amountMinor);
        if ([...payouts.values()].some((p) => p.senderBatchId === i.senderBatchId)) {
          fail("USER_BUSINESS_ERROR", "Batch with given sender_batch_id already exists", 400);
        }
        const batchId = nextId("BATCH");
        payouts.set(batchId, {
          batchId,
          senderBatchId: i.senderBatchId,
          itemId: nextId("ITEM"),
          amountMinor: i.amountMinor,
          receiverEmail: i.receiverEmail,
        });
        return { batchId, batchStatus: "PENDING" };
      });
    },

    async getPayoutBatch(batchId): Promise<PayoutBatch> {
      const p = payouts.get(batchId);
      if (!p) fail("RESOURCE_NOT_FOUND", `Payout batch ${batchId} not found`, 404);
      trace({ method: "GET", path: `/v1/payments/payouts/${batchId}`, status: 200, durationMs: 0 });
      return { batchStatus: "SUCCESS", items: [{ payoutItemId: p.itemId, transactionStatus: "SUCCESS" }] };
    },
  };

  return client;
}
