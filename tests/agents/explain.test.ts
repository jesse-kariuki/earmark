import { describe, expect, it } from "vitest";
import { explain, type ExplainFacts, guardExplanation, guardText, templateExplanation } from "@/lib/agents/explain";

const facts: ExplainFacts = {
  beneficiary: "Brian Kamau",
  institution: "Lakeview Secondary School",
  period: "Term 1 2027",
  currency: "USD",
  paidMinor: 35000,
  releasedMinor: 5000,
  paidAt: Date.parse("2026-11-02T09:00:00Z"),
  allowedAmounts: new Set([40000, 35000, 5000]),
  allowedEmails: new Set(["sb-lakeview@business.example.com"]),
};
const REGISTRY = ["Lakeview Secondary School", "Lakeview Secondary Schools Ltd", "Riverbend Academy"];

describe("explanation guard", () => {
  it("rejects an output that mentions $800", () => {
    expect(guardText("Good news: $800 was paid to Lakeview Secondary School.", facts, REGISTRY)).toMatchObject({ ok: false, reason: expect.stringContaining("$800") });
  });

  it("rejects an unknown email and another institution, including the lookalike", () => {
    expect(guardText("Paid to quickfees@mail.example.com", facts, REGISTRY).ok).toBe(false);
    expect(guardText("Paid to Lakeview Secondary Schools Ltd: $350.00", facts, REGISTRY).ok).toBe(false);
    expect(guardText("Paid to Riverbend Academy", facts, REGISTRY).ok).toBe(false);
  });

  it("accepts amounts, emails and the payee from the log; 'Term 1 2027' is not money", () => {
    expect(guardText("Your Term 1 2027 fees: $350.00 paid to Lakeview Secondary School (sb-lakeview@business.example.com). USD 50.00 released.", facts, REGISTRY)).toEqual({ ok: true });
  });

  it("the template always passes its own guard, paid or not", () => {
    expect(guardExplanation(templateExplanation(facts), facts, REGISTRY)).toEqual({ ok: true });
    expect(guardExplanation(templateExplanation({ ...facts, paidMinor: null, paidAt: null }), facts, REGISTRY)).toEqual({ ok: true });
    expect(templateExplanation(facts).recipientMessage.sw).toBe("Ada ya Term 1 2027 ya Brian Kamau imelipwa kwa Lakeview Secondary School: $350.00. Gusa kuthibitisha.");
  });

  it("live output that fails the guard is replaced by the template", async () => {
    const ai = {
      mode: "live" as const,
      record: false,
      model: "m",
      apiKeyPresent: true,
      fixturesDir: "unused",
      now: Date.now,
      generate: async () => ({ traceSummary: ["Paid $800."], recipientMessage: { en: "Paid $800.", sw: "Imelipwa $800." } }),
    };
    const r = await explain(facts, REGISTRY, ai);
    expect(r).toMatchObject({ source: "template-after-guard", guardReason: expect.stringContaining("$800") });
    expect(r.recipientMessage.en).toContain("$350.00");

    const good = await explain(facts, REGISTRY, { ...ai, generate: async () => ({ traceSummary: ["All good."], recipientMessage: { en: "Paid $350.00.", sw: "Imelipwa $350.00." } }) });
    expect(good.source).toBe("live");
    expect((await explain(facts, REGISTRY, null)).source).toBe("template");
  });
});
