import { describe, expect, it } from "vitest";
import { canonicalize } from "@/lib/events/canonical";

describe("canonicalize", () => {
  it("sorts keys recursively with no whitespace", () => {
    expect(canonicalize({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: "x" } })).toBe(
      '{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}',
    );
  });

  it("is independent of key insertion order", () => {
    expect(canonicalize({ amountMinor: 35000, currency: "USD" })).toBe(canonicalize({ currency: "USD", amountMinor: 35000 }));
  });

  it("sorts by UTF-16 code units (uppercase before lowercase)", () => {
    expect(canonicalize({ b: 1, B: 2, a: 3 })).toBe('{"B":2,"a":3,"b":1}');
  });

  it("drops undefined keys, keeps null, maps undefined array slots to null", () => {
    expect(canonicalize({ a: undefined, b: null, c: [undefined, 1] })).toBe('{"b":null,"c":[null,1]}');
  });

  it("escapes strings like JSON.stringify", () => {
    expect(canonicalize({ s: 'He said "hi"\n' })).toBe('{"s":"He said \\"hi\\"\\n"}');
    expect(canonicalize("Brian's ✓")).toBe('"Brian\'s ✓"');
  });

  it("serializes Dates as ISO strings and booleans plainly", () => {
    expect(canonicalize({ at: new Date("2026-11-03T09:00:00.000Z"), ok: true })).toBe(
      '{"at":"2026-11-03T09:00:00.000Z","ok":true}',
    );
  });

  it.each([0.1, 1.5, 2 ** 53])("rejects money key with non-integer or unsafe value %s", (n) => {
    expect(() => canonicalize({ amountMinor: n })).toThrow(/minor units/);
    expect(() => canonicalize({ nested: { capMinor: n } })).toThrow(/capMinor/);
    expect(() => canonicalize({ amountsMinor: [100, n] })).toThrow(/amountsMinor/);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("rejects non-finite %s anywhere", (n) => {
    expect(() => canonicalize({ confidence: n })).toThrow(/non-finite/);
    expect(() => canonicalize(n)).toThrow(/non-finite/);
  });

  it("rejects unsafe integers under any key", () => {
    expect(() => canonicalize({ count: 2 ** 53 })).toThrow(/safe integer/);
  });

  it("allows non-integer numbers on non-money keys, serialized per ECMAScript", () => {
    expect(canonicalize({ confidenceFloor: 0.85, score: 0.1 + 0.2, n: -0 })).toBe(
      '{"confidenceFloor":0.85,"n":0,"score":0.30000000000000004}',
    );
  });

  it.each([() => 1, Symbol("x"), BigInt(1)])("rejects unsupported type %s", (v) => {
    expect(() => canonicalize({ v })).toThrow(/unsupported/);
  });
});
