import "server-only";
// Hold the money (docs/03-PAYPAL-INTEGRATION.md §3.1): Orders v2 create (intent AUTHORIZE) → authorize.
// Lives in the orchestrator because only lib/orchestrator may talk to the PayPal client (money rule 2).
// Both steps are idempotent: PayPal-Request-Id `em_x:order` / `em_x:authorize`, and a repeated call returns stored ids.
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { type Earmark, earmarks } from "@/lib/db/schema";
import { findEarmark } from "@/lib/earmarks/service";
import type { AppError } from "@/lib/errors";
import { appendEvent } from "@/lib/events/append";
import { err, ok, type Result } from "@/lib/result";
import { PayPalError, type PayPalClient, requestIdFor } from "@/lib/paypal/types";

function paypalError(e: unknown): AppError {
  if (e instanceof PayPalError) {
    return { code: "PAYPAL_ERROR", message: e.message, detail: { name: e.name, ...(e.debugId ? { debugId: e.debugId } : {}) } };
  }
  throw e; // not a PayPal failure → a bug
}

export async function createAuthorizeOrder(
  db: Db,
  paypal: PayPalClient,
  earmarkId: string,
  now: number,
): Promise<Result<{ orderId: string }, AppError>> {
  const found = findEarmark(db, earmarkId);
  if (!found.ok) return found;
  const e = found.value;
  if (e.status !== "awaiting_authorization") {
    return err({ code: "INVALID_STATE", message: `Earmark is ${e.status}; approve the contract first.` });
  }
  if (e.paypalOrderId) return ok({ orderId: e.paypalOrderId });
  if (e.frozen) return err({ code: "FROZEN", message: "Earmark is paused." });

  let orderId: string;
  try {
    ({ orderId } = await paypal.createAuthorizeOrder(
      {
        earmarkId,
        amountMinor: e.capMinor,
        currency: e.currency,
        description: `Earmark: ${e.contract.purpose.description}`.slice(0, 127),
      },
      requestIdFor(earmarkId, "order"),
    ));
  } catch (x) {
    return err(paypalError(x));
  }

  db.transaction((tx) => {
    const updated = tx
      .update(earmarks)
      .set({ paypalOrderId: orderId })
      .where(and(eq(earmarks.id, earmarkId), eq(earmarks.status, "awaiting_authorization"), isNull(earmarks.paypalOrderId)))
      .returning({ id: earmarks.id })
      .get();
    if (!updated) return; // a concurrent identical call stored it and logged the event
    appendEvent(
      tx,
      {
        earmarkId,
        type: "paypal.order_created",
        actor: "orchestrator",
        payload: { orderId, amountMinor: e.capMinor, currency: e.currency, intent: "AUTHORIZE" },
      },
      { now },
    );
  });
  return ok({ orderId });
}

export async function authorizeEarmark(
  db: Db,
  paypal: PayPalClient,
  earmarkId: string,
  orderId: string,
  now: number,
): Promise<Result<Earmark, AppError>> {
  const found = findEarmark(db, earmarkId);
  if (!found.ok) return found;
  const e = found.value;
  if (e.authorizationId && e.paypalOrderId === orderId) return ok(e); // replay of a completed authorize
  if (e.status !== "awaiting_authorization") return err({ code: "INVALID_STATE", message: `Earmark is ${e.status}.` });
  if (!e.paypalOrderId || e.paypalOrderId !== orderId) {
    return err({ code: "VALIDATION", message: "That PayPal order does not belong to this Earmark." });
  }

  let auth: { authorizationId: string; status: string; expirationTime?: string };
  try {
    auth = await paypal.authorizeOrder(orderId, requestIdFor(earmarkId, "authorize"));
  } catch (x) {
    return err(paypalError(x));
  }

  return ok(
    db.transaction((tx) => {
      const row = tx
        .update(earmarks)
        .set({ authorizationId: auth.authorizationId, authorizedAt: new Date(now), status: "held" })
        .where(and(eq(earmarks.id, earmarkId), eq(earmarks.status, "awaiting_authorization")))
        .returning()
        .get();
      // A concurrent identical call already stored it (same Request-Id → same authorization).
      if (!row) return tx.select().from(earmarks).where(eq(earmarks.id, earmarkId)).get()!;
      appendEvent(
        tx,
        {
          earmarkId,
          type: "paypal.authorized",
          actor: "paypal",
          payload: {
            authorizationId: auth.authorizationId,
            status: auth.status,
            amountMinor: e.capMinor,
            currency: e.currency,
            expirationTime: auth.expirationTime ?? null,
          },
        },
        { now },
      );
      return row;
    }),
  );
}
