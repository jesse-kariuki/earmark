// Money is integers (minor units, cents). Strings like "350.00" exist only at the PayPal boundary.
// Isomorphic: no env, no Node imports (client components format money too).

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

/** Doc names (02-DATA-MODEL). */
export const toMinor = decimalStringToMinor;
export const toPayPalValue = minorToDecimalString;

export function addMinor(...amounts: number[]): number {
  let total = 0;
  for (const a of amounts) {
    assertMinor(a);
    total += a;
  }
  assertMinor(total);
  return total;
}

/** a − b; throws rather than going negative. */
export function subMinor(a: number, b: number): number {
  assertMinor(a);
  assertMinor(b);
  const result = a - b;
  assertMinor(result);
  return result;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const SYMBOLS: Record<string, string> = { USD: "$" };

/** 35000, "USD" → "$350.00"; other currencies → "KES 45,150.00". */
export function formatMoney(amountMinor: number, currency: string): string {
  const [major = "0", minor = "00"] = minorToDecimalString(amountMinor).split(".");
  const body = `${groupThousands(major)}.${minor}`;
  const symbol = SYMBOLS[currency];
  return symbol ? `${symbol}${body}` : `${currency} ${body}`;
}

/** USD minor → KES minor at a fixed display rate (env KES_DISPLAY_RATE). Display only, never for money decisions. */
export function kesEstimate(usdMinor: number, rate: number): number {
  assertMinor(usdMinor);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Invalid KES display rate: ${rate}`);
  return Math.round(usdMinor * rate);
}

/** "≈ KES 45,150 (estimate)" */
export function formatKesEstimate(usdMinor: number, rate: number): string {
  const kesMajor = Math.round(kesEstimate(usdMinor, rate) / 100);
  return `≈ KES ${groupThousands(String(kesMajor))} (estimate)`;
}
