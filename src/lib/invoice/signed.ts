import "server-only";
// Connected mode (docs/05-POLICY-GATE.md §5): the school signs a structured invoice with its Ed25519 key.
// No model reads it, so there is nothing to inject into: the fields are the school's own, bound by the signature.
import { z } from "zod";
import { verifyEd25519 } from "@/lib/crypto/ed25519";
import { sha256HexSync } from "@/lib/crypto/sha256";
import { canonicalize } from "@/lib/events/canonical";
import type { GateContext } from "@/lib/policy/types";

const Text = z.string().max(200);

export const SignedInvoicePayload = z.object({
  v: z.literal(1),
  institutionId: z.string().max(64),
  invoiceNumber: z.string().min(1).max(64),
  earmarkRef: z.string().max(64), // the Earmark id the school was given (share link)
  studentName: Text,
  description: Text.optional(), // e.g. "Term 1 2027 school fees" — input to R10 with the line labels
  lineItems: z.array(z.object({ label: z.string().max(120), amountMinor: z.number().int().nonnegative() })).min(1).max(30),
  totalMinor: z.number().int().positive(),
  currency: z.literal("USD"),
  payoutAccount: z.string().email().max(254),
  issuedAt: z.string().datetime(),
  dueDate: z.string().max(32),
});
export type SignedInvoicePayload = z.infer<typeof SignedInvoicePayload>;

/** Wire format: `signature` = base64(ed25519_sign(canonicalJson(payload))), `keyId` = institution id. */
export const SignedInvoiceWire = z.object({ payload: SignedInvoicePayload, signature: z.string().min(1).max(200), keyId: z.string().max(64) });
export type SignedInvoiceWire = z.infer<typeof SignedInvoiceWire>;

export function signedMessage(payload: SignedInvoicePayload): string {
  return canonicalize(payload);
}

/** fileHash for a signed invoice = sha256(canonicalJson(payload)). */
export function signedFileHash(payload: SignedInvoicePayload): string {
  return sha256HexSync(signedMessage(payload));
}

/** Valid only if keyId names the payload's own institution, that institution has a key, and the signature verifies. */
export function verifySignedInvoice(wire: SignedInvoiceWire, registry: GateContext["registry"]): boolean {
  if (wire.keyId !== wire.payload.institutionId) return false;
  const key = registry.byId[wire.keyId]?.publicKey;
  return key ? verifyEd25519(key, signedMessage(wire.payload), wire.signature) : false;
}

/** The gate's view of a signed invoice. The payload is the evidence; nothing is extracted. */
export function signedGateInvoice(
  opts: { id: string; wire: SignedInvoiceWire; registry: GateContext["registry"]; approvedBySender: boolean },
): GateContext["invoice"] {
  const { payload } = opts.wire;
  const entry = opts.registry.byId[payload.institutionId];
  const sum = payload.lineItems.reduce((s, li) => s + li.amountMinor, 0);
  return {
    id: opts.id,
    source: "signed",
    fileHash: signedFileHash(payload),
    invoiceNumber: payload.invoiceNumber,
    amountMinor: payload.totalMinor,
    currency: payload.currency,
    payeeName: entry?.name ?? null,
    payeeAccount: payload.payoutAccount,
    institutionId: entry ? payload.institutionId : null,
    signatureValid: verifySignedInvoice(opts.wire, opts.registry),
    lineItemsSumMinor: Number.isSafeInteger(sum) ? sum : Number.NaN,
    purposeText: [payload.description, ...payload.lineItems.map((li) => li.label)].filter(Boolean).join(". ") || null,
    containsInstructions: false,
    approvedBySender: opts.approvedBySender,
  };
}
