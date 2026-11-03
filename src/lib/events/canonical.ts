// Canonical JSON (docs/08-PROOF-RECEIPT.md). Isomorphic: NO Node imports — the receipt page runs this in the browser.
// Keys sorted by UTF-16 code units, no whitespace, undefined dropped, null kept, Dates → ISO.
// Numbers: finite only; integers must be safe; money keys (`*Minor`) must be integers (money rule 6).
// Non-integer non-money numbers (e.g. confidenceFloor 0.85) are fine: ECMAScript Number→string is fully
// specified, so Node and every browser produce identical bytes.

const MONEY_KEY = /Minor$/;

export function canonicalize(value: unknown): string {
  return encode(value, null);
}

function encode(value: unknown, key: string | null): string {
  if (value === null) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new Error(`canonicalize: non-finite number at ${key ?? "<root>"}`);
      if (Number.isInteger(value) ? !Number.isSafeInteger(value) : key !== null && MONEY_KEY.test(key)) {
        throw new Error(`canonicalize: ${key} must be a safe integer (money is minor units), got ${value}`);
      }
      return String(value);
    case "object": {
      if (Array.isArray(value)) {
        // Elements inherit the array's key, so `amountsMinor: [1.5]` is rejected too.
        return `[${value.map((v) => (v === undefined ? "null" : encode(v, key))).join(",")}]`;
      }
      const obj = value as Record<string, unknown>;
      // Default sort compares UTF-16 code units, which is what the spec asks for.
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${encode(obj[k], k)}`).join(",")}}`;
    }
    default:
      throw new Error(`canonicalize: unsupported type ${typeof value}`);
  }
}
