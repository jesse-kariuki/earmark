// M2 acceptance: the 10 contract sentences in evals/contracts.json compile to the expected key fields.
// Fixture mode uses recorded live outputs when present (evals/fixtures/recorded/), else the hand-authored drafts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES_DIR } from "@/lib/ai/runtime";
import { compileContract } from "@/lib/contract/compile";
import type { RegistryEntry } from "@/lib/contract/registry";
import { institutions } from "@/lib/db/schema";
import { fixedNow } from "../tests/helpers/clock";
import { makeTestDb } from "../tests/helpers/db";

interface Case {
  id: string;
  sentence: string;
  expected: {
    capMinor: number;
    category: string;
    evidence: string;
    institutionName: string;
    approvalThresholdMinor: number;
    institutionId: string | null;
    warnings: string[];
    expiresAt?: string;
  };
}

const CASES = JSON.parse(readFileSync(join(process.cwd(), "evals", "contracts.json"), "utf8")) as Case[];
const { db } = makeTestDb();
const REGISTRY: RegistryEntry[] = db.select().from(institutions).all();
const NOW = fixedNow().now();

describe("contract eval (fixture)", () => {
  it("has 10 cases", () => expect(CASES).toHaveLength(10));

  it.each(CASES.map((c) => [c.id, c] as const))("%s compiles to the expected fields", async (_id, c) => {
    const r = await compileContract(c.sentence, {
      registry: REGISTRY,
      now: NOW,
      ai: { mode: "fixture", record: false, apiKeyPresent: false, fixturesDir: FIXTURES_DIR, now: () => NOW },
    });
    if (!r.ok) throw new Error(`${c.id}: ${r.error.code} ${r.error.message}`);
    const { contract, warnings } = r.value;
    expect({
      capMinor: contract.capMinor,
      category: contract.purpose.category,
      evidence: contract.evidence.required,
      institutionName: contract.payee.institutionName,
      approvalThresholdMinor: contract.approvalThresholdMinor,
      institutionId: contract.payee.institutionId,
      warnings: warnings.map((w) => w.code),
      ...(c.expected.expiresAt ? { expiresAt: contract.expiresAt } : {}),
    }).toEqual(c.expected);
  });
});
