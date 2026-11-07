import type { ExtractedInvoice } from "@/lib/invoice/schema";
import type { GateContext } from "@/lib/policy/types";
import { TEST_NOW } from "./db";
import { makeContract } from "./factories";

const DAY = 24 * 60 * 60 * 1000;

export const SCHOOL_EMAIL = "sb-lakeview@business.example.com";

/** A clean, passing case: connected-mode $350 invoice on a held $400 Earmark (docs/05-POLICY-GATE.md §3). */
export function baseCtx(): GateContext {
  return {
    now: TEST_NOW,
    earmark: {
      id: "em_gate",
      status: "held",
      frozen: false,
      capMinor: 40000,
      capturedMinor: 0,
      currency: "USD",
      expiresAt: TEST_NOW + 3 * DAY,
      contract: makeContract(),
    },
    invoice: {
      id: "inv_gate",
      source: "signed",
      fileHash: "hash_gate",
      invoiceNumber: "LSS-2027-001",
      amountMinor: 35000,
      currency: "USD",
      payeeName: "Lakeview Secondary School",
      payeeAccount: SCHOOL_EMAIL,
      institutionId: "ins_lakeview",
      signatureValid: true,
      lineItemsSumMinor: 35000,
      purposeText: "Term 1 2027 tuition and boarding",
    },
    registry: {
      byId: {
        ins_lakeview: { name: "Lakeview Secondary School", paypalEmail: SCHOOL_EMAIL, verified: true, publicKey: "cHVibGlj" },
        ins_lookalike: { name: "Lakeview Secondary Schools Ltd", paypalEmail: "sb-lookalike@personal.example.com", verified: false, publicKey: null },
      },
    },
    history: { fileHashes: new Set(), invoiceNumbers: new Set() },
  };
}

export function makeExtracted(confidence = 0.99): ExtractedInvoice {
  const field = <T>(value: T) => ({ value, confidence });
  return {
    institutionName: field("Lakeview Secondary School"),
    payoutAccount: field(SCHOOL_EMAIL),
    invoiceNumber: field("LSS-2027-001"),
    studentName: field("Brian Kamau"),
    description: field("Term 1 2027 tuition and boarding"),
    lineItems: [{ label: "Tuition", amount: "350.00" }],
    total: field("350.00"),
    currency: field("USD"),
    issueDate: field("2026-11-01"),
    dueDate: field("2026-11-30"),
    containsInstructions: false,
  };
}

/** The same invoice as a legacy upload with a confident extraction. */
export function uploadedCtx(): GateContext {
  const ctx = baseCtx();
  ctx.invoice.source = "uploaded";
  ctx.invoice.signatureValid = undefined;
  ctx.invoice.extracted = makeExtracted();
  return ctx;
}
