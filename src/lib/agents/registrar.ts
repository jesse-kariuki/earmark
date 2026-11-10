import "server-only";
// The Registrar acts for the school (docs/04-AI-AGENTS.md §4): console form → SignedInvoice payload → Ed25519
// signature with the school's key. Kept thin and deterministic; it holds the key, never anyone's money.
import { and, eq } from "drizzle-orm";
import { signEd25519 } from "@/lib/crypto/ed25519";
import type { Db } from "@/lib/db/client";
import { earmarks, institutions, invoices } from "@/lib/db/schema";
import type { AppError } from "@/lib/errors";
import { type SignedInvoicePayload, type SignedInvoiceWire, signedMessage } from "@/lib/invoice/signed";
import { err, ok, type Result } from "@/lib/result";

export const SCHOOL_INSTITUTION_ID = "ins_lakeview";

export interface IssueInvoiceInput {
  earmarkRef: string;
  lineItems: { label: string; amountMinor: number }[];
  studentName?: string;
  description?: string;
  /** Demo only: add a $40 line AFTER signing. Still within the cap and adding up, so only the signature catches it (R12). */
  tamper?: boolean;
}

export function issueInvoice(db: Db, input: IssueInvoiceInput, keys: { privateKey: string }, now: number): Result<SignedInvoiceWire, AppError> {
  const school = db.select().from(institutions).where(eq(institutions.id, SCHOOL_INSTITUTION_ID)).get();
  if (!school) return err({ code: "NOT_FOUND", message: "The school is not in the registry." });
  const earmark = db.select().from(earmarks).where(eq(earmarks.id, input.earmarkRef)).get();
  if (!earmark) return err({ code: "NOT_FOUND", message: `No Earmark with reference ${input.earmarkRef}.` });

  // Count-based numbers collide when two invoices are issued at once, so the clock breaks ties.
  const issued = db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.institutionId, school.id), eq(invoices.source, "signed")))
    .all().length;
  const suffix = (now % 46656).toString(36).toUpperCase().padStart(3, "0");
  const totalMinor = input.lineItems.reduce((s, li) => s + li.amountMinor, 0);
  const payload: SignedInvoicePayload = {
    v: 1,
    institutionId: school.id,
    invoiceNumber: `LSS-T1-${String(1001 + issued)}-${suffix}`,
    earmarkRef: earmark.id,
    studentName: input.studentName ?? earmark.recipientName,
    description: input.description ?? `${earmark.contract.purpose.period ?? "Term"} school fees`,
    lineItems: input.lineItems,
    totalMinor,
    currency: "USD",
    payoutAccount: school.paypalEmail, // the school's own registered account
    issuedAt: new Date(now).toISOString(),
    dueDate: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };
  const signature = signEd25519(keys.privateKey, signedMessage(payload));
  const sent = input.tamper
    ? { ...payload, totalMinor: totalMinor + 4000, lineItems: [...payload.lineItems, { label: "Late fee", amountMinor: 4000 }] }
    : payload;
  return ok({ payload: sent, signature, keyId: school.id });
}
