import "server-only";
// Explanations & recipient messages (docs/04-AI-AGENTS.md §5). The model may phrase things; it may not invent facts.
// Guard: every money amount, email and institution name in the output must come from the event log, or the output is
// rejected and the template is used instead. The template is always available, so the guard can never block the demo.
import { z } from "zod";
import { type AiRuntime, callAi } from "@/lib/ai/call";
import { sha256HexSync } from "@/lib/crypto/sha256";
import type { Earmark } from "@/lib/db/schema";
import type { ChainEvent } from "@/lib/events/types";
import { formatMoney } from "@/lib/money";

export const Explanation = z.object({
  traceSummary: z.array(z.string().max(200)).max(8),
  recipientMessage: z.object({ en: z.string().max(300), sw: z.string().max(300) }),
});
export type Explanation = z.infer<typeof Explanation>;

export interface ExplainFacts {
  beneficiary: string;
  institution: string;
  period: string;
  currency: string;
  paidMinor: number | null;
  releasedMinor: number;
  paidAt: number | null;
  /** Every *Minor amount and email in the event payloads: what the guard accepts. */
  allowedAmounts: Set<number>;
  allowedEmails: Set<string>;
}

const MONEY = /(?:US\$|\$|USD\s?|KES\s?|KSh\s?)\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*\.\d{2}\b/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

function collect(value: unknown, amounts: Set<number>, emails: Set<string>, key = ""): void {
  if (typeof value === "number" && key.endsWith("Minor") && Number.isSafeInteger(value)) amounts.add(value);
  else if (typeof value === "string") for (const m of value.match(EMAIL) ?? []) emails.add(m.toLowerCase());
  else if (Array.isArray(value)) for (const v of value) collect(v, amounts, emails);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) collect(v, amounts, emails, k);
}

export function explainFacts(e: Earmark, institution: string, events: readonly ChainEvent[]): ExplainFacts {
  const amounts = new Set<number>();
  const emails = new Set<string>();
  for (const ev of events) collect(ev.payload, amounts, emails);
  const captured = events.find((ev) => ev.type === "paypal.captured");
  const paidMinor = captured ? ((captured.payload as { amountMinor?: number }).amountMinor ?? null) : null;
  return {
    beneficiary: e.contract.purpose.beneficiary,
    institution,
    period: e.contract.purpose.period ?? "school",
    currency: e.currency,
    paidMinor,
    releasedMinor: e.releasedMinor,
    paidAt: captured?.createdAt ?? null,
    allowedAmounts: amounts,
    allowedEmails: emails,
  };
}

/** "$350.00", "USD 1,200", "350.00" → minor units; null if it is not money. */
function moneyToMinor(token: string): number | null {
  const m = /(\d[\d,]*)(?:\.(\d{1,2}))?/.exec(token);
  if (!m) return null;
  const major = Number(m[1]!.replace(/,/g, ""));
  if (!Number.isSafeInteger(major)) return null;
  return major * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

/** Rejects any amount, email or other registered institution that the event log does not support. */
export function guardText(text: string, facts: ExplainFacts, registryNames: readonly string[]): GuardResult {
  for (const token of text.match(MONEY) ?? []) {
    const minor = moneyToMinor(token);
    if (minor === null || !facts.allowedAmounts.has(minor)) return { ok: false, reason: `amount ${token.trim()} is not in the event log` };
  }
  for (const email of text.match(EMAIL) ?? []) {
    if (!facts.allowedEmails.has(email.toLowerCase())) return { ok: false, reason: `email ${email} is not in the event log` };
  }
  // Longest names first, so "Lakeview Secondary Schools Ltd" is caught before its prefix "Lakeview Secondary School".
  let rest = text.toLowerCase();
  for (const name of [...registryNames].sort((a, b) => b.length - a.length)) {
    const n = name.toLowerCase();
    if (!rest.includes(n)) continue;
    if (n !== facts.institution.toLowerCase()) return { ok: false, reason: `institution ${name} is not the payee` };
    rest = rest.split(n).join(" ");
  }
  return { ok: true };
}

export function guardExplanation(x: Explanation, facts: ExplainFacts, registryNames: readonly string[]): GuardResult {
  for (const t of [...x.traceSummary, x.recipientMessage.en, x.recipientMessage.sw]) {
    const r = guardText(t, facts, registryNames);
    if (!r.ok) return r;
  }
  return { ok: true };
}

const dateLabel = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" });

/** Always-available template (EN + the Swahili template from docs/04 §5). */
export function templateExplanation(f: ExplainFacts): Explanation {
  if (f.paidMinor === null) {
    return {
      traceSummary: [`Money is held at PayPal for ${f.beneficiary}'s ${f.period} fees at ${f.institution}.`],
      recipientMessage: {
        en: `Money is held for your ${f.period} fees at ${f.institution}. It is paid only when the school's invoice is verified.`,
        sw: `Pesa imehifadhiwa kwa ada ya ${f.period} kwa ${f.institution}. Italipwa tu ankara ya shule ikithibitishwa.`,
      },
    };
  }
  const amount = formatMoney(f.paidMinor, f.currency);
  const when = f.paidAt === null ? "" : `, ${dateLabel(f.paidAt)}`;
  return {
    traceSummary: [
      `${f.institution}'s invoice passed every rule.`,
      `${amount} was paid to ${f.institution}.`,
      ...(f.releasedMinor > 0 ? [`${formatMoney(f.releasedMinor, f.currency)} was released back to the sender.`] : []),
    ],
    recipientMessage: {
      en: `Your ${f.period} fees were paid to ${f.institution}: ${amount}${when}. Tap to confirm you see this.`,
      sw: `Ada ya ${f.period} ya ${f.beneficiary} imelipwa kwa ${f.institution}: ${amount}. Gusa kuthibitisha.`,
    },
  };
}

export interface ExplainResult extends Explanation {
  source: "template" | "live" | "template-after-guard";
  guardReason?: string;
}

const INSTRUCTIONS = `Write a short, calm explanation of what happened to this payment, from the structured facts only.
traceSummary: up to 4 plain sentences for the sender. recipientMessage: one or two sentences for the student's family,
in English (en) and Swahili (sw). Use only the amounts, names and dates given. Never mention any other amount or account.`;

export async function explain(f: ExplainFacts, registryNames: readonly string[], ai: AiRuntime | null): Promise<ExplainResult> {
  const template = templateExplanation(f);
  if (!ai || ai.mode !== "live") return { ...template, source: "template" };
  const facts = {
    beneficiary: f.beneficiary,
    institution: f.institution,
    period: f.period,
    paid: f.paidMinor === null ? null : formatMoney(f.paidMinor, f.currency),
    released: f.releasedMinor > 0 ? formatMoney(f.releasedMinor, f.currency) : null,
    paidOn: f.paidAt === null ? null : dateLabel(f.paidAt),
  };
  const prompt = JSON.stringify(facts);
  const r = await callAi({ stage: "explain", schema: Explanation, instructions: INSTRUCTIONS, prompt, fixtureKey: sha256HexSync(prompt) }, ai);
  if (!r.ok) return { ...template, source: "template" };
  const guard = guardExplanation(r.value.output, f, registryNames);
  return guard.ok ? { ...r.value.output, source: "live" } : { ...template, source: "template-after-guard", guardReason: guard.reason };
}
