import "server-only";
// Route-facing orchestrator entry points, bound to the app DB and the configured PayPal client.
// Route handlers import from here; they can never import the PayPal client directly (ESLint money rule).
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { paypal } from "@/lib/paypal/client";
import { authorizeEarmark, createAuthorizeOrder } from "./authorize";
import { handleWebhook } from "./webhooks";
import { advancePayment, confirmPayout, executeTicket, type ExecuteDeps, pendingPaymentIds, recordPayoutResult } from "./execute";

const deps = (): ExecuteDeps => ({ paypal, now: Date.now, payoutMode: env.PAYOUT_MODE });

export const orchestrator = {
  createAuthorizeOrder: (earmarkId: string) => createAuthorizeOrder(getDb(), paypal, earmarkId, Date.now()),
  authorize: (earmarkId: string, orderId: string) => authorizeEarmark(getDb(), paypal, earmarkId, orderId, Date.now()),
  /** Redeem a gate-issued ticket and move the money. The only way a ticket turns into a payment. */
  execute: (ticketId: string) => executeTicket(getDb(), deps(), ticketId),
  advance: (paymentId: string) => advancePayment(getDb(), deps(), paymentId),
  confirmPayout: (paymentId: string) => confirmPayout(getDb(), deps(), paymentId),
  recordPayoutResult: (paymentId: string, result: Parameters<typeof recordPayoutResult>[2]) => recordPayoutResult(getDb(), paymentId, result, Date.now()),
  webhook: (input: Parameters<typeof handleWebhook>[2]) => handleWebhook(getDb(), paypal, input, Date.now()),
  /** Nudge payments that stopped after a retryable error or wait for payout confirmation (called on page load). */
  async nudge(earmarkId: string) {
    for (const id of pendingPaymentIds(getDb(), earmarkId)) await advancePayment(getDb(), deps(), id);
  },
};
