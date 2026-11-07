// The policy gate (docs/05-POLICY-GATE.md). PURE: no DB, no network, no clock. Only this decides money (money rule 1).
import { RULES } from "./rules";
import type { GateContext, GateResult, RuleResult } from "./types";

/** Runs every rule, in order, even after a failure: the trace shows the whole checklist. */
export function evaluate(ctx: GateContext): GateResult {
  const results: RuleResult[] = RULES.map((rule) => ({ ruleId: rule.id, title: rule.title, ...rule.check(ctx) }));
  const failed = results.find((r) => r.status === "fail");
  if (failed) return { verdict: "BLOCK", results, firstBlocking: failed.ruleId };
  const warned = results.find((r) => r.status === "warn");
  if (warned && ctx.invoice.approvedBySender !== true) return { verdict: "REQUIRE_APPROVAL", results, firstBlocking: warned.ruleId };
  return { verdict: "ALLOW", results };
}
