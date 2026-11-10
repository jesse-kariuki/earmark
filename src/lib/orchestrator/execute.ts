import "server-only";
// Moves the money for one redeemed ticket (docs/03-PAYPAL-INTEGRATION.md §3.2–3.3, docs/05 §4):
//   redeem ticket (gate re-runs) → capture the exact invoice amount (final) → release the remainder → pay the
//   school's REGISTRY email via Payouts → confirm the payout.
// Each step is a resumable state on the payment row, and every PayPal write carries `pay_x:capture` / `pay_x:payout`,
// so running the same payment again never captures or pays twice.
import { eq } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db/client";
import { earmarks, invoices, type Payment, payments, tickets } from "@/lib/db/schema";
import type { AppError } from "@/lib/errors";
import { appendEvent } from "@/lib/events/append";
import { loadRedemptionContext } from "@/lib/invoice/context";
import { subMinor } from "@/lib/money";
import { redeemTicket } from "@/lib/policy/tickets";
import { err, ok, type Result } from "@/lib/result";
import { PayPalError, type PayPalClient, requestIdFor } from "@/lib/paypal/types";

export interface ExecuteDeps {
  paypal: PayPalClient;
  now: () => number;
  /** `simulated` is the documented Payouts fallback (docs/03 §4 A); events and UI say so. */
  payoutMode: "real" | "simulated";
}

export interface PaymentOutcome {
  paymentId: string;
  earmarkId: string;
  status: Payment["status"];
  amountMinor: number;
  captureId: string | null;
  payoutBatchId: string | null;
  payoutConfirmed: boolean;
}

function outcome(p: Payment): PaymentOutcome {
  return {
    paymentId: p.id,
    earmarkId: p.earmarkId,
    status: p.status,
    amountMinor: p.amountMinor,
    captureId: p.captureId,
    payoutBatchId: p.payoutBatchId,
    payoutConfirmed: p.payoutItemId !== null,
  };
}

function loadPayment(db: Db | Tx, id: string): Payment | undefined {
  return db.select().from(payments).where(eq(payments.id, id)).get();
}

/** One trace line per PayPal call: endpoint, Request-Id, status and debug id. Never a secret or a token. */
function tracePayPal(
  db: Db | Tx,
  earmarkId: string,
  now: number,
  call: { op: string; method: "GET" | "POST"; path: string; requestId?: string; ok: boolean; status?: number; debugId?: string; latencyMs: number },
) {
  appendEvent(db, { earmarkId, type: "trace.step", actor: "orchestrator", payload: { stage: "paypal", ...call } }, { now });
}

function failure(e: unknown): { name: string; message: string; status: number; debugId: string | null; retryable: boolean } {
  if (e instanceof PayPalError) return { name: e.name, message: e.message, status: e.status, debugId: e.debugId ?? null, retryable: e.status >= 500 };
  // Network errors and timeouts are ambiguous: the call may have landed, so only a retry with the same Request-Id is safe.
  return { name: "NETWORK_ERROR", message: e instanceof Error ? e.message : "PayPal could not be reached", status: 0, debugId: null, retryable: true };
}

function paypalError(f: ReturnType<typeof failure>): AppError {
  return { code: "PAYPAL_ERROR", message: f.message, detail: { name: f.name, ...(f.debugId ? { debugId: f.debugId } : {}) } };
}

/** Redeem → capture → payout → confirm. The orchestrator is the only caller of redeemTicket (guardrail test). */
export async function executeTicket(db: Db, deps: ExecuteDeps, ticketId: string): Promise<Result<PaymentOutcome, AppError>> {
  const redeemed = redeemTicket(db, ticketId, deps.now(), (tx, t) => loadRedemptionContext(tx, t.invoiceId, t.earmarkId));
  if (!redeemed.ok) return redeemed;
  return advancePayment(db, deps, redeemed.value.paymentId);
}

/** Carries a payment forward from whatever step it stopped at. Safe to call any number of times. */
export async function advancePayment(db: Db, deps: ExecuteDeps, paymentId: string): Promise<Result<PaymentOutcome, AppError>> {
  let p = loadPayment(db, paymentId);
  if (!p) return err({ code: "NOT_FOUND", message: `Payment ${paymentId} not found.` });

  if (p.status === "pending") {
    const captured = await capture(db, deps, p);
    if (!captured.ok) return captured;
    p = captured.value;
  }
  if (p.status === "captured" || (p.status === "failed" && p.captureId !== null && p.payoutBatchId === null)) {
    const paid = await payout(db, deps, p);
    if (!paid.ok) return paid;
    p = paid.value;
  }
  if (p.status === "paid_out" && p.payoutItemId === null) {
    const confirmed = await confirmPayout(db, deps, p.id);
    if (confirmed.ok) p = loadPayment(db, p.id)!;
  }
  if (p.status === "failed" && p.captureId === null) {
    return err({ code: "INVALID_STATE", message: "PayPal refused the capture for this payment. The hold is still in place.", detail: { reason: p.error ?? "" } });
  }
  return ok(outcome(p));
}

async function capture(db: Db, deps: ExecuteDeps, p: Payment): Promise<Result<Payment, AppError>> {
  const e = db.select().from(earmarks).where(eq(earmarks.id, p.earmarkId)).get()!;
  if (!e.authorizationId) return err({ code: "INVALID_STATE", message: "This Earmark has no PayPal hold to capture from." });
  // Belt and braces: the gate already checked R07 at redemption. Capturing past the hold is a bug, not a policy question.
  const available = subMinor(subMinor(e.capMinor, e.capturedMinor), e.releasedMinor);
  if (p.amountMinor > available) throw new Error(`capture: ${p.amountMinor} exceeds the ${available} still held on ${e.id}`);

  const inv = db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, p.invoiceId)).get();
  const requestId = requestIdFor(p.id, "capture");
  const path = `/v2/payments/authorizations/${e.authorizationId}/capture`;
  const started = deps.now();
  try {
    const { captureId, status } = await deps.paypal.captureAuthorization(
      {
        authorizationId: e.authorizationId,
        amountMinor: p.amountMinor,
        currency: p.currency,
        invoiceId: p.invoiceId,
        finalCapture: true, // MVP: one invoice per Earmark, so the rest of the hold is released now
        noteToPayer: `${e.contract.payee.institutionName}: ${e.contract.purpose.description} (verified invoice ${inv?.invoiceNumber ?? p.invoiceId})`.slice(0, 255),
      },
      requestId,
    );
    const now = deps.now();
    return ok(
      db.transaction((tx) => {
        tracePayPal(tx, e.id, now, { op: "capture", method: "POST", path, requestId, ok: true, status: 201, latencyMs: now - started });
        const fresh = tx.select().from(earmarks).where(eq(earmarks.id, e.id)).get()!;
        const capturedMinor = fresh.capturedMinor + p.amountMinor;
        const remainder = subMinor(subMinor(fresh.capMinor, capturedMinor), fresh.releasedMinor);
        tx.update(earmarks).set({ capturedMinor, releasedMinor: fresh.releasedMinor + remainder }).where(eq(earmarks.id, e.id)).run();
        const row = tx.update(payments).set({ status: "captured", captureId, error: null }).where(eq(payments.id, p.id)).returning().get()!;
        appendEvent(
          tx,
          { earmarkId: e.id, type: "paypal.captured", actor: "paypal", payload: { paymentId: p.id, invoiceId: p.invoiceId, captureId, status, amountMinor: p.amountMinor, currency: p.currency, requestId, finalCapture: true } },
          { now },
        );
        if (remainder > 0) {
          appendEvent(
            tx,
            { earmarkId: e.id, type: "remainder.released", actor: "orchestrator", payload: { amountMinor: remainder, currency: p.currency, authorizationId: e.authorizationId, reason: "final capture" } },
            { now },
          );
        }
        return row;
      }),
    );
  } catch (x) {
    const f = failure(x);
    const now = deps.now();
    db.transaction((tx) => {
      tracePayPal(tx, e.id, now, { op: "capture", method: "POST", path, requestId, ok: false, status: f.status, ...(f.debugId ? { debugId: f.debugId } : {}), latencyMs: now - started });
      appendEvent(
        tx,
        { earmarkId: e.id, type: "paypal.capture_failed", actor: "paypal", payload: { paymentId: p.id, name: f.name, debugId: f.debugId, retryable: f.retryable, requestId } },
        { now },
      );
      if (f.retryable) {
        // Ambiguous: stay `pending` / `paying`; advancePayment retries with the same Request-Id.
        tx.update(payments).set({ error: `${f.name}: ${f.message}` }).where(eq(payments.id, p.id)).run();
      } else {
        // PayPal said no: nothing was captured, so the money is still held and the Earmark can take another invoice.
        tx.update(payments).set({ status: "failed", error: `${f.name}: ${f.message}` }).where(eq(payments.id, p.id)).run();
        const fresh = tx.select().from(earmarks).where(eq(earmarks.id, e.id)).get()!;
        tx.update(earmarks).set({ status: fresh.capturedMinor > 0 ? "partially_paid" : "held" }).where(eq(earmarks.id, e.id)).run();
      }
    });
    return err(paypalError(f));
  }
}

async function payout(db: Db, deps: ExecuteDeps, p: Payment): Promise<Result<Payment, AppError>> {
  const ticket = db.select().from(tickets).where(eq(tickets.id, p.ticketId)).get()!;
  const e = db.select().from(earmarks).where(eq(earmarks.id, p.earmarkId)).get()!;
  const inv = db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, p.invoiceId)).get();
  // Always the registry email bound into the ticket, never anything printed on the invoice (docs/05 §4).
  const receiver = ticket.payeeEmail;
  const requestId = requestIdFor(p.id, "payout");
  const path = "/v1/payments/payouts";
  const started = deps.now();

  let batchId: string;
  let batchStatus: string;
  const simulated = deps.payoutMode === "simulated";
  if (simulated) {
    batchId = `SIMULATED-${p.id}`;
    batchStatus = "SUCCESS";
  } else {
    try {
      ({ batchId, batchStatus } = await deps.paypal.createPayout(
        {
          senderBatchId: p.id,
          senderItemId: p.id,
          receiverEmail: receiver,
          amountMinor: p.amountMinor,
          currency: p.currency,
          note: `Invoice ${inv?.invoiceNumber ?? p.invoiceId}`,
          emailSubject: "Earmark payment received",
          emailMessage: `${e.contract.purpose.description}, verified invoice ${inv?.invoiceNumber ?? p.invoiceId}`.slice(0, 255),
        },
        requestId,
      ));
    } catch (x) {
      const f = failure(x);
      const now = deps.now();
      db.transaction((tx) => {
        tracePayPal(tx, e.id, now, { op: "payout", method: "POST", path, requestId, ok: false, status: f.status, ...(f.debugId ? { debugId: f.debugId } : {}), latencyMs: now - started });
        appendEvent(
          tx,
          { earmarkId: e.id, type: "paypal.payout_failed", actor: "paypal", payload: { paymentId: p.id, stage: "create", name: f.name, debugId: f.debugId, retryable: true, requestId } },
          { now },
        );
        // The money is captured, so this payment must still reach the school: advancePayment retries the payout.
        tx.update(payments).set({ status: "failed", error: `${f.name}: ${f.message}` }).where(eq(payments.id, p.id)).run();
      });
      return err(paypalError(f));
    }
  }

  const now = deps.now();
  return ok(
    db.transaction((tx) => {
      if (!simulated) tracePayPal(tx, e.id, now, { op: "payout", method: "POST", path, requestId, ok: true, status: 201, latencyMs: now - started });
      const row = tx.update(payments).set({ status: "paid_out", payoutBatchId: batchId, error: null }).where(eq(payments.id, p.id)).returning().get()!;
      appendEvent(
        tx,
        {
          earmarkId: e.id,
          type: "paypal.payout_sent",
          actor: "orchestrator",
          payload: { paymentId: p.id, batchId, batchStatus, amountMinor: p.amountMinor, currency: p.currency, receiver, requestId, simulated },
        },
        { now },
      );
      return row;
    }),
  );
}

const ITEM_FAILED = new Set(["FAILED", "BLOCKED", "RETURNED", "UNCLAIMED", "DENIED", "REFUNDED"]);

/** Records the final state of a payout item once, whether it came from polling or a webhook. */
export function recordPayoutResult(
  db: Db,
  paymentId: string,
  result: { payoutItemId: string; transactionStatus: string; source: "poll" | "webhook" | "simulated" },
  now: number,
): Result<PaymentOutcome, AppError> {
  return db.transaction((tx) => {
    const p = loadPayment(tx, paymentId);
    if (!p) return err({ code: "NOT_FOUND", message: `Payment ${paymentId} not found.` });
    if (p.payoutItemId !== null || p.status !== "paid_out") return ok(outcome(p)); // already final, or not sent yet

    if (result.transactionStatus === "SUCCESS") {
      const row = tx.update(payments).set({ payoutItemId: result.payoutItemId }).where(eq(payments.id, p.id)).returning().get()!;
      const e = tx.select().from(earmarks).where(eq(earmarks.id, p.earmarkId)).get()!;
      // MVP is one invoice per Earmark with a final capture, so a confirmed payout completes it.
      tx.update(earmarks).set({ status: e.capturedMinor + e.releasedMinor >= e.capMinor ? "paid" : "partially_paid" }).where(eq(earmarks.id, e.id)).run();
      appendEvent(
        tx,
        { earmarkId: p.earmarkId, type: "paypal.payout_succeeded", actor: "paypal", payload: { paymentId: p.id, batchId: p.payoutBatchId, payoutItemId: result.payoutItemId, transactionStatus: "SUCCESS", source: result.source } },
        { now },
      );
      return ok(outcome(row));
    }
    if (ITEM_FAILED.has(result.transactionStatus)) {
      const row = tx
        .update(payments)
        .set({ payoutItemId: result.payoutItemId, status: "failed", error: `Payout ${result.transactionStatus}` })
        .where(eq(payments.id, p.id))
        .returning()
        .get()!;
      appendEvent(
        tx,
        { earmarkId: p.earmarkId, type: "paypal.payout_failed", actor: "paypal", payload: { paymentId: p.id, stage: "item", payoutItemId: result.payoutItemId, transactionStatus: result.transactionStatus, source: result.source } },
        { now },
      );
      return ok(outcome(row));
    }
    return ok(outcome(p)); // PENDING / UNCLAIMED-in-progress: nothing final yet
  });
}

/** Polls the payout batch once (the webhook fallback, docs/03 §3.3). */
export async function confirmPayout(db: Db, deps: ExecuteDeps, paymentId: string): Promise<Result<PaymentOutcome, AppError>> {
  const p = loadPayment(db, paymentId);
  if (!p) return err({ code: "NOT_FOUND", message: `Payment ${paymentId} not found.` });
  if (p.status !== "paid_out" || p.payoutItemId !== null || !p.payoutBatchId) return ok(outcome(p));
  if (p.payoutBatchId.startsWith("SIMULATED-")) {
    return recordPayoutResult(db, p.id, { payoutItemId: `SIMULATED-ITEM-${p.id}`, transactionStatus: "SUCCESS", source: "simulated" }, deps.now());
  }
  const path = `/v1/payments/payouts/${p.payoutBatchId}`;
  const started = deps.now();
  try {
    const batch = await deps.paypal.getPayoutBatch(p.payoutBatchId);
    const item = batch.items[0];
    tracePayPal(db, p.earmarkId, deps.now(), { op: "payout.get", method: "GET", path, ok: true, status: 200, latencyMs: deps.now() - started });
    if (!item) return ok(outcome(p));
    return recordPayoutResult(db, p.id, { payoutItemId: item.payoutItemId, transactionStatus: item.transactionStatus, source: "poll" }, deps.now());
  } catch (x) {
    const f = failure(x);
    tracePayPal(db, p.earmarkId, deps.now(), { op: "payout.get", method: "GET", path, ok: false, status: f.status, ...(f.debugId ? { debugId: f.debugId } : {}), latencyMs: deps.now() - started });
    return err(paypalError(f));
  }
}

/** Payments an Earmark page should nudge forward: stuck after a retryable error, a captured payment whose payout
 * failed (the money must still reach the school; same Request-Id, so never twice), or waiting for confirmation. */
export function pendingPaymentIds(db: Db, earmarkId: string): string[] {
  return db
    .select()
    .from(payments)
    .where(eq(payments.earmarkId, earmarkId))
    .all()
    .filter(
      (p) =>
        (p.status === "paid_out" && p.payoutItemId === null) ||
        (p.status === "pending" && p.error !== null) ||
        (p.status === "failed" && p.captureId !== null && p.payoutBatchId === null),
    )
    .map((p) => p.id);
}
