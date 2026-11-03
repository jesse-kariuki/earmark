// Money is integers (minor units, cents). Strings like "350.00" exist only at the PayPal boundary.
// M1 extends this module (formatting, KES estimate); M0 needs only the boundary conversions.

const DECIMAL_RE = /^(\d+)(?:\.(\d{1,2}))?$/;

export function assertMinor(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error(`Invalid minor amount: ${amountMinor}`);
  }
}

/** 35000 → "350.00" */
export function minorToDecimalString(amountMinor: number): string {
  assertMinor(amountMinor);
  const major = Math.trunc(amountMinor / 100);
  const minor = amountMinor % 100;
  return `${major}.${minor.toString().padStart(2, "0")}`;
}

/** "350.00" | "350.5" | "350" → 35000 (string parsing only, no float math) */
export function decimalStringToMinor(value: string): number {
  const m = DECIMAL_RE.exec(value.trim());
  if (!m) throw new Error(`Invalid decimal amount: ${value}`);
  const major = Number(m[1]);
  const minor = Number((m[2] ?? "").padEnd(2, "0"));
  const result = major * 100 + minor;
  assertMinor(result);
  return result;
}
