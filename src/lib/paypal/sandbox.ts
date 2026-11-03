// Real PayPal REST client (sandbox only). Thin fetch wrapper: OAuth token cache, Request-Id on every
// write, Zod-parsed responses, typed PayPalError on non-2xx, one trace entry per call.

import { z } from "zod";
import { decimalStringToMinor, minorToDecimalString } from "@/lib/money";
import { PayPalError, type PayPalClient, type PayPalTracer } from "./types";

export const SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });
const errorSchema = z
  .object({
    name: z.string().optional(),
    error: z.string().optional(),
    message: z.string().optional(),
    error_description: z.string().optional(),
    debug_id: z.string().optional(),
    details: z.array(z.unknown()).optional(),
  })
  .passthrough();
const linkSchema = z.object({ href: z.string(), rel: z.string() });
const amountSchema = z.object({ currency_code: z.string(), value: z.string() });

const orderCreatedSchema = z.object({ id: z.string(), status: z.string(), links: z.array(linkSchema).default([]) });
const orderAuthorizedSchema = z.object({
  id: z.string(),
  purchase_units: z
    .array(
      z.object({
        payments: z.object({
          authorizations: z
            .array(z.object({ id: z.string(), status: z.string(), expiration_time: z.string().optional() }))
            .min(1),
        }),
      }),
    )
    .min(1),
});
const authorizationSchema = z.object({ id: z.string(), status: z.string(), amount: amountSchema });
const captureSchema = z.object({ id: z.string(), status: z.string() });
const voidSchema = z.object({ status: z.string().optional() }).passthrough();
const payoutCreatedSchema = z.object({
  batch_header: z.object({ payout_batch_id: z.string(), batch_status: z.string() }),
});
const payoutBatchSchema = z.object({
  batch_header: z.object({ batch_status: z.string() }),
  items: z
    .array(z.object({ payout_item_id: z.string(), transaction_status: z.string().optional() }))
    .default([]),
});

export type SandboxOptions = {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  trace?: PayPalTracer;
  fetchImpl?: typeof fetch;
};

export type SandboxPayPal = PayPalClient & {
  /** Day-0 check: confirms OAuth works. Returns token lifetime only, never the token. */
  checkAuth(): Promise<{ expiresInSeconds: number }>;
  /** Day-0 check: names of webhook event types the sandbox exposes. */
  listWebhookEventTypes(): Promise<string[]>;
};

export function createSandboxPayPal(opts: SandboxOptions): SandboxPayPal {
  const baseUrl = opts.baseUrl ?? SANDBOX_BASE_URL;
  const trace = opts.trace ?? (() => {});
  const doFetch = opts.fetchImpl ?? fetch;
  let cached: { token: string; expiresAt: number; expiresIn: number } | undefined;

  async function token(): Promise<string> {
    if (cached && Date.now() < cached.expiresAt) return cached.token;
    const basic = Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString("base64");
    const started = Date.now();
    const res = await doFetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const body: unknown = await res.json().catch(() => ({}));
    trace({
      method: "POST",
      path: "/v1/oauth2/token",
      status: res.status,
      debugId: res.headers.get("paypal-debug-id") ?? undefined,
      durationMs: Date.now() - started,
    });
    if (!res.ok) throw toError(res, body);
    const t = tokenSchema.parse(body);
    cached = { token: t.access_token, expiresIn: t.expires_in, expiresAt: Date.now() + (t.expires_in - 60) * 1000 };
    return t.access_token;
  }

  function toError(res: Response, body: unknown): PayPalError {
    const e = errorSchema.safeParse(body);
    const b = e.success ? e.data : {};
    return new PayPalError({
      name: b.name ?? b.error ?? `HTTP_${res.status}`,
      message: b.message ?? b.error_description ?? res.statusText,
      status: res.status,
      debugId: b.debug_id ?? res.headers.get("paypal-debug-id") ?? undefined,
      details: b.details,
    });
  }

  async function call<T>(
    method: "GET" | "POST",
    path: string,
    schema: z.ZodType<T>,
    opts2: { body?: unknown; requestId?: string } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
    if (opts2.requestId) headers["PayPal-Request-Id"] = opts2.requestId;
    const started = Date.now();
    const res = await doFetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: opts2.body === undefined ? undefined : JSON.stringify(opts2.body),
    });
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : {};
    trace({
      method,
      path,
      requestId: opts2.requestId,
      status: res.status,
      debugId: res.headers.get("paypal-debug-id") ?? undefined,
      durationMs: Date.now() - started,
    });
    if (!res.ok) throw toError(res, body);
    return schema.parse(body);
  }

  return {
    async checkAuth() {
      await token();
      return { expiresInSeconds: cached?.expiresIn ?? 0 };
    },

    async listWebhookEventTypes() {
      const r = await call(
        "GET",
        "/v1/notifications/webhooks-event-types",
        z.object({ event_types: z.array(z.object({ name: z.string() })) }),
      );
      return r.event_types.map((e) => e.name);
    },

    async createAuthorizeOrder(i, requestId) {
      const r = await call("POST", "/v2/checkout/orders", orderCreatedSchema, {
        requestId,
        body: {
          intent: "AUTHORIZE",
          purchase_units: [
            {
              reference_id: i.earmarkId,
              custom_id: i.earmarkId,
              description: i.description,
              amount: { currency_code: i.currency, value: minorToDecimalString(i.amountMinor) },
            },
          ],
        },
      });
      const approve = r.links.find((l) => l.rel === "approve" || l.rel === "payer-action");
      return { orderId: r.id, approveUrl: approve?.href };
    },

    async authorizeOrder(orderId, requestId) {
      const r = await call("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, orderAuthorizedSchema, {
        requestId,
        body: {},
      });
      const auth = r.purchase_units[0]!.payments.authorizations[0]!;
      return { authorizationId: auth.id, status: auth.status, expirationTime: auth.expiration_time };
    },

    async getAuthorization(authId) {
      const r = await call("GET", `/v2/payments/authorizations/${encodeURIComponent(authId)}`, authorizationSchema);
      return { status: r.status, amountMinor: decimalStringToMinor(r.amount.value) };
    },

    async captureAuthorization(i, requestId) {
      const r = await call(
        "POST",
        `/v2/payments/authorizations/${encodeURIComponent(i.authorizationId)}/capture`,
        captureSchema,
        {
          requestId,
          body: {
            amount: { currency_code: i.currency, value: minorToDecimalString(i.amountMinor) },
            invoice_id: i.invoiceId,
            final_capture: i.finalCapture,
            ...(i.noteToPayer ? { note_to_payer: i.noteToPayer } : {}),
          },
        },
      );
      return { captureId: r.id, status: r.status };
    },

    async voidAuthorization(authId, requestId) {
      const r = await call("POST", `/v2/payments/authorizations/${encodeURIComponent(authId)}/void`, voidSchema, {
        requestId,
      });
      // PayPal returns 204 No Content unless representation is honoured.
      return { status: r.status ?? "VOIDED" };
    },

    async createPayout(i, requestId) {
      const r = await call("POST", "/v1/payments/payouts", payoutCreatedSchema, {
        requestId,
        body: {
          sender_batch_header: {
            sender_batch_id: i.senderBatchId,
            email_subject: i.emailSubject ?? "Earmark payment received",
            email_message: i.emailMessage ?? i.note,
          },
          items: [
            {
              recipient_type: "EMAIL",
              amount: { value: minorToDecimalString(i.amountMinor), currency: i.currency },
              receiver: i.receiverEmail,
              sender_item_id: i.senderItemId,
              note: i.note,
            },
          ],
        },
      });
      return { batchId: r.batch_header.payout_batch_id, batchStatus: r.batch_header.batch_status };
    },

    async getPayoutBatch(batchId) {
      const r = await call("GET", `/v1/payments/payouts/${encodeURIComponent(batchId)}`, payoutBatchSchema);
      return {
        batchStatus: r.batch_header.batch_status,
        items: r.items.map((it) => ({ payoutItemId: it.payout_item_id, transactionStatus: it.transaction_status ?? "UNKNOWN" })),
      };
    },
  };
}
