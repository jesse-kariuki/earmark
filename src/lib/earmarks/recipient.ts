import "server-only";
// Recipient-safe view (docs/06 "Recipient", docs/07 screen 5): what was paid, to whom, and a confirm button.
// No sender details beyond the first name, no account numbers.
import { and, eq } from "drizzle-orm";
import { explain, explainFacts, type ExplainResult } from "@/lib/agents/explain";
import type { AiRuntime } from "@/lib/ai/call";
import type { Db } from "@/lib/db/client";
import { earmarks, events, institutions } from "@/lib/db/schema";
import type { AppError } from "@/lib/errors";
import { appendEvent, getEvents } from "@/lib/events/append";
import { err, ok, type Result } from "@/lib/result";
import { findEarmark } from "./service";

export interface RecipientView {
  earmarkId: string;
  beneficiary: string;
  senderFirstName: string;
  institution: string;
  period: string;
  status: string;
  currency: string;
  heldMinor: number;
  paidMinor: number | null;
  paidAt: number | null;
  confirmedAt: number | null;
  messages: ExplainResult;
}

export async function recipientView(db: Db, id: string, ai: AiRuntime | null, now: number): Promise<Result<RecipientView, AppError>> {
  const found = findEarmark(db, id);
  if (!found.ok) return found;
  const e = found.value;
  const registry = db.select({ id: institutions.id, name: institutions.name }).from(institutions).all();
  const institution = registry.find((r) => r.id === e.contract.payee.institutionId)?.name ?? e.contract.payee.institutionName;
  const chain = getEvents(db, id);
  const facts = explainFacts(e, institution, chain);
  const messages = await explain(
    facts,
    registry.map((r) => r.name),
    ai,
  );

  // Logged once, the first time a paid Earmark's message is shown.
  if (facts.paidMinor !== null && !chain.some((ev) => ev.type === "recipient.notified")) {
    appendEvent(db, { earmarkId: id, type: "recipient.notified", actor: "system", payload: { channel: "recipient page", messageSource: messages.source } }, { now });
  }
  return ok({
    earmarkId: id,
    beneficiary: e.contract.purpose.beneficiary,
    senderFirstName: e.senderName.split(" ")[0] ?? e.senderName,
    institution,
    period: facts.period,
    status: e.status,
    currency: e.currency,
    heldMinor: e.capMinor - e.capturedMinor - e.releasedMinor,
    paidMinor: facts.paidMinor,
    paidAt: facts.paidAt,
    confirmedAt: e.recipientConfirmedAt?.getTime() ?? null,
    messages,
  });
}

/** "Confirm I see this": once. Only after something was actually paid. */
export function confirmRecipient(db: Db, id: string, now: number): Result<{ confirmedAt: number }, AppError> {
  return db.transaction((tx) => {
    const e = tx.select().from(earmarks).where(eq(earmarks.id, id)).get();
    if (!e) return err({ code: "NOT_FOUND", message: `Earmark ${id} not found.` });
    if (e.recipientConfirmedAt) return ok({ confirmedAt: e.recipientConfirmedAt.getTime() });
    const paid = tx.select({ id: events.id }).from(events).where(and(eq(events.earmarkId, id), eq(events.type, "paypal.captured"))).get();
    if (!paid) return err({ code: "INVALID_STATE", message: "Nothing has been paid yet." });
    tx.update(earmarks).set({ recipientConfirmedAt: new Date(now) }).where(eq(earmarks.id, id)).run();
    appendEvent(tx, { earmarkId: id, type: "recipient.confirmed", actor: "recipient", payload: {} }, { now });
    return ok({ confirmedAt: now });
  });
}
