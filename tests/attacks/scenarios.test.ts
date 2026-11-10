// M9 acceptance: every attack is blocked through the real pipeline and names its rule; no money moves.
import { describe, expect, it } from "vitest";
import { FIXTURES_DIR } from "@/lib/ai/runtime";
import { runScenario, SCENARIOS } from "@/lib/attacks/scenarios";
import { TEST_NOW } from "../helpers/db";

const ai = { mode: "fixture" as const, record: false, apiKeyPresent: false, fixturesDir: FIXTURES_DIR, now: () => TEST_NOW };

describe("Attack Lab", () => {
  it.each(SCENARIOS.map((s) => [s.id, s] as const))("%s is blocked by its rule", async (_id, s) => {
    const r = await runScenario(s.id, ai, TEST_NOW);
    expect(r).toMatchObject({ blocked: true, moneyMoved: false, rule: { ruleId: s.expectedRule, status: "fail" } });
    expect(r.trace.some((l) => l.type === "attack.started")).toBe(true);
  });

  it("reused-invoice shows the first upload as a control that reached REQUIRE_APPROVAL", async () => {
    expect((await runScenario("reused-invoice", ai, TEST_NOW)).control).toEqual({ verdict: "REQUIRE_APPROVAL" });
  });

  it("prompt-injection: the extractor step says no tools, and the Guardian saw no invoice text", async () => {
    const r = await runScenario("prompt-injection", ai, TEST_NOW);
    expect(r.trace.some((l) => l.actor === "Extractor" && l.badges.includes("No tools"))).toBe(true);
    const guardianLines = r.trace.filter((l) => l.actor === "Guardian").map((l) => l.text).join(" ");
    expect(guardianLines).toContain("getInvoiceSummary");
    expect(guardianLines).not.toMatch(/ignore previous|quickfees|\$800/i);
  });

  it("runs repeatedly without tripping over a previous run", async () => {
    const a = await runScenario("swapped-account", ai, TEST_NOW);
    const b = await runScenario("swapped-account", ai, TEST_NOW);
    expect(a.firstBlocking).toBe("R05_PAYOUT_ACCOUNT_MATCH");
    expect(b.firstBlocking).toBe("R05_PAYOUT_ACCOUNT_MATCH");
  });
});
