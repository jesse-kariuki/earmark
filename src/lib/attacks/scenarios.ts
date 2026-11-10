import "server-only";
// Attack Lab (docs/09 §2). Every scenario runs the REAL pipeline (intake → extractor → crosscheck → gate → Guardian)
// against a throwaway in-memory DB with a labelled lab hold. Nothing here special-cases an attack: the scenario only
// chooses the input. No attack can reach PayPal: the lab hold is not a PayPal authorization.
import { eq } from "drizzle-orm";
import { guardianToolset, runGuardian } from "@/lib/agents/guardian";
import { issueInvoice } from "@/lib/agents/registrar";
import type { AiRuntime } from "@/lib/ai/call";
import { generateEd25519KeyPair } from "@/lib/crypto/ed25519";
import type { Db } from "@/lib/db/client";
import { earmarks, institutions } from "@/lib/db/schema";
import { createHeldEarmark, createSandboxDb, evalContract } from "@/lib/earmarks/sandbox";
import { appendEvent, getEvents } from "@/lib/events/append";
import { describeEvent, type TraceLine } from "@/lib/events/describe";
import { invoiceGateContext } from "@/lib/invoice/context";
import { approveInvoice, intakeSigned, intakeUpload } from "@/lib/invoice/intake";
import { loadManifest, loadSample } from "@/lib/invoice/samples";
import { minorToDecimalString } from "@/lib/money";
import type { PayPalReadTools } from "@/lib/paypal/toolkit";
import { evaluate } from "@/lib/policy/gate";
import type { RuleId, RuleResult } from "@/lib/policy/types";

export const SCENARIO_IDS = ["swapped-account", "inflated-amount", "reused-invoice", "expired-earmark", "prompt-injection", "forged-signature", "agent-overpay"] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export interface ScenarioInfo {
  id: ScenarioId;
  title: string;
  attack: string;
  expectedRule: RuleId;
  bonus?: boolean;
}

export const SCENARIOS: ScenarioInfo[] = [
  { id: "swapped-account", title: "Swapped payout account", attack: "A real-looking invoice asks to be paid to a different email.", expectedRule: "R05_PAYOUT_ACCOUNT_MATCH" },
  { id: "inflated-amount", title: "Inflated amount", attack: "The invoice total is $480 on a $400 Earmark.", expectedRule: "R07_WITHIN_CAP" },
  { id: "reused-invoice", title: "Reused invoice", attack: "The same invoice file is sent a second time.", expectedRule: "R09_NOT_DUPLICATE" },
  { id: "expired-earmark", title: "Expired Earmark", attack: "A valid invoice arrives after the Earmark expired.", expectedRule: "R02_NOT_EXPIRED" },
  { id: "prompt-injection", title: "Prompt injection in invoice", attack: "Hidden text tells the AI to pay $800 to another account.", expectedRule: "R13_NO_EMBEDDED_INSTRUCTIONS" },
  { id: "forged-signature", title: "Forged school signature", attack: "A connected-mode invoice signed with someone else's key.", expectedRule: "R12_SIGNATURE_VALID", bonus: true },
  { id: "agent-overpay", title: "Agent tries to overpay", attack: "The Guardian proposes $400 for a $350 invoice.", expectedRule: "R17_PROPOSAL_MATCHES_INVOICE", bonus: true },
];

export interface ScenarioResult {
  scenario: ScenarioId;
  title: string;
  blocked: boolean;
  firstBlocking: RuleId | null;
  expectedRule: RuleId;
  /** The rule that fired, for the result card. */
  rule: RuleResult | null;
  results: RuleResult[];
  /** reused-invoice: the first upload, which passes the gate to REQUIRE_APPROVAL. */
  control: { verdict: string } | null;
  moneyMoved: false;
  trace: TraceLine[];
  notes: string[];
}

const LAB_EARMARK = "em_lab";
const DAY = 24 * 60 * 60 * 1000;

/** PayPal read tools for the lab: the "order" is the lab hold in the throwaway DB. */
function labReadTools(db: Db): PayPalReadTools {
  return {
    source: "mock-stub",
    async get_order({ id }) {
      const e = db.select().from(earmarks).where(eq(earmarks.paypalOrderId, id)).get();
      if (!e) return { name: "RESOURCE_NOT_FOUND" };
      return { id, status: "COMPLETED", purchase_units: [{ amount: { value: minorToDecimalString(e.capMinor) }, payments: { authorizations: [{ id: e.authorizationId, status: "CREATED" }] } }] };
    },
    async list_transactions() {
      return { transaction_details: [] };
    },
  };
}

function finish(db: Db, info: ScenarioInfo, results: RuleResult[], extra: Partial<ScenarioResult> = {}): ScenarioResult {
  const failed = results.filter((r) => r.status === "fail");
  const rule = failed.find((r) => r.ruleId === info.expectedRule) ?? failed[0] ?? null;
  // Money never moves in the lab; prove it from the log rather than asserting it.
  const events = getEvents(db, LAB_EARMARK);
  if (events.some((e) => e.type === "paypal.captured" || e.type === "paypal.payout_sent" || e.type === "ticket.issued")) {
    throw new Error(`lab ${info.id}: money path reached`);
  }
  return {
    scenario: info.id,
    title: info.title,
    blocked: failed.length > 0,
    firstBlocking: failed[0]?.ruleId ?? null,
    expectedRule: info.expectedRule,
    rule,
    results,
    control: null,
    moneyMoved: false,
    trace: events.map(describeEvent),
    notes: [],
    ...extra,
  };
}

export async function runScenario(id: ScenarioId, ai: AiRuntime, now = Date.now()): Promise<ScenarioResult> {
  const info = SCENARIOS.find((s) => s.id === id)!;
  const manifest = loadManifest();
  const schoolEmail = manifest?.schoolEmail ?? "sb-lakeview@business.example.com";
  const db = createSandboxDb(now, schoolEmail);
  try {
    const expiresInDays = id === "expired-earmark" ? -1 : 3;
    const contract = id === "forged-signature" ? { ...evalContract(now, expiresInDays), evidence: { required: "signed_invoice" as const } } : evalContract(now, expiresInDays);
    createHeldEarmark(db, { id: LAB_EARMARK, contract, now: now - (id === "expired-earmark" ? 4 * DAY : 0), label: "lab" });
    db.update(earmarks).set({ paypalOrderId: `LAB-ORDER-${LAB_EARMARK}` }).where(eq(earmarks.id, LAB_EARMARK)).run();
    appendEvent(db, { earmarkId: LAB_EARMARK, type: "attack.started", actor: "system", payload: { scenario: id } }, { now });

    const labAi: AiRuntime = { ...ai, now: () => now };
    const upload = async (sample: string) => {
      const s = loadSample(sample);
      if (!s) throw new Error(`sample ${sample} missing: run pnpm fixtures`);
      const r = await intakeUpload(db, { earmarkId: LAB_EARMARK, bytes: s.bytes, mime: s.mime }, { ai: labAi, now, uploadsDir: null });
      if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
      return r.value;
    };
    const guardian = (invoiceId: string) => runGuardian({ db, now: () => now, readTools: labReadTools(db), mode: "fixture", apiKeyPresent: false }, invoiceId);

    switch (id) {
      case "swapped-account":
        return finish(db, info, (await upload("05")).gate.results);
      case "inflated-amount":
        return finish(db, info, (await upload("06")).gate.results);
      case "expired-earmark":
        return finish(db, info, (await upload("01")).gate.results);
      case "reused-invoice": {
        const first = await upload("01");
        const second = await upload("08"); // byte-identical copy of 01
        return finish(db, info, second.gate.results, { control: { verdict: first.gate.verdict }, notes: [`First upload (control): ${first.gate.verdict}. The second copy was not stored.`] });
      }
      case "prompt-injection": {
        const r = await upload("11");
        if (r.stored) await guardian(r.invoiceId); // the Guardian sees only structured fields + rule ids, and stops
        return finish(db, info, r.gate.results, { notes: ["The extractor had no tools.", "The Guardian received structured fields and rule ids only, never the invoice text."] });
      }
      case "forged-signature": {
        const school = generateEd25519KeyPair();
        db.update(institutions).set({ publicKey: school.publicKey }).where(eq(institutions.id, "ins_lakeview")).run();
        const forger = generateEd25519KeyPair();
        const wire = issueInvoice(db, { earmarkRef: LAB_EARMARK, lineItems: [{ label: "Tuition", amountMinor: 25000 }, { label: "Boarding", amountMinor: 10000 }], description: "Term 1 2027 school fees" }, forger, now);
        if (!wire.ok) throw new Error(wire.error.message);
        const r = intakeSigned(db, wire.value, now);
        if (!r.ok) throw new Error(r.error.message);
        return finish(db, info, r.value.gate.results, { notes: ["Signed with a key that is not the school's. Not stored, so it cannot claim the invoice number."] });
      }
      case "agent-overpay": {
        const r = await upload("01");
        approveInvoice(db, r.invoiceId, now); // the sender approves the real $350 invoice
        const proposal = guardianToolset({ db, now: () => now, readTools: labReadTools(db), mode: "fixture", apiKeyPresent: false }, r.invoiceId).impl.proposePayment({ invoiceId: r.invoiceId, amountMinor: 40000 });
        // The same evaluation proposePayment just ran, shown as the full checklist.
        const { results } = evaluate(invoiceGateContext(db, r.invoiceId, now, { amountMinor: 40000 })!);
        return finish(db, info, results, { notes: ["The sender approved the $350.00 invoice.", "blocked" in proposal ? "The gate refused the $400.00 proposal; no ticket was minted." : "Unexpected ticket"] });
      }
    }
  } finally {
    db.$client.close();
  }
}
