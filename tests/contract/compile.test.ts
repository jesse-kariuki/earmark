import { describe, expect, it } from "vitest";
import { buildContract, compileContract, DEFAULT_EXPIRY_MS, sentenceHash } from "@/lib/contract/compile";
import type { RegistryEntry } from "@/lib/contract/registry";
import type { IntentContractDraft } from "@/lib/contract/schema";
import { fixedNow } from "../helpers/clock";

const NOW = fixedNow().now();
const REGISTRY: RegistryEntry[] = [
  { id: "ins_lakeview", name: "Lakeview Secondary School", aliases: ["Lakeview"], verified: true },
  { id: "ins_lookalike", name: "Lakeview Secondary Schools Ltd", aliases: [], verified: false },
  { id: "ins_riverbend", name: "Riverbend Academy", aliases: [], verified: true },
];

function draft(overrides: Partial<IntentContractDraft> = {}): IntentContractDraft {
  return {
    purpose: { category: "school_fees", description: "Term 1 fees for Brian", beneficiary: "Brian", period: "Term 1" },
    payee: { institutionName: "Lakeview Secondary School" },
    capMinor: 40000,
    currency: "USD",
    expiresAt: null,
    evidence: { required: "invoice_any" },
    approvalThresholdMinor: null,
    notes: [],
    ...overrides,
  };
}

describe("buildContract", () => {
  it("resolves the payee in code and applies defaults", () => {
    const { contract, warnings, candidates } = buildContract(draft(), REGISTRY, NOW);
    expect(contract).toMatchObject({
      version: 1,
      payee: { institutionName: "Lakeview Secondary School", institutionId: "ins_lakeview" },
      capMinor: 40000,
      approvalThresholdMinor: 40000,
      confidenceFloor: 0.85,
      allowPartial: true,
      payInstitutionOnly: true,
      expiresAt: new Date(NOW + DEFAULT_EXPIRY_MS).toISOString(),
    });
    expect(warnings).toEqual([]);
    expect(candidates).toEqual([]);
  });

  it("keeps a stated threshold and a stated future expiry", () => {
    const { contract } = buildContract(
      draft({ approvalThresholdMinor: 30000, expiresAt: "2027-01-20T23:59:59.000Z" }),
      REGISTRY,
      NOW,
    );
    expect(contract.approvalThresholdMinor).toBe(30000);
    expect(contract.expiresAt).toBe("2027-01-20T23:59:59.000Z");
  });

  it("replaces a past expiry with the default and warns", () => {
    const { contract, warnings } = buildContract(draft({ expiresAt: "2020-01-01T00:00:00.000Z" }), REGISTRY, NOW);
    expect(contract.expiresAt).toBe(new Date(NOW + DEFAULT_EXPIRY_MS).toISOString());
    expect(warnings.map((w) => w.code)).toEqual(["EXPIRY_IN_PAST"]);
  });

  it("drops a null period instead of storing null", () => {
    const { contract } = buildContract(draft({ purpose: { ...draft().purpose, period: null } }), REGISTRY, NOW);
    expect(contract.purpose).not.toHaveProperty("period");
  });

  it("leaves a lookalike unresolved and offers only verified institutions", () => {
    const { contract, warnings, candidates } = buildContract(
      draft({ payee: { institutionName: "Lakeview Secondary Schools Ltd" } }),
      REGISTRY,
      NOW,
    );
    expect(contract.payee.institutionId).toBeNull();
    expect(warnings.map((w) => w.code)).toEqual(["PAYEE_UNVERIFIED"]);
    expect(candidates.map((c) => c.id)).toEqual(["ins_lakeview", "ins_riverbend"]);
  });

  it("flags an unknown payee", () => {
    const { warnings } = buildContract(draft({ payee: { institutionName: "Greenhill Properties" } }), REGISTRY, NOW);
    expect(warnings.map((w) => w.code)).toEqual(["PAYEE_UNKNOWN"]);
  });
});

describe("sentenceHash", () => {
  it("ignores surrounding and repeated whitespace", () => {
    expect(sentenceHash("  Pay   Brian\n$400 ")).toBe(sentenceHash("Pay Brian $400"));
    expect(sentenceHash("Pay Brian $400")).not.toBe(sentenceHash("Pay Brian $401"));
  });
});

describe("compileContract", () => {
  it("passes the date into the instructions and returns AI errors unchanged", async () => {
    let seen = "";
    const r = await compileContract("Pay Brian $400 at Lakeview", {
      registry: REGISTRY,
      now: NOW,
      ai: {
        mode: "live",
        record: false,
        model: "m",
        apiKeyPresent: true,
        fixturesDir: "unused",
        now: () => NOW,
        generate: async ({ instructions }) => {
          seen = instructions;
          return { nope: true };
        },
      },
    });
    expect(seen).toContain("Today's date is 2026-11-03");
    expect(r).toMatchObject({ ok: false, error: { code: "AI_INVALID_OUTPUT" } });
  });
});
