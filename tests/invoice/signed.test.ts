// docs/05 §5 tests: valid; one byte of payload changed; signed by a different key; unknown institution.
import { describe, expect, it } from "vitest";
import { generateEd25519KeyPair, signEd25519, verifyEd25519 } from "@/lib/crypto/ed25519";
import { type SignedInvoicePayload, signedFileHash, signedGateInvoice, signedMessage, verifySignedInvoice } from "@/lib/invoice/signed";
import type { GateContext } from "@/lib/policy/types";

const school = generateEd25519KeyPair();
const other = generateEd25519KeyPair();

const payload: SignedInvoicePayload = {
  v: 1,
  institutionId: "ins_lakeview",
  invoiceNumber: "LSS-T1-1001",
  earmarkRef: "em_demo",
  studentName: "Brian Kamau",
  description: "Term 1 2027 school fees",
  lineItems: [
    { label: "Tuition", amountMinor: 25000 },
    { label: "Boarding", amountMinor: 10000 },
  ],
  totalMinor: 35000,
  currency: "USD",
  payoutAccount: "sb-lakeview@business.example.com",
  issuedAt: "2026-11-03T09:00:00.000Z",
  dueDate: "2026-12-03",
};

const registry: GateContext["registry"] = {
  byId: {
    ins_lakeview: { name: "Lakeview Secondary School", paypalEmail: "sb-lakeview@business.example.com", verified: true, publicKey: school.publicKey },
    ins_riverbend: { name: "Riverbend Academy", paypalEmail: "sb-riverbend@business.example.com", verified: true, publicKey: null },
  },
};

const wire = (p = payload, key = school.privateKey, keyId = p.institutionId) => ({ payload: p, signature: signEd25519(key, signedMessage(p)), keyId });

describe("signed invoices", () => {
  it("verifies a valid signature", () => {
    expect(verifySignedInvoice(wire(), registry)).toBe(true);
  });

  it("fails when one value changes after signing", () => {
    const w = wire();
    expect(verifySignedInvoice({ ...w, payload: { ...w.payload, totalMinor: 35001 } }, registry)).toBe(false);
    expect(verifySignedInvoice({ ...w, payload: { ...w.payload, payoutAccount: "attacker@mail.example.com" } }, registry)).toBe(false);
  });

  it("fails when signed by a different key, or for an institution with no key or no entry", () => {
    expect(verifySignedInvoice(wire(payload, other.privateKey), registry)).toBe(false);
    expect(verifySignedInvoice(wire({ ...payload, institutionId: "ins_riverbend" }), registry)).toBe(false);
    expect(verifySignedInvoice(wire({ ...payload, institutionId: "ins_unknown" }), registry)).toBe(false);
    // keyId must name the payload's own institution
    expect(verifySignedInvoice({ ...wire(), keyId: "ins_riverbend" }, registry)).toBe(false);
  });

  it("never throws on garbage keys or signatures", () => {
    expect(verifyEd25519("not-a-key", "m", "sig")).toBe(false);
    expect(verifySignedInvoice({ ...wire(), signature: "%%%" }, registry)).toBe(false);
  });

  it("gate facts come from the payload, with the hash over the canonical payload", () => {
    const facts = signedGateInvoice({ id: "inv_1", wire: wire(), registry, approvedBySender: false });
    expect(facts).toMatchObject({
      source: "signed",
      fileHash: signedFileHash(payload),
      amountMinor: 35000,
      institutionId: "ins_lakeview",
      payeeName: "Lakeview Secondary School",
      signatureValid: true,
      lineItemsSumMinor: 35000,
      purposeText: "Term 1 2027 school fees. Tuition. Boarding",
      containsInstructions: false,
    });
    expect(signedGateInvoice({ id: "inv_2", wire: wire({ ...payload, institutionId: "ins_unknown" }), registry, approvedBySender: false }).institutionId).toBeNull();
  });
});
