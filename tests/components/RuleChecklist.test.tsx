// M3 acceptance: RuleChecklist renders a GateResult fixture.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RuleChecklist } from "@/components/RuleChecklist";
import { evaluate } from "@/lib/policy/gate";
import { RULE_IDS } from "@/lib/policy/types";
import { baseCtx, uploadedCtx } from "../helpers/gate";

function swappedAccount() {
  const ctx = baseCtx();
  ctx.invoice.payeeAccount = "lakeview.fees.office@example.com";
  return evaluate(ctx);
}

const rows = (html: string) => html.split("<li").slice(1);

describe("RuleChecklist", () => {
  it("renders one row per rule with its title", () => {
    const result = swappedAccount();
    const html = renderToStaticMarkup(<RuleChecklist result={result} />);
    expect(rows(html)).toHaveLength(RULE_IDS.length);
    for (const r of result.results) expect(html).toContain(r.title);
  });

  it("shows expected vs actual on the failing rule", () => {
    const html = renderToStaticMarkup(<RuleChecklist result={swappedAccount()} />);
    expect(html).toContain("lakeview.fees.office@example.com");
    expect(html).toContain("sb-lakeview@business.example.com");
  });

  it("highlights only the blocking rule, by word as well as colour", () => {
    const html = renderToStaticMarkup(<RuleChecklist result={swappedAccount()} />);
    const blocking = rows(html).filter((r) => r.includes('data-blocking="true"'));
    expect(blocking).toHaveLength(1);
    expect(blocking[0]).toContain("R05");
    expect(blocking[0]).toContain("Failed");
  });

  it("labels warnings, skips and passes in words", () => {
    const ctx = uploadedCtx();
    const html = renderToStaticMarkup(<RuleChecklist result={evaluate(ctx)} />);
    expect(html).toContain("Needs approval");
    expect(html).toContain("Skipped");
    expect(html).toContain("Passed");
  });
});
