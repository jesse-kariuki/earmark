import { describe, expect, it } from "vitest";
import { normalizeInstitutionName, type RegistryEntry, resolveInstitution } from "@/lib/contract/registry";

const REGISTRY: RegistryEntry[] = [
  { id: "ins_lakeview", name: "Lakeview Secondary School", aliases: ["Lakeview Secondary", "Lakeview"], verified: true },
  { id: "ins_lookalike", name: "Lakeview Secondary Schools Ltd", aliases: [], verified: false },
  { id: "ins_riverbend", name: "Riverbend Academy", aliases: ["Riverbend"], verified: true },
];

describe("resolveInstitution (exact or alias, verified only, no fuzzy)", () => {
  it.each([
    ["Lakeview Secondary School", "ins_lakeview"],
    ["lakeview secondary school", "ins_lakeview"],
    ["  Lakeview   Secondary  School. ", "ins_lakeview"],
    ["The Lakeview Secondary School", "ins_lakeview"],
    ["Lakeview", "ins_lakeview"],
    ["RIVERBEND", "ins_riverbend"],
  ])("%j resolves to %s", (name, id) => {
    expect(resolveInstitution(name, REGISTRY)).toMatchObject({ status: "resolved", institution: { id } });
  });

  it("does NOT resolve the lookalike to the real school; flags it as unverified", () => {
    const r = resolveInstitution("Lakeview Secondary Schools Ltd", REGISTRY);
    expect(r).toMatchObject({ status: "unverified", institution: { id: "ins_lookalike" } });
  });

  it.each([
    "Lakeview Secondary Schools", // one letter off
    "Lakeveiw Secondary School", // typo
    "Lakeview Sec. School",
    "Lakeview Secondary School Nairobi",
    "",
    "   ",
  ])("%j does not resolve", (name) => {
    expect(resolveInstitution(name, REGISTRY)).toEqual({ status: "unknown" });
  });

  it("normalizes only case, whitespace, a leading 'the' and trailing punctuation", () => {
    expect(normalizeInstitutionName("  The  Riverbend   Academy!! ")).toBe("riverbend academy");
    expect(normalizeInstitutionName("Riverbend-Academy")).toBe("riverbend-academy");
  });
});
