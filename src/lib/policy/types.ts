// Policy types (docs/05-POLICY-GATE.md §1). Rule ids are frozen: UI, trace, Attack Lab and evals key off them.
import type { IntentContract } from "@/lib/contract/schema";
import type { EarmarkStatus } from "@/lib/db/schema";
import type { ExtractedInvoice } from "@/lib/invoice/schema";

export type Verdict = "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";
export type RuleStatus = "pass" | "fail" | "warn" | "skip";

export const RULE_IDS = [
  "R01_NOT_FROZEN",
  "R02_NOT_EXPIRED",
  "R03_FUNDS_HELD",
  "R04_PAYEE_IS_CONTRACT_INSTITUTION",
  "R05_PAYOUT_ACCOUNT_MATCH",
  "R06_INSTITUTION_VERIFIED",
  "R07_WITHIN_CAP",
  "R08_CURRENCY_MATCH",
  "R09_NOT_DUPLICATE",
  "R10_PURPOSE_MATCH",
  "R11_EVIDENCE_SATISFIED",
  "R12_SIGNATURE_VALID",
  "R13_NO_EMBEDDED_INSTRUCTIONS",
  "R14_ARITHMETIC",
  "R15_EXTRACTION_CONFIDENCE",
  "R16_APPROVAL_THRESHOLD",
  "R17_PROPOSAL_MATCHES_INVOICE",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export interface RuleResult {
  ruleId: RuleId;
  status: RuleStatus; // fail → BLOCK, warn → REQUIRE_APPROVAL
  title: string;
  reason: string; // plain English, includes the compared values
  expected?: string;
  actual?: string;
}

export interface RegistryEntry {
  name: string;
  paypalEmail: string;
  verified: boolean;
  publicKey: string | null;
}

/** Everything the gate may look at. Built by the caller: the gate does no I/O and reads no clock. */
export interface GateContext {
  now: number; // ms epoch, injected
  earmark: {
    id: string;
    status: EarmarkStatus;
    frozen: boolean;
    capMinor: number;
    capturedMinor: number;
    currency: string;
    expiresAt: number; // ms epoch
    contract: IntentContract;
  };
  invoice: {
    id: string;
    source: "signed" | "uploaded";
    fileHash: string;
    invoiceNumber: string | null;
    amountMinor: number | null;
    currency: string | null;
    payeeName: string | null;
    payeeAccount: string | null; // as printed / signed; only ever compared, never paid
    institutionId: string | null;
    extracted?: ExtractedInvoice;
    signatureValid?: boolean;
    lineItemsSumMinor?: number | null;
    /** Description plus line-item labels, from the extractor or the signed payload. Input to R10. */
    purposeText?: string | null;
    containsInstructions?: boolean;
    approvedBySender?: boolean;
  };
  registry: { byId: Record<string, RegistryEntry> };
  /** Other invoices already seen. Must not include this invoice, or re-gating at redemption blocks itself. */
  history: { fileHashes: Set<string>; invoiceNumbers: Set<string> /* `${institutionId}:${number}` */ };
  proposal?: { amountMinor: number }; // set when called via proposePayment
}

export interface GateResult {
  verdict: Verdict;
  results: RuleResult[];
  firstBlocking?: RuleId;
}

export type RuleOutcome = Omit<RuleResult, "ruleId" | "title">;

export interface Rule {
  id: RuleId;
  title: string;
  check(ctx: GateContext): RuleOutcome;
}
