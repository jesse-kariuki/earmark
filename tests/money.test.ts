import { describe, expect, it } from "vitest";
import { decimalStringToMinor, minorToDecimalString } from "@/lib/money";

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
