import "server-only";
// Builds the gate's view of an invoice from the DB. Used at intake, at approval and at ticket redemption, so the
// gate sees the same facts every time. Callers pass a transaction so the snapshot is consistent.
import { and, eq, ne } from "drizzle-orm";
import type { RegistryEntry as ResolveEntry } from "@/lib/contract/registry";
import type { Db, Tx } from "@/lib/db/client";
import { earmarks, type Invoice, institutions, invoices } from "@/lib/db/schema";
import { invoiceNumberKey } from "@/lib/policy/rules";
import { gateEarmark, type RedemptionContext } from "@/lib/policy/tickets";
import type { GateContext } from "@/lib/policy/types";
import { crosscheck } from "./crosscheck";
import { ExtractedInvoice } from "./schema";
import { SignedInvoicePayload, signedGateInvoice } from "./signed";

type Reader = Db | Tx;

export function registrySnapshot(db: Reader): { gate: GateContext["registry"]; resolve: ResolveEntry[] } {
  const rows = db.select().from(institutions).all();
  const byId: GateContext["registry"]["byId"] = {};
  for (const r of rows) byId[r.id] = { name: r.name, paypalEmail: r.paypalEmail, verified: r.verified, publicKey: r.publicKey };
  return { gate: { byId }, resolve: rows.map(({ id, name, aliases, verified }) => ({ id, name, aliases, verified })) };
}

/** Every stored invoice except `excludeId`, across all Earmarks: a school invoice pays once, whoever uploads it. */
export function historyExcluding(db: Reader, excludeId: string | null): GateContext["history"] {
  const rows = db
    .select({ fileHash: invoices.fileHash, institutionId: invoices.institutionId, invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(excludeId === null ? undefined : ne(invoices.id, excludeId))
    .all();
  const fileHashes = new Set<string>();
  const invoiceNumbers = new Set<string>();
  for (const r of rows) {
    fileHashes.add(r.fileHash);
    if (r.institutionId !== null && r.invoiceNumber !== null) invoiceNumbers.add(invoiceNumberKey(r.institutionId, r.invoiceNumber));
  }
  return { fileHashes, invoiceNumbers };
}

/**
 * The gate's invoice facts for a stored row. Uploads are re-crosschecked from the stored extraction; signed invoices
 * have their signature verified again against the registry key as it is now.
 */
export function gateInvoiceFromRow(row: Invoice, registry: ReturnType<typeof registrySnapshot>): GateContext["invoice"] {
  const approvedBySender = row.approvedBy === "sender";
  if (row.source === "signed") {
    const payload = SignedInvoicePayload.parse(row.extracted);
    return signedGateInvoice({ id: row.id, wire: { payload, signature: row.signature ?? "", keyId: payload.institutionId }, registry: registry.gate, approvedBySender });
  }
  const extracted = ExtractedInvoice.parse(row.extracted);
  const x = crosscheck(extracted, registry.resolve);
  return {
    id: row.id,
    source: "uploaded",
    fileHash: row.fileHash,
    invoiceNumber: row.invoiceNumber,
    amountMinor: row.amountMinor,
    currency: row.currency,
    payeeName: row.payeeName,
    payeeAccount: row.payeeAccount,
    institutionId: row.institutionId,
    extracted,
    lineItemsSumMinor: x.lineItemsSumMinor,
    purposeText: x.purposeText,
    containsInstructions: x.containsInstructions,
    approvedBySender,
  };
}

/** For ticket redemption: the invoice must belong to the ticket's Earmark, or this is a bug, not a policy question. */
export function loadRedemptionContext(tx: Tx, invoiceId: string, earmarkId: string): RedemptionContext {
  const row = tx.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.earmarkId, earmarkId))).get();
  if (!row) throw new Error(`loadRedemptionContext: invoice ${invoiceId} is not on earmark ${earmarkId}`);
  const registry = registrySnapshot(tx);
  return { invoice: gateInvoiceFromRow(row, registry), registry: registry.gate, history: historyExcluding(tx, invoiceId) };
}

/** The whole gate context for a stored invoice as things stand now (for proposals and re-checks). */
export function invoiceGateContext(db: Reader, invoiceId: string, now: number, proposal?: { amountMinor: number }): GateContext | null {
  const row = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!row) return null;
  const earmark = db.select().from(earmarks).where(eq(earmarks.id, row.earmarkId)).get()!;
  const registry = registrySnapshot(db);
  return {
    now,
    earmark: gateEarmark(earmark),
    invoice: gateInvoiceFromRow(row, registry),
    registry: registry.gate,
    history: historyExcluding(db, invoiceId),
    ...(proposal ? { proposal } : {}),
  };
}
