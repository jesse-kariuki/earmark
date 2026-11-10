import { describe, expect, it } from "vitest";
import type { RegistryEntry } from "@/lib/contract/registry";
import { crosscheck, parseAmount, parseCurrency } from "@/lib/invoice/crosscheck";
import { makeExtracted } from "../helpers/gate";

const REGISTRY: RegistryEntry[] = [
  { id: "ins_lakeview", name: "Lakeview Secondary School", aliases: ["Lakeview SS"], verified: true },
  { id: "ins_lookalike", name: "Lakeview Secondary Schools Ltd", aliases: [], verified: false },
];

describe("parseAmount", () => {
  it.each([
    ["350.00", 35000],
    ["350", 35000],
    ["$350.5", 35050],
    ["USD 1,200.00", 120000],
    ["US$ 99.99", 9999],
    [" 12,345,678.90 ", 1234567890],
  ])("%s → %d", (printed, minor) => expect(parseAmount(printed)).toBe(minor));

  it.each(["", "abc", "350.001", "-350.00", "3,50.00", "350,00", "1e5", "350.00 or $800", null])("%s → null", (printed) => {
    expect(parseAmount(printed)).toBeNull();
  });
});

describe("parseCurrency", () => {
  it.each([
    ["USD", "USD"],
    ["usd", "USD"],
    ["$", "USD"],
    ["KSh", "KES"],
    ["EUR", "EUR"],
  ])("%s → %s", (printed, code) => expect(parseCurrency(printed)).toBe(code));
  it.each(["dollars", "€", "", null])("%s → null", (printed) => expect(parseCurrency(printed)).toBeNull());
});

describe("crosscheck", () => {
  it("turns a clean extraction into gate facts", () => {
    expect(crosscheck(makeExtracted(), REGISTRY)).toEqual({
      invoiceNumber: "LSS-2027-001",
      amountMinor: 35000,
      currency: "USD",
      payeeName: "Lakeview Secondary School",
      payeeAccount: "sb-lakeview@business.example.com",
      institutionId: "ins_lakeview",
      lineItemsSumMinor: 35000,
      purposeText: "Term 1 2027 tuition and boarding. Tuition",
      containsInstructions: false,
    });
  });

  it("resolves the lookalike to itself, never to the real school", () => {
    const x = makeExtracted();
    x.institutionName.value = "Lakeview Secondary Schools Ltd";
    expect(crosscheck(x, REGISTRY).institutionId).toBe("ins_lookalike");
  });

  it("leaves an unknown institution unresolved", () => {
    const x = makeExtracted();
    x.institutionName.value = "Lakeview Secondary Skool";
    expect(crosscheck(x, REGISTRY).institutionId).toBeNull();
    x.institutionName.value = null;
    expect(crosscheck(x, REGISTRY).institutionId).toBeNull();
  });

  it("sums line items, and an unreadable one makes the sum NaN so R14 fails", () => {
    const x = makeExtracted();
    x.lineItems = [
      { label: "Tuition", amount: "200.00" },
      { label: "Boarding", amount: "100.00" },
    ];
    expect(crosscheck(x, REGISTRY).lineItemsSumMinor).toBe(30000);
    x.lineItems.push({ label: "Other", amount: "see note" });
    expect(crosscheck(x, REGISTRY).lineItemsSumMinor).toBeNaN();
    x.lineItems = [];
    expect(crosscheck(x, REGISTRY).lineItemsSumMinor).toBeNull();
  });

  it("treats blank values as missing and carries the instruction flag", () => {
    const x = makeExtracted();
    x.invoiceNumber.value = "   ";
    x.description.value = null;
    x.lineItems = [];
    x.containsInstructions = true;
    const r = crosscheck(x, REGISTRY);
    expect(r.invoiceNumber).toBeNull();
    expect(r.purposeText).toBeNull();
    expect(r.containsInstructions).toBe(true);
  });
});
