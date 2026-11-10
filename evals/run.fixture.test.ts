// M4 acceptance: the 12 eval invoices reach the expected verdict and rules through the real pipeline (fixture mode).
import { describe, expect, it } from "vitest";
import { FIXTURES_DIR } from "@/lib/ai/runtime";
import { EVAL_NOW, runInvoiceEvals } from "./runner";

describe("invoice eval (fixture)", async () => {
  const rows = await runInvoiceEvals({ mode: "fixture", record: false, apiKeyPresent: false, fixturesDir: FIXTURES_DIR, now: () => EVAL_NOW });

  it("has 12 cases", () => expect(rows).toHaveLength(12));

  it.each(rows.map((r) => [r.file, r] as const))("%s", (_file, r) => {
    expect({ verdict: r.verdict, note: r.note, pass: r.pass }).toEqual({ verdict: r.expectedVerdict, note: "", pass: true });
  });

  it("moves no money on any hostile invoice", () => {
    expect(rows.filter((r) => r.kind === "hostile" && r.moneyMoved)).toEqual([]);
  });
});
