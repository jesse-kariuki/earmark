// PayPal client contract shared by the sandbox (real REST) and mock implementations.
// All amounts are integer minor units; implementations convert at the HTTP boundary.

export type CreateAuthorizeOrderInput = {
  earmarkId: string;
  amountMinor: number;
  currency: string;
  description: string;
};

export type CaptureInput = {
  authorizationId: string;
  amountMinor: number;
  currency: string;
  invoiceId: string;
  finalCapture: boolean;
  noteToPayer?: string;
};

export type PayoutInput = {
  senderBatchId: string;
  senderItemId: string;
  receiverEmail: string;
  amountMinor: number;
  currency: string;
  note: string;
  emailSubject?: string;
  emailMessage?: string;
};

export type PayoutBatch = {
  batchStatus: string;
  items: { payoutItemId: string; transactionStatus: string }[];
};

export interface PayPalClient {
  /** `approveUrl` is the payer-action link (used by the smoke script; the UI uses the JS SDK instead). */
  createAuthorizeOrder(i: CreateAuthorizeOrderInput, requestId: string): Promise<{ orderId: string; approveUrl?: string }>;
  authorizeOrder(orderId: string, requestId: string): Promise<{ authorizationId: string; status: string; expirationTime?: string }>;
  getAuthorization(authId: string): Promise<{ status: string; amountMinor: number }>;
  captureAuthorization(i: CaptureInput, requestId: string): Promise<{ captureId: string; status: string }>;
  voidAuthorization(authId: string, requestId: string): Promise<{ status: string }>;
  createPayout(i: PayoutInput, requestId: string): Promise<{ batchId: string; batchStatus: string }>;
  getPayoutBatch(batchId: string): Promise<PayoutBatch>;
}

/** One line per PayPal HTTP call. Never contains secrets or tokens. M5 turns these into `trace.step` events. */
export type PayPalTraceEntry = {
  method: "GET" | "POST";
  path: string;
  requestId?: string;
  status: number;
  debugId?: string;
  durationMs: number;
};

export type PayPalTracer = (entry: PayPalTraceEntry) => void;

export class PayPalError extends Error {
  readonly name: string;
  readonly status: number;
  readonly debugId?: string;
  readonly details: unknown[];

  constructor(i: { name: string; message: string; status: number; debugId?: string; details?: unknown[] }) {
    super(i.message);
    this.name = i.name;
    this.status = i.status;
    this.debugId = i.debugId;
    this.details = i.details ?? [];
  }
}

/** Builds the `PayPal-Request-Id` for a step, e.g. `pay_123:capture`. */
export function requestIdFor(id: string, step: "order" | "authorize" | "capture" | "payout" | "void"): string {
  return `${id}:${step}`;
}
