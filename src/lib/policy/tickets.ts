import "server-only";
// Capability tickets (docs/05-POLICY-GATE.md §4): single use, 5 minutes, HMAC-bound to one exact payment.
// The payee is always the REGISTRY email, so a swapped invoice cannot redirect money even if R05 had a bug.
import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { hmacEqual, hmacSha256Hex } from "@/lib/crypto/hmac";
import type { Db, Tx } from "@/lib/db/client";
import { type Earmark, earmarks, payments, tickets } from "@/lib/db/schema";
import { env } from "@/lib/env";
import type { AppError } from "@/lib/errors";
import { appendEvent } from "@/lib/events/append";
import { canonicalize } from "@/lib/events/canonical";
import { err, ok, type Result } from "@/lib/result";
import { evaluate } from "./gate";
import type { GateContext } from "./types";

export const TICKET_TTL_MS = 5 * 60 * 1000;

export interface Ticket {
  id: string;
  earmarkId: string;
  invoiceId: string;
  amountMinor: number;
  currency: string;
  payeeEmail: string;
  expiresAt: number; // ms epoch
  mac: string;
}

export interface Redemption {
  ticket: Ticket;
  paymentId: string;
}

/** What loadContext supplies. Earmark facts are not in it: redeemTicket reads those from the row, inside its transaction. */
export type RedemptionContext = Pick<GateContext, "invoice" | "registry" | "history">;

export function gateEarmark(row: Earmark): GateContext["earmark"] {
  const { id, status, frozen, capMinor, capturedMinor, currency, contract } = row;
  return { id, status, frozen, capMinor, capturedMinor, currency, expiresAt: row.expiresAt.getTime(), contract };
}

function macFor({ id, earmarkId, invoiceId, amountMinor, currency, payeeEmail, expiresAt }: Omit<Ticket, "mac">): string {
  return hmacSha256Hex(env.TICKET_SECRET, canonicalize({ id, earmarkId, invoiceId, amountMinor, currency, payeeEmail, expiresAt }));
}

function refuse(code: AppError["code"], reason: string, message: string): { ok: false; error: AppError } {
  return err({ code, message, detail: { reason } });
}

/** Mints a ticket. It runs the gate itself, so no caller can hand it a verdict. Calling it without ALLOW is a bug, so it throws. */
export function issueTicket(db: Db | Tx, ctx: GateContext): Ticket {
  const { verdict } = evaluate(ctx);
  if (verdict !== "ALLOW") throw new Error(`issueTicket: verdict is ${verdict}, not ALLOW`);
  const { earmark, invoice, registry, now } = ctx;
  // ALLOW means R04-R08 passed, so the amount, the currency and the registered payee all exist.
  const payee = registry.byId[earmark.contract.payee.institutionId!]!;

  const fields = {
    id: `tk_${nanoid(12)}`,
    earmarkId: earmark.id,
    invoiceId: invoice.id,
    amountMinor: invoice.amountMinor!,
    currency: invoice.currency!,
    payeeEmail: payee.paypalEmail,
    expiresAt: now + TICKET_TTL_MS,
  };
  const ticket: Ticket = { ...fields, mac: macFor(fields) };

  db.transaction((tx) => {
    tx.insert(tickets)
      .values({ ...ticket, expiresAt: new Date(ticket.expiresAt), createdAt: new Date(now) })
      .run();
    const { id: ticketId, invoiceId, amountMinor, currency, payeeEmail } = ticket;
    appendEvent(
      tx,
      { earmarkId: earmark.id, type: "ticket.issued", actor: "gate", payload: { ticketId, invoiceId, amountMinor, currency, payeeEmail } },
      { now },
    );
  });
  return ticket;
}

/**
 * Redeems a ticket inside one transaction, for the orchestrator to run just before it moves money.
 * Earmark facts come from the row and the rest from `loadContext`, both inside that transaction, so a pause,
 * expiry or duplicate that arrived after issue blocks here (TOCTOU guard), even if the caller's data is stale.
 * A refused redemption writes no payment and spends no ticket. Moving the Earmark to `paying` matters: capturedMinor only rises after the capture, so until then R03 is
 * what stops a second ticket spending the same cap.
 */
export function redeemTicket(
  db: Db,
  ticketId: string,
  now: number,
  loadContext: (tx: Tx, ticket: Ticket) => RedemptionContext,
): Result<Redemption, AppError> {
  return db.transaction((tx) => {
    const row = tx.select().from(tickets).where(eq(tickets.id, ticketId)).get();
    if (!row) return err({ code: "NOT_FOUND", message: `Ticket ${ticketId} not found.` });

    const ticket: Ticket = {
      id: row.id,
      earmarkId: row.earmarkId,
      invoiceId: row.invoiceId,
      amountMinor: row.amountMinor,
      currency: row.currency,
      payeeEmail: row.payeeEmail,
      expiresAt: row.expiresAt.getTime(),
      mac: row.mac,
    };
    if (!hmacEqual(macFor(ticket), ticket.mac)) return refuse("INVALID_STATE", "TICKET_TAMPERED", "This ticket failed its integrity check.");
    if (row.redeemedAt) return refuse("CONFLICT_DUPLICATE", "TICKET_ALREADY_REDEEMED", "This ticket was already used.");
    if (now >= ticket.expiresAt) return refuse("INVALID_STATE", "TICKET_EXPIRED", "This ticket has expired.");

    const earmarkRow = tx.select().from(earmarks).where(eq(earmarks.id, ticket.earmarkId)).get();
    if (!earmarkRow) return err({ code: "NOT_FOUND", message: `Earmark ${ticket.earmarkId} not found.` });
    const earmark = gateEarmark(earmarkRow);

    const { invoice, registry, history } = loadContext(tx, ticket);
    if (invoice.id !== ticket.invoiceId) throw new Error(`redeemTicket: context does not match ticket ${ticket.id}`);
    const institutionId = earmark.contract.payee.institutionId;
    const payeeEmail = institutionId === null ? undefined : registry.byId[institutionId]?.paypalEmail;
    if (payeeEmail !== ticket.payeeEmail || earmark.currency !== ticket.currency) {
      return refuse("INVALID_STATE", "TICKET_STALE", "The payout account or currency changed after this ticket was issued.");
    }

    // The ticket amount is the proposal: R17 fails if the invoice no longer matches it, and a caller cannot override it.
    const gate = evaluate({ now, earmark, invoice, registry, history, proposal: { amountMinor: ticket.amountMinor } });
    if (gate.verdict !== "ALLOW") {
      const failed = gate.results.filter((r) => r.status === "fail").map((r) => r.ruleId);
      const warned = gate.results.filter((r) => r.status === "warn").map((r) => r.ruleId);
      appendEvent(
        tx,
        {
          earmarkId: ticket.earmarkId,
          type: "policy.evaluated",
          actor: "gate",
          payload: { invoiceId: ticket.invoiceId, ticketId, verdict: gate.verdict, firstBlocking: gate.firstBlocking, failed, warned },
        },
        { now },
      );
      return err({
        code: "POLICY_BLOCKED",
        message: "The gate refused this payment when the ticket was redeemed.",
        detail: { ruleIds: failed.length > 0 ? failed : warned },
      });
    }

    const paid = tx.select({ id: payments.id }).from(payments).where(eq(payments.invoiceId, ticket.invoiceId)).get();
    if (paid) return refuse("CONFLICT_DUPLICATE", "INVOICE_ALREADY_PAID", "This invoice already has a payment.");

    tx.update(tickets)
      .set({ redeemedAt: new Date(now) })
      .where(and(eq(tickets.id, ticketId), isNull(tickets.redeemedAt)))
      .run();
    tx.update(earmarks).set({ status: "paying" }).where(eq(earmarks.id, ticket.earmarkId)).run();
    const paymentId = `pay_${nanoid(12)}`;
    tx.insert(payments)
      .values({
        id: paymentId,
        earmarkId: ticket.earmarkId,
        invoiceId: ticket.invoiceId,
        ticketId,
        amountMinor: ticket.amountMinor,
        currency: ticket.currency,
        status: "pending",
        idempotencyKey: paymentId,
        createdAt: new Date(now),
      })
      .run();
    appendEvent(tx, { earmarkId: ticket.earmarkId, type: "ticket.redeemed", actor: "orchestrator", payload: { ticketId, paymentId } }, { now });
    return ok({ ticket, paymentId });
  });
}
