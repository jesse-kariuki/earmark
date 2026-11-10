// Extracted fields → the facts the gate compares (docs/04-AI-AGENTS.md §2 "Code does"). PURE, no I/O.
// Parsing is strict: anything that is not plainly money stays null (R07 then fails closed) rather than being guessed.
import { type RegistryEntry, resolveInstitution } from "@/lib/contract/registry";
import { decimalStringToMinor } from "@/lib/money";
import type { ExtractedInvoice } from "./schema";

export interface CrosscheckedInvoice {
  invoiceNumber: string | null;
  amountMinor: number | null;
  currency: string | null;
  payeeName: string | null;
  payeeAccount: string | null;
  /** Any registry institution whose name or alias matches exactly, verified or not (the lookalike resolves to itself). */
  institutionId: string | null;
  /** NaN when a line item is not readable money, so R14 fails instead of skipping. Null when there are none. */
  lineItemsSumMinor: number | null;
  purposeText: string | null;
  containsInstructions: boolean;
}

const CURRENCY_ALIASES: Record<string, string> = { $: "USD", US$: "USD", USD: "USD", KES: "KES", KSH: "KES", KSHS: "KES" };

/** "350.00", "$350.00", "USD 1,200.50" → minor units. Anything else → null. Commas must be thousands separators. */
export function parseAmount(printed: string | null): number | null {
  if (printed === null) return null;
  const m = /^(?:[A-Za-z]{3}\$?|US\$|\$|KSh|Kshs)?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?$/.exec(printed.trim());
  if (!m) return null;
  try {
    return decimalStringToMinor(`${m[1]!.replace(/,/g, "")}${m[2] ?? ""}`);
  } catch {
    return null;
  }
}

export function parseCurrency(printed: string | null): string | null {
  if (printed === null) return null;
  const key = printed.trim().toUpperCase();
  return CURRENCY_ALIASES[key] ?? (/^[A-Z]{3}$/.test(key) ? key : null);
}

const clean = (s: string | null) => (s === null || s.trim() === "" ? null : s.trim());

export function crosscheck(x: ExtractedInvoice, registry: readonly RegistryEntry[]): CrosscheckedInvoice {
  const payeeName = clean(x.institutionName.value);
  const resolution = payeeName === null ? { status: "unknown" as const } : resolveInstitution(payeeName, registry);

  let lineItemsSumMinor: number | null = null;
  if (x.lineItems.length > 0) {
    lineItemsSumMinor = 0;
    for (const li of x.lineItems) {
      const amount = parseAmount(li.amount);
      if (amount === null) {
        lineItemsSumMinor = Number.NaN;
        break;
      }
      lineItemsSumMinor += amount;
    }
  }

  const purpose = [x.description.value, ...x.lineItems.map((li) => li.label)].filter((s): s is string => clean(s) !== null);

  return {
    invoiceNumber: clean(x.invoiceNumber.value),
    amountMinor: parseAmount(x.total.value),
    currency: parseCurrency(x.currency.value),
    payeeName,
    payeeAccount: clean(x.payoutAccount.value),
    institutionId: resolution.status === "unknown" ? null : resolution.institution.id,
    lineItemsSumMinor,
    purposeText: purpose.length > 0 ? purpose.join(". ") : null,
    containsInstructions: x.containsInstructions === true,
  };
}
