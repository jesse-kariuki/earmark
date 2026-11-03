// Rule ids are frozen (docs/05-POLICY-GATE.md §2): UI, trace, Attack Lab and evals key off them.
import { describe, expect, it } from "vitest";
import { RULE_IDS } from "@/lib/policy/types";

describe("RULE_IDS", () => {
  it("lists R01..R17 in order, unique, upper snake case", () => {
    expect(RULE_IDS).toHaveLength(17);
    expect(new Set(RULE_IDS).size).toBe(17);
    RULE_IDS.forEach((id, i) => {
      expect(id).toMatch(new RegExp(`^R${String(i + 1).padStart(2, "0")}_[A-Z_]+$`));
    });
  });

  it("keeps the ids the Attack Lab scenarios depend on", () => {
    expect(RULE_IDS).toEqual(
      expect.arrayContaining([
        "R02_NOT_EXPIRED",
        "R05_PAYOUT_ACCOUNT_MATCH",
        "R07_WITHIN_CAP",
        "R09_NOT_DUPLICATE",
        "R13_NO_EMBEDDED_INSTRUCTIONS",
      ]),
    );
  });
});
