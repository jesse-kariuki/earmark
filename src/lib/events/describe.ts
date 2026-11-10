// Event → one plain-language trace line (docs/07 TraceDrawer). Isomorphic: the drawer renders it in the browser.
// Only structured payload fields are used; nothing here interprets invoice text.
import { formatMoney } from "@/lib/money";

export type TraceActor = "Sender" | "School" | "Recipient" | "Extractor" | "Guardian" | "Gate" | "Orchestrator" | "PayPal" | "System";

export interface TraceLine {
  seq: number;
  at: number;
  type: string;
  actor: TraceActor;
  text: string;
  badges: string[];
  tone: "neutral" | "good" | "bad" | "warn";
  /** PayPal call details, when this step is one. */
  paypal?: { method: string; path: string; requestId?: string; status?: number; debugId?: string };
}

type P = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) ? v : null);
const money = (v: unknown, cur: unknown = "USD") => {
  const n = num(v);
  return n === null ? "an unreadable amount" : formatMoney(n, str(cur) || "USD");
};
const rules = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((r) => r.slice(0, 3)).join(", ") : "");

const ACTORS: Record<string, TraceActor> = {
  sender: "Sender",
  school: "School",
  recipient: "Recipient",
  guardian: "Guardian",
  gate: "Gate",
  orchestrator: "Orchestrator",
  paypal: "PayPal",
  system: "System",
};

const PAYPAL_OPS: Record<string, string> = {
  capture: "Captured the exact invoice amount",
  payout: "Sent the payout to the school",
  "payout.get": "Checked the payout status",
};

export function describeEvent(e: { seq: number; type: string; actor: string; payload: unknown; createdAt: number }): TraceLine {
  const p = (e.payload ?? {}) as P;
  const base = { seq: e.seq, at: e.createdAt, type: e.type, actor: ACTORS[e.actor] ?? "System", badges: [] as string[], tone: "neutral" as TraceLine["tone"] };

  switch (e.type) {
    case "earmark.created":
      return { ...base, text: `${str(p.senderName) || "The sender"} wrote the purpose in plain language.` };
    case "contract.compiled":
      return { ...base, text: `The purpose became a contract: up to ${money(p.capMinor, p.currency)}, evidence "${str(p.evidence)}".` };
    case "contract.approved":
      return { ...base, text: "The sender approved the contract. It is frozen by its hash.", tone: "good" };
    case "paypal.order_created":
      return { ...base, text: `PayPal order created to hold ${money(p.amountMinor, p.currency)}.` };
    case "paypal.authorized":
      return { ...base, text: `${money(p.amountMinor, p.currency)} is held at PayPal, not sent.${p.simulated === true ? " (lab hold)" : ""}`, tone: "good" };
    case "invoice.received":
      return { ...base, text: str(p.source) === "signed" ? "The school sent a signed invoice." : "An invoice file was uploaded." };
    case "invoice.extracted":
      if (p.ok === false) return { ...base, actor: "Extractor", text: "The extractor could not read this file.", badges: ["No tools"], tone: "bad" };
      return {
        ...base,
        actor: "Extractor",
        text: `Read the invoice: ${money(p.amountMinor, p.currency)}${p.containsInstructions === true ? ", and found text addressed to an AI (ignored)" : ""}.`,
        badges: ["No tools"],
        tone: p.containsInstructions === true ? "bad" : "neutral",
      };
    case "invoice.signature_checked":
      return { ...base, text: p.valid === true ? "The school's signature is valid." : "The school's signature did not verify.", tone: p.valid === true ? "good" : "bad" };
    case "policy.evaluated": {
      const verdict = str(p.verdict);
      if (verdict === "ALLOW") return { ...base, text: "Every rule passed.", tone: "good" };
      if (verdict === "BLOCK") return { ...base, text: `Blocked by ${str(p.firstBlocking) || rules(p.failed)}. No money moved.`, tone: "bad" };
      return { ...base, text: `Hard rules passed; needs the sender's approval (${rules(p.warned)}).`, tone: "warn" };
    }
    case "approval.requested":
      return { ...base, text: `Asked the sender to approve ${money(p.amountMinor)}.`, tone: "warn" };
    case "approval.granted":
      return { ...base, text: "The sender approved the invoice.", tone: "good" };
    case "approval.rejected":
      return { ...base, text: "The sender rejected the invoice.", tone: "bad" };
    case "ticket.issued":
      return { ...base, text: `Minted a single-use 5-minute ticket for exactly ${money(p.amountMinor, p.currency)} to the registry account.`, tone: "good" };
    case "ticket.redeemed":
      return { ...base, text: "Redeemed the ticket once, after re-running every rule." };
    case "paypal.captured":
      return { ...base, text: `Captured ${money(p.amountMinor, p.currency)} from the hold.`, tone: "good" };
    case "paypal.capture_failed":
      return { ...base, text: `PayPal refused the capture (${str(p.name)}).${p.retryable === true ? " It will be retried with the same Request-Id." : " The money is still held."}`, tone: "bad" };
    case "remainder.released":
      return { ...base, text: `Released the unused ${money(p.amountMinor, p.currency)} back to the sender.`, tone: "good" };
    case "paypal.payout_sent":
      return { ...base, text: `Payout of ${money(p.amountMinor, p.currency)} sent to ${str(p.receiver)}.${p.simulated === true ? " (simulated payout)" : ""}`, badges: p.simulated === true ? ["Simulated"] : [] };
    case "paypal.payout_succeeded":
      return { ...base, text: "PayPal confirmed the school received the payout.", tone: "good" };
    case "paypal.payout_failed":
      return { ...base, text: `The payout did not go through (${str(p.name) || str(p.transactionStatus)}).`, tone: "bad" };
    case "recipient.notified":
      return { ...base, text: "The recipient was told what was paid." };
    case "recipient.confirmed":
      return { ...base, text: "The recipient confirmed they saw the payment.", tone: "good" };
    case "earmark.frozen":
      return { ...base, text: "The sender paused all payments.", tone: "warn" };
    case "earmark.unfrozen":
      return { ...base, text: "The sender resumed payments." };
    case "earmark.voided":
      return { ...base, text: `The hold was released: ${money(p.releasedMinor)}. ${str(p.reason)}` };
    case "earmark.expired":
      return { ...base, text: "The Earmark expired." };
    case "attack.started":
      return { ...base, text: `Attack Lab scenario started: ${str(p.scenario)}.`, tone: "warn" };
    case "trace.step":
      return describeStep(base, p);
    default:
      return { ...base, text: e.type };
  }
}

function describeStep(base: Omit<TraceLine, "text">, p: P): TraceLine {
  const stage = str(p.stage);
  if (stage === "paypal") {
    const op = str(p.op);
    const ok = p.ok === true;
    return {
      ...base,
      actor: "PayPal",
      text: `${PAYPAL_OPS[op] ?? op}${ok ? "" : " (failed)"}.`,
      tone: ok ? "neutral" : "bad",
      paypal: {
        method: str(p.method),
        path: str(p.path),
        ...(str(p.requestId) ? { requestId: str(p.requestId) } : {}),
        ...(num(p.status) !== null ? { status: num(p.status)! } : {}),
        ...(str(p.debugId) ? { debugId: str(p.debugId) } : {}),
      },
    };
  }
  if (stage === "invoice.extract") {
    return { ...base, actor: "Extractor", text: `Quarantined extractor (${str(p.source)}, ${str(p.model)}): ${str(p.outputSummary)}`, badges: ["No tools"] };
  }
  if (stage === "contract.compile") return { ...base, text: `Compiled the contract (${str(p.source)}, ${str(p.model)}).` };
  if (stage === "guardian") {
    const tool = str(p.tool);
    if (tool) {
      const toolkit = tool === "get_order" || tool === "list_transactions";
      return {
        ...base,
        actor: "Guardian",
        text: `${tool}: ${str(p.summary)}`,
        badges: toolkit ? ["PayPal Agent Toolkit", "read-only"] : tool === "proposePayment" ? ["only path to money"] : [],
        tone: p.ok === false ? "bad" : "neutral",
      };
    }
    return { ...base, actor: "Guardian", text: `Guardian finished (${str(p.source)}${str(p.model) ? `, ${str(p.model)}` : ""}): ${str(p.outcome) || str(p.error)}.` };
  }
  if (stage === "webhook") return { ...base, actor: "PayPal", text: `Webhook ${str(p.eventType)} received and verified.` };
  return { ...base, text: stage || "step" };
}
