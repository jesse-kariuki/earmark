// The 17 gate rules (docs/05-POLICY-GATE.md §2). PURE: every input arrives in GateContext.
// Ids are frozen. Results reach the Guardian (money rule 4), so an invoice value is only shown once it has passed
// a strict shape check (shown()). Comparisons fail closed: `amount > NaN` is false, but so is `amount <= NaN`.
import type { IntentContract } from "@/lib/contract/schema";
import { formatMoney } from "@/lib/money";
import type { GateContext, RegistryEntry, Rule, RuleOutcome } from "./types";

type Compared = Pick<RuleOutcome, "expected" | "actual">;

const pass = (reason: string, compared: Compared = {}): RuleOutcome => ({ status: "pass", reason, ...compared });
const fail = (reason: string, compared: Compared = {}): RuleOutcome => ({ status: "fail", reason, ...compared });
const warn = (reason: string, compared: Compared = {}): RuleOutcome => ({ status: "warn", reason, ...compared });
const skip = (reason: string): RuleOutcome => ({ status: "skip", reason });

/** Invoice amounts are untrusted, so one that is not valid money is shown as it is rather than formatted. */
function money(amountMinor: number | null | undefined, currency: string): string {
  if (amountMinor === null || amountMinor === undefined) return "none";
  return Number.isSafeInteger(amountMinor) && amountMinor >= 0 ? formatMoney(amountMinor, currency) : String(amountMinor);
}

const EMAIL_SHAPE = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,185}\.[a-z]{2,}$/i;
const CURRENCY_SHAPE = /^[A-Z]{3}$/;

function shown(value: string | null, shape: RegExp): string {
  if (value === null) return "none";
  return shape.test(value.trim()) ? value.trim() : "an unrecognised value";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The history key for R09. Case and punctuation are ignored: "lss 2027/001" is the same invoice as "LSS-2027-001". */
export function invoiceNumberKey(institutionId: string, invoiceNumber: string): string {
  return `${institutionId}:${invoiceNumber.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}

function contractInstitution(ctx: GateContext): RegistryEntry | undefined {
  const id = ctx.earmark.contract.payee.institutionId;
  return id === null ? undefined : ctx.registry.byId[id];
}

type KeyedCategory = Exclude<IntentContract["purpose"]["category"], "other">;

// `strong` words name the purpose. `weak` words fit it but are generic, so they never pass alone.
// "school" and "term" are deliberately absent: "School uniform, Term 1" is not school fees.
const PURPOSE_KEYWORDS: Record<KeyedCategory, { strong: string[]; weak: string[]; foreign: string[] }> = {
  school_fees: {
    strong: ["tuition", "boarding", "exam", "exams", "examination", "activity", "lunch", "registration", "school fees", "term fees"],
    weak: ["fee", "fees"],
    foreign: ["uniform", "uniforms", "transport", "transportation", "bus", "shop", "stationery", "excursion", "trip", "rent", "rental", "hospital", "clinic", "electricity"],
  },
  medical: {
    strong: ["hospital", "clinic", "medical", "treatment", "surgery", "pharmacy", "consultation", "medication"],
    weak: ["fee", "fees", "bill", "ward"],
    foreign: ["tuition", "school fees", "rent", "electricity"],
  },
  rent: {
    strong: ["rent", "lease", "tenancy"],
    weak: ["deposit", "housing"],
    foreign: ["tuition", "school fees", "hospital", "clinic", "electricity"],
  },
  utilities: {
    strong: ["electricity", "power", "water", "internet", "gas"],
    weak: ["bill", "bills"],
    foreign: ["tuition", "school fees", "rent", "hospital", "clinic"],
  },
};

/** Lowercase, punctuation to spaces, padded so ` word ` only ever matches whole words. */
function normalizeText(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

const matches = (text: string, words: string[]) => words.filter((w) => text.includes(` ${w} `));

function checkPurpose({ earmark, invoice }: GateContext): RuleOutcome {
  const { category, period } = earmark.contract.purpose;
  const expected = period ? `${category}, ${period}` : category;
  const printed = invoice.purposeText ?? "";
  const text = normalizeText(printed);
  if (text.trim() === "") return warn("The invoice does not say what it is for.", { expected, actual: "no description" });
  if (category === "other") return warn("This contract has no fixed category, so please check the purpose yourself.", { expected });
  // Keywords are ASCII, and normalizeText turns a lookalike letter into a space, which would hide a foreign word.
  if (/[^\P{L}a-zA-Z]/u.test(printed)) return warn("The invoice uses letters we cannot check against the contract.", { expected });

  const keywords = PURPOSE_KEYWORDS[category];
  const strong = matches(text, keywords.strong);
  const weak = matches(text, keywords.weak);
  const foreign = matches(text, keywords.foreign);
  const found = [...strong, ...weak, ...foreign].join(", ");

  if (foreign.length > 0 && strong.length === 0) {
    return fail(`The invoice is for ${foreign.join(", ")}, not ${category}.`, { expected, actual: found });
  }
  if (foreign.length > 0) return warn(`The invoice mixes ${category} with ${foreign.join(", ")}.`, { expected, actual: found });
  if (strong.length === 0) return warn(`Nothing on the invoice clearly says ${category}.`, { expected, actual: found || "no matching words" });
  if (period && !text.includes(normalizeText(period))) {
    return warn(`The invoice does not mention ${period}.`, { expected, actual: `${found}; period not found` });
  }
  return pass(`The invoice matches ${expected}.`, { expected, actual: found });
}

function checkConfidence({ earmark, invoice }: GateContext): RuleOutcome {
  const floor = earmark.contract.confidenceFloor;
  const { extracted } = invoice;
  if (!extracted) {
    return invoice.source === "signed" ? skip("Signed invoices are not extracted.") : warn("This upload has no extraction to check.");
  }
  const fields = {
    "institution name": extracted.institutionName,
    "payout account": extracted.payoutAccount,
    total: extracted.total,
    "invoice number": extracted.invoiceNumber,
  };
  const low = Object.entries(fields).filter(([, field]) => !(field.confidence >= floor));
  const expected = `at least ${floor}`;
  if (low.length === 0) return pass("Every key field was read confidently.", { expected });
  const actual = low.map(([name, field]) => `${name} ${field.confidence}`).join(", ");
  return warn(`Please check these hard-to-read fields: ${low.map(([name]) => name).join(", ")}.`, { expected, actual });
}

export const RULES: Rule[] = [
  {
    id: "R01_NOT_FROZEN",
    title: "Earmark not paused",
    check: ({ earmark }) => (earmark.frozen ? fail("The sender paused this Earmark.") : pass("The Earmark is not paused.")),
  },
  {
    id: "R02_NOT_EXPIRED",
    title: "Earmark not expired",
    check: ({ now, earmark }) => {
      const compared = { expected: `before ${new Date(earmark.expiresAt).toISOString()}`, actual: new Date(now).toISOString() };
      return now >= earmark.expiresAt ? fail("The Earmark has expired.", compared) : pass("The Earmark is still valid.", compared);
    },
  },
  {
    id: "R03_FUNDS_HELD",
    title: "Funds are held",
    check: ({ earmark }) => {
      const compared = { expected: "held or partially_paid", actual: earmark.status };
      return earmark.status === "held" || earmark.status === "partially_paid"
        ? pass("The money is held at PayPal.", compared)
        : fail(`No money is available to pay: the Earmark is ${earmark.status}.`, compared);
    },
  },
  {
    id: "R04_PAYEE_IS_CONTRACT_INSTITUTION",
    title: "Payee is the contracted institution",
    check: ({ earmark, invoice }) => {
      const contracted = earmark.contract.payee.institutionId;
      const compared = { expected: contracted ?? "no resolved institution", actual: invoice.institutionId ?? "no registered institution" };
      return contracted !== null && invoice.institutionId === contracted
        ? pass("The invoice is from the contracted institution.", compared)
        : fail("The invoice is not from the institution named in the contract.", compared);
    },
  },
  {
    id: "R05_PAYOUT_ACCOUNT_MATCH",
    title: "Payout account matches registry",
    check: (ctx) => {
      const entry = contractInstitution(ctx);
      const actual = shown(ctx.invoice.payeeAccount, EMAIL_SHAPE);
      if (!entry) return fail("There is no registered payout account to compare with.", { expected: "a registered account", actual });
      const compared = { expected: entry.paypalEmail, actual };
      return ctx.invoice.payeeAccount !== null && normalizeEmail(ctx.invoice.payeeAccount) === normalizeEmail(entry.paypalEmail)
        ? pass("The payout account matches the registry.", compared)
        : fail(`Invoice says ${actual}, registry says ${entry.paypalEmail}.`, compared);
    },
  },
  {
    id: "R06_INSTITUTION_VERIFIED",
    title: "Institution verified in registry",
    check: (ctx) => {
      const entry = contractInstitution(ctx);
      if (!entry) return fail("The institution is not in the registry.");
      return entry.verified ? pass(`${entry.name} is verified.`) : fail(`${entry.name} is not verified.`);
    },
  },
  {
    id: "R07_WITHIN_CAP",
    title: "Amount within remaining cap",
    check: ({ earmark, invoice }) => {
      const remaining = earmark.capMinor - earmark.capturedMinor;
      const amount = invoice.amountMinor;
      const compared = { expected: `at most ${money(remaining, earmark.currency)}`, actual: money(amount, earmark.currency) };
      if (amount === null) return fail("The invoice has no readable amount.", compared);
      // Spec says only `amount > remaining`, but a negative amount would pass that.
      if (!Number.isSafeInteger(amount) || amount <= 0) return fail("The amount must be a positive whole number of cents.", compared);
      if (!Number.isSafeInteger(remaining)) return fail("The remaining cap could not be worked out.", compared);
      return amount <= remaining ? pass("The amount is within the cap.", compared) : fail("The amount is more than what remains of the cap.", compared);
    },
  },
  {
    id: "R08_CURRENCY_MATCH",
    title: "Currency matches",
    check: ({ earmark, invoice }) => {
      const compared = { expected: earmark.currency, actual: shown(invoice.currency, CURRENCY_SHAPE) };
      return invoice.currency === earmark.currency ? pass("The currency matches.", compared) : fail("The invoice currency does not match the Earmark.", compared);
    },
  },
  {
    id: "R09_NOT_DUPLICATE",
    title: "Invoice not seen before",
    check: ({ invoice, history }) => {
      if (history.fileHashes.has(invoice.fileHash)) return fail("This exact file was already submitted.");
      const { institutionId, invoiceNumber } = invoice;
      // A re-saved upload has a new hash, so with no number nothing would stop it paying again.
      if (invoiceNumber === null) return warn("The invoice has no number, so it cannot be checked for duplicates.");
      if (institutionId !== null && history.invoiceNumbers.has(invoiceNumberKey(institutionId, invoiceNumber))) {
        return fail("An invoice with this number was already submitted.");
      }
      return pass("This invoice has not been seen before.");
    },
  },
  { id: "R10_PURPOSE_MATCH", title: "Purpose matches contract", check: checkPurpose },
  {
    id: "R11_EVIDENCE_SATISFIED",
    title: "Required evidence present",
    check: ({ earmark, invoice }) => {
      const required = earmark.contract.evidence.required;
      const compared = { expected: required, actual: invoice.source };
      if (required === "signed_invoice" && invoice.source !== "signed") return fail("The contract requires an invoice signed by the school.", compared);
      // Uploads are always held for a human (docs/05 §2): only the model vouches for what they say.
      if ((required === "invoice_and_approval" || invoice.source !== "signed") && invoice.approvedBySender !== true) {
        return warn("This needs the sender's approval.", compared);
      }
      return pass("The required evidence is present.", compared);
    },
  },
  {
    id: "R12_SIGNATURE_VALID",
    title: "School signature valid",
    check: ({ invoice }) => {
      if (invoice.source === "uploaded") return skip("Uploaded invoices are not signed.");
      return invoice.signatureValid === true ? pass("The school's signature is valid.") : fail("The school's signature could not be verified.");
    },
  },
  {
    id: "R13_NO_EMBEDDED_INSTRUCTIONS",
    title: "No instructions hidden in invoice",
    check: ({ invoice }) =>
      invoice.containsInstructions || invoice.extracted?.containsInstructions
        ? fail("The invoice contains text addressed to an AI. It was treated as data and not followed.")
        : pass("The invoice contains no hidden instructions."),
  },
  {
    id: "R14_ARITHMETIC",
    title: "Line items add up",
    check: ({ earmark, invoice }) => {
      const sum = invoice.lineItemsSumMinor;
      if (sum === null || sum === undefined) return skip("The invoice has no line items.");
      const compared = { expected: money(invoice.amountMinor, earmark.currency), actual: money(sum, earmark.currency) };
      return sum === invoice.amountMinor ? pass("The line items add up to the total.", compared) : fail("The line items do not add up to the total.", compared);
    },
  },
  { id: "R15_EXTRACTION_CONFIDENCE", title: "Extraction confidence ≥ floor", check: checkConfidence },
  {
    id: "R16_APPROVAL_THRESHOLD",
    title: "Below approval threshold",
    check: ({ earmark, invoice }) => {
      if (invoice.amountMinor === null) return skip("The invoice has no readable amount.");
      const threshold = earmark.contract.approvalThresholdMinor;
      const compared = { expected: `below ${money(threshold, earmark.currency)}`, actual: money(invoice.amountMinor, earmark.currency) };
      return invoice.amountMinor < threshold
        ? pass("The amount is below the approval threshold.", compared)
        : warn("Payments this large need the sender's approval.", compared);
    },
  },
  {
    id: "R17_PROPOSAL_MATCHES_INVOICE",
    title: "Proposal equals invoice amount",
    check: ({ earmark, invoice, proposal }) => {
      if (!proposal) return skip("No payment has been proposed yet.");
      const compared = { expected: money(invoice.amountMinor, earmark.currency), actual: money(proposal.amountMinor, earmark.currency) };
      return proposal.amountMinor === invoice.amountMinor
        ? pass("The proposal equals the invoice amount.", compared)
        : fail("The proposal does not equal the invoice amount.", compared);
    },
  },
];
