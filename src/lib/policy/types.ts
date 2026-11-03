// Policy result types (docs/05-POLICY-GATE.md §1). Rule ids are frozen: UI, trace, Attack Lab and evals key off them.
// Added in M1 so invoices.reasons is typed; M3 adds GateContext/GateResult and the rules.

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
