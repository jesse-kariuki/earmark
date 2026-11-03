import { describe, expect, it } from "vitest";
import {
  addMinor,
  decimalStringToMinor,
  formatKesEstimate,
  formatMoney,
  kesEstimate,
  minorToDecimalString,
  subMinor,
  toMinor,
  toPayPalValue,
} from "@/lib/money";

describe("money boundary conversions", () => {
  it.each([
    [0, "0.00"],
    [1, "0.01"],
    [100, "1.00"],
    [35000, "350.00"],
    [40099, "400.99"],
  ])("%i → %s and back", (minor, str) => {
    expect(minorToDecimalString(minor)).toBe(str);
    expect(decimalStringToMinor(str)).toBe(minor);
  });

  it("parses short decimals without float math", () => {
    expect(decimalStringToMinor("350")).toBe(35000);
    expect(decimalStringToMinor("350.5")).toBe(35050);
    expect(decimalStringToMinor("0.29")).toBe(29); // 0.29 * 100 = 28.999… in floats
  });

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("rejects %s", (bad) => {
    expect(() => minorToDecimalString(bad)).toThrow();
  });

  it.each(["", "1.234", "-1.00", "1e3", "abc", "1,000.00"])("rejects %j", (bad) => {
    expect(() => decimalStringToMinor(bad)).toThrow();
  });
});

describe("doc aliases (02-DATA-MODEL)", () => {
  it("toMinor / toPayPalValue", () => {
    expect(toMinor("350.00")).toBe(35000);
    expect(toMinor("400")).toBe(40000);
    expect(toPayPalValue(35000)).toBe("350.00");
  });

  it("rejects more than 2 decimal places", () => {
    expect(() => toMinor("399.999")).toThrow();
  });

  it("0.1 + 0.2 is exactly 0.30", () => {
    expect(addMinor(toMinor("0.1"), toMinor("0.2"))).toBe(30);
    expect(toPayPalValue(addMinor(toMinor("0.1"), toMinor("0.2")))).toBe("0.30");
  });
});

describe("arithmetic", () => {
  it("adds and subtracts integers", () => {
    expect(addMinor(35000, 5000, 1)).toBe(40001);
    expect(subMinor(40000, 35000)).toBe(5000);
    expect(subMinor(40000, 40000)).toBe(0);
  });

  it("never goes negative or fractional", () => {
    expect(() => subMinor(100, 101)).toThrow();
    expect(() => addMinor(100, 0.5)).toThrow();
    expect(() => addMinor(Number.MAX_SAFE_INTEGER, 1)).toThrow();
  });
});

describe("formatMoney", () => {
  it.each([
    [35000, "USD", "$350.00"],
    [0, "USD", "$0.00"],
    [5, "USD", "$0.05"],
    [123456789, "USD", "$1,234,567.89"],
    [4515000, "KES", "KES 45,150.00"],
    [100, "EUR", "EUR 1.00"],
  ])("%i %s → %s", (minor, currency, out) => {
    expect(formatMoney(minor, currency)).toBe(out);
  });
});

describe("KES display estimate", () => {
  it("multiplies by the display rate and rounds to whole minor units", () => {
    expect(kesEstimate(35000, 129)).toBe(4515000);
    expect(kesEstimate(1, 129.5)).toBe(130);
  });

  it("is labelled as an estimate with no decimals", () => {
    expect(formatKesEstimate(35000, 129)).toBe("≈ KES 45,150 (estimate)");
  });

  it("rejects a bad rate", () => {
    expect(() => kesEstimate(100, 0)).toThrow();
    expect(() => kesEstimate(100, Number.NaN)).toThrow();
  });
});
