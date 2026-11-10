import "server-only";
// Legacy upload pipeline (docs/06-API-SPEC.md "Invoices"): hash → store file → quarantined extract → crosscheck →
// gate → save invoice + events. Also the sender's approve / reject. Nothing here moves money: an ALLOW only makes
// the invoice eligible for the Guardian to propose, and the gate re-runs when a ticket is issued and redeemed.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { AiRuntime } from "@/lib/ai/call";
import type { Db, Tx } from "@/lib/db/client";
import { type Invoice, earmarks, invoices } from "@/lib/db/schema";
import type { AppError } from "@/lib/errors";
import { appendEvent } from "@/lib/events/append";
import { evaluate } from "@/lib/policy/gate";
import { gateEarmark } from "@/lib/policy/tickets";
import type { GateResult, RuleId } from "@/lib/policy/types";
import { err, ok, type Result } from "@/lib/result";
import { gateInvoiceFromRow, historyExcluding, registrySnapshot } from "./context";
import { crosscheck } from "./crosscheck";
import { extractInvoice, isSupportedMime } from "./extract";
import { fileHash } from "./hash";
import type { ExtractedInvoice } from "./schema";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface UploadInput {
  earmarkId: string;
  bytes: Uint8Array;
  mime: string;
}

export interface IntakeDeps {
  ai: AiRuntime;
  now: number;
  /** Where to keep the original file (`.data/uploads`); null in tests. */
  uploadsDir: string | null;
}

export interface IntakeOutcome {
  invoiceId: string;
  /** False when the gate found a duplicate: the unique indexes allow only the first copy to be stored. */
  stored: boolean;
  fileHash: string;
  gate: GateResult;
  extracted: ExtractedInvoice;
}

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };
const short = (s: string | null) => (s === null ? null : s.slice(0, 120));

export function failedRules(gate: GateResult): RuleId[] {
  return gate.results.filter((r) => r.status === "fail").map((r) => r.ruleId);
}

export function warnedRules(gate: GateResult): RuleId[] {
  return gate.results.filter((r) => r.status === "warn").map((r) => r.ruleId);
}

function policyEvent(tx: Db | Tx, earmarkId: string, invoiceId: string, gate: GateResult, now: number, extra: Record<string, boolean | string> = {}) {
  appendEvent(
    tx,
    {
      earmarkId,
      type: "policy.evaluated",
      actor: "gate",
      payload: {
        invoiceId,
        verdict: gate.verdict,
        firstBlocking: gate.firstBlocking ?? null,
        failed: failedRules(gate),
        warned: warnedRules(gate),
        ...extra,
      },
    },
    { now },
  );
}

export async function intakeUpload(db: Db, input: UploadInput, deps: IntakeDeps): Promise<Result<IntakeOutcome, AppError>> {
  const { earmarkId, bytes, mime } = input;
  const { now } = deps;
  if (!isSupportedMime(mime)) return err({ code: "VALIDATION", message: "Upload a PDF, PNG or JPEG invoice." });
  if (bytes.byteLength === 0) return err({ code: "VALIDATION", message: "The file is empty." });
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return err({ code: "VALIDATION", message: "The file is larger than 10 MB." });
  const earmark = db.select({ id: earmarks.id }).from(earmarks).where(eq(earmarks.id, earmarkId)).get();
  if (!earmark) return err({ code: "NOT_FOUND", message: `Earmark ${earmarkId} not found.` });

  const hash = fileHash(bytes);
  const invoiceId = `inv_${nanoid(12)}`;
  appendEvent(db, { earmarkId, type: "invoice.received", actor: "recipient", payload: { invoiceId, source: "uploaded", fileHash: hash, mime, sizeBytes: bytes.byteLength } }, { now });

  let storagePath: string | null = null;
  if (deps.uploadsDir) {
    mkdirSync(deps.uploadsDir, { recursive: true });
    storagePath = join(deps.uploadsDir, `${hash}.${EXT[mime]}`);
    if (!existsSync(storagePath)) writeFileSync(storagePath, bytes);
  }

  const extraction = await extractInvoice({ bytes, mime }, { ...deps.ai, trace: { db, earmarkId } });
  if (!extraction.ok) {
    appendEvent(db, { earmarkId, type: "invoice.extracted", actor: "system", payload: { invoiceId, ok: false, error: extraction.error.code } }, { now });
    return err({ code: "AI_ERROR", message: extraction.error.message, detail: { reason: extraction.error.code } });
  }
  const extracted = extraction.value.output;

  // Everything from here to the insert is synchronous inside one transaction, so two uploads cannot both pass R09.
  return db.transaction((tx) => {
    const registry = registrySnapshot(tx);
    const x = crosscheck(extracted, registry.resolve);
    const earmarkRow = tx.select().from(earmarks).where(eq(earmarks.id, earmarkId)).get()!;
    const gate = evaluate({
      now,
      earmark: gateEarmark(earmarkRow),
      invoice: {
        id: invoiceId,
        source: "uploaded",
        fileHash: hash,
        invoiceNumber: x.invoiceNumber,
        amountMinor: x.amountMinor,
        currency: x.currency,
        payeeName: x.payeeName,
        payeeAccount: x.payeeAccount,
        institutionId: x.institutionId,
        extracted,
        lineItemsSumMinor: x.lineItemsSumMinor,
        purposeText: x.purposeText,
        containsInstructions: x.containsInstructions,
        approvedBySender: false,
      },
      registry: registry.gate,
      history: historyExcluding(tx, null),
    });

    appendEvent(
      tx,
      {
        earmarkId,
        type: "invoice.extracted",
        actor: "system",
        payload: {
          invoiceId,
          ok: true,
          invoiceNumber: short(x.invoiceNumber),
          payeeName: short(x.payeeName),
          payeeAccount: short(x.payeeAccount),
          amountMinor: x.amountMinor,
          currency: x.currency,
          containsInstructions: x.containsInstructions,
          extractorTools: "none",
        },
      },
      { now },
    );

    const stored = !failedRules(gate).includes("R09_NOT_DUPLICATE");
    if (stored) {
      tx.insert(invoices)
        .values({
          id: invoiceId,
          earmarkId,
          source: "uploaded",
          fileHash: hash,
          invoiceNumber: x.invoiceNumber,
          institutionId: x.institutionId,
          payeeName: x.payeeName,
          payeeAccount: x.payeeAccount,
          amountMinor: x.amountMinor,
          currency: x.currency,
          extracted,
          verdict: gate.verdict,
          reasons: gate.results,
          storagePath,
          createdAt: new Date(now),
        })
        .run();
    }
    policyEvent(tx, earmarkId, invoiceId, gate, now, stored ? {} : { stored: false });
    return ok({ invoiceId, stored, fileHash: hash, gate, extracted });
  });
}

export function findInvoice(db: Db | Tx, id: string): Result<Invoice, AppError> {
  const row = db.select().from(invoices).where(eq(invoices.id, id)).get();
  return row ? ok(row) : err({ code: "NOT_FOUND", message: `Invoice ${id} not found.` });
}

/** Re-runs the gate on a stored invoice against the Earmark as it is now. */
export function regate(tx: Db | Tx, row: Invoice, now: number): GateResult {
  const registry = registrySnapshot(tx);
  const earmarkRow = tx.select().from(earmarks).where(eq(earmarks.id, row.earmarkId)).get()!;
  return evaluate({
    now,
    earmark: gateEarmark(earmarkRow),
    invoice: gateInvoiceFromRow(row, registry.resolve),
    registry: registry.gate,
    history: historyExcluding(tx, row.id),
  });
}

/**
 * Sender approval of a REQUIRE_APPROVAL invoice. Approval only clears the warnings: a rule that fails now (pause,
 * expiry, a duplicate that arrived meanwhile) still blocks, because the gate runs again.
 */
export function approveInvoice(db: Db, id: string, now: number): Result<{ invoice: Invoice; gate: GateResult }, AppError> {
  return db.transaction((tx) => {
    const found = findInvoice(tx, id);
    if (!found.ok) return found;
    const row = found.value;
    if (row.approvedBy === "sender") return ok({ invoice: row, gate: regate(tx, row, now) });
    if (row.approvedBy === "rejected") return err({ code: "INVALID_STATE", message: "This invoice was rejected." });
    if (row.verdict !== "REQUIRE_APPROVAL") return err({ code: "INVALID_STATE", message: `This invoice is ${row.verdict}, not waiting for approval.` });

    const approved = tx.update(invoices).set({ approvedBy: "sender" }).where(eq(invoices.id, id)).returning().get()!;
    appendEvent(tx, { earmarkId: row.earmarkId, type: "approval.granted", actor: "sender", payload: { invoiceId: id, amountMinor: row.amountMinor } }, { now });
    const gate = regate(tx, approved, now);
    const invoice = tx.update(invoices).set({ verdict: gate.verdict, reasons: gate.results }).where(eq(invoices.id, id)).returning().get()!;
    policyEvent(tx, row.earmarkId, id, gate, now, { afterApproval: true });
    return ok({ invoice, gate });
  });
}

export function rejectInvoice(db: Db, id: string, now: number): Result<Invoice, AppError> {
  return db.transaction((tx) => {
    const found = findInvoice(tx, id);
    if (!found.ok) return found;
    const row = found.value;
    if (row.approvedBy === "rejected") return ok(row);
    if (row.verdict !== "REQUIRE_APPROVAL" || row.approvedBy === "sender") {
      return err({ code: "INVALID_STATE", message: "Only an invoice waiting for approval can be rejected." });
    }
    const invoice = tx.update(invoices).set({ approvedBy: "rejected" }).where(eq(invoices.id, id)).returning().get()!;
    appendEvent(tx, { earmarkId: row.earmarkId, type: "approval.rejected", actor: "sender", payload: { invoiceId: id } }, { now });
    return ok(invoice);
  });
}
