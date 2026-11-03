import "server-only";
// Seed (docs/02-DATA-MODEL.md): 3 institutions, one fresh `held` Earmark for the live demo, and 8 historical
// Earmarks across 4 beneficiaries. Every chain is written by the real appendEvent(), so it verifies.
// All names are fictional (money rule 9). Historical PayPal ids are labelled SEED and are never acted on.
import { eq } from "drizzle-orm";
import type { IntentContract } from "@/lib/contract/schema";
import { sha256HexSync } from "@/lib/crypto/sha256";
import { appendEvent } from "@/lib/events/append";
import { canonicalize } from "@/lib/events/canonical";
import type { Actor, EventType, JsonObject } from "@/lib/events/types";
import { formatMoney, subMinor } from "@/lib/money";
import type { RuleId } from "@/lib/policy/types";
import type { Db } from "./client";
import { type EarmarkStatus, earmarks, institutions, invoices, payments, tickets } from "./schema";

export interface SeedOptions {
  now: number; // ms epoch; every seeded timestamp is relative to it
  paypalMode: "mock" | "sandbox";
  schoolEmail: string;
  lookalikeEmail: string;
  schoolPublicKey: string | null;
}

export interface SeedSummary {
  institutions: number;
  earmarks: string[];
  demoEarmarkId: string;
}

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export const DEMO_EARMARK_ID = "em_demo";

export function isSeeded(db: Db): boolean {
  return db.select({ id: institutions.id }).from(institutions).limit(1).get() !== undefined;
}

export function seed(db: Db, opts: SeedOptions): SeedSummary {
  return db.transaction(() => {
    const created = new Date(opts.now - 120 * DAY);
    db.insert(institutions)
      .values([
        {
          id: "ins_lakeview",
          name: "Lakeview Secondary School",
          paypalEmail: opts.schoolEmail,
          publicKey: opts.schoolPublicKey,
          verified: true,
          createdAt: created,
        },
        {
          id: "ins_lookalike",
          name: "Lakeview Secondary Schools Ltd",
          paypalEmail: opts.lookalikeEmail,
          publicKey: null,
          verified: false,
          createdAt: created,
        },
        {
          id: "ins_riverbend",
          name: "Riverbend Academy",
          paypalEmail: "sb-riverbend@business.example.com",
          publicKey: null,
          verified: true,
          createdAt: created,
        },
      ])
      .run();

    const s = new Seeder(db, opts);
    const ids = [
      s.demo(),
      s.history(HISTORY[0]!),
      s.history(HISTORY[1]!),
      s.history(HISTORY[2]!),
      s.history(HISTORY[3]!),
      s.history(HISTORY[4]!),
      s.history(HISTORY[5]!),
      s.history(HISTORY[6]!),
      s.history(HISTORY[7]!),
    ];
    return { institutions: 3, earmarks: ids, demoEarmarkId: DEMO_EARMARK_ID };
  });
}

// ---------------------------------------------------------------------------------------------

type Outcome =
  | { kind: "paid"; amountMinor: number; source: "signed" | "uploaded"; confirmed: boolean }
  | { kind: "voided" }
  | { kind: "expired" };

type BlockedAttempt =
  | { kind: "lookalike"; amountMinor: number }
  | { kind: "duplicate"; ofInvoiceId: string; amountMinor: number };

interface HistorySpec {
  id: string;
  sender: string;
  beneficiary: string;
  institutionId: "ins_lakeview" | "ins_riverbend";
  institutionName: string;
  period: string;
  capMinor: number;
  daysAgo: number;
  blocked?: BlockedAttempt;
  outcome: Outcome;
}

const HISTORY: HistorySpec[] = [
  {
    id: "em_hist_01",
    sender: "Grace Kamau",
    beneficiary: "Brian Kamau",
    institutionId: "ins_lakeview",
    institutionName: "Lakeview Secondary School",
    period: "Term 3 2026",
    capMinor: 40000,
    daysAgo: 75,
    outcome: { kind: "paid", amountMinor: 35000, source: "signed", confirmed: true },
  },
  {
    id: "em_hist_02",
    sender: "Grace Kamau",
    beneficiary: "Brian Kamau",
    institutionId: "ins_lakeview",
    institutionName: "Lakeview Secondary School",
    period: "Term 3 2026 (resend)",
    capMinor: 40000,
    daysAgo: 70,
    // Same school invoice sent again → R09 blocks it, the Earmark runs out and is voided at expiry.
    blocked: { kind: "duplicate", ofInvoiceId: "inv_hist_01", amountMinor: 35000 },
    outcome: { kind: "expired" },
  },
  {
    id: "em_hist_03",
    sender: "Daniel Otieno",
    beneficiary: "Achieng Otieno",
    institutionId: "ins_lakeview",
    institutionName: "Lakeview Secondary School",
    period: "Term 2 2026",
    capMinor: 45000,
    daysAgo: 110,
    // A lookalike "Schools Ltd" invoice is blocked first; the real one is paid after approval.
    blocked: { kind: "lookalike", amountMinor: 42000 },
    outcome: { kind: "paid", amountMinor: 38000, source: "uploaded", confirmed: true },
  },
  {
    id: "em_hist_04",
    sender: "Daniel Otieno",
    beneficiary: "Achieng Otieno",
    institutionId: "ins_lakeview",
    institutionName: "Lakeview Secondary School",
    period: "Term 3 2026",
    capMinor: 45000,
    daysAgo: 60,
    outcome: { kind: "paid", amountMinor: 38000, source: "signed", confirmed: false },
  },
  {
    id: "em_hist_05",
    sender: "Amina Mwangi",
    beneficiary: "Wanjiru Mwangi",
    institutionId: "ins_riverbend",
    institutionName: "Riverbend Academy",
    period: "Term 2 2026",
    capMinor: 30000,
    daysAgo: 100,
    outcome: { kind: "paid", amountMinor: 29000, source: "uploaded", confirmed: true },
  },
  {
    id: "em_hist_06",
    sender: "Amina Mwangi",
    beneficiary: "Wanjiru Mwangi",
    institutionId: "ins_riverbend",
    institutionName: "Riverbend Academy",
    period: "Term 3 2026",
    capMinor: 30000,
    daysAgo: 50,
    outcome: { kind: "voided" },
  },
  {
    id: "em_hist_07",
    sender: "Peter Njoroge",
    beneficiary: "Kevin Njoroge",
    institutionId: "ins_riverbend",
    institutionName: "Riverbend Academy",
    period: "Term 2 2026",
    capMinor: 45000,
    daysAgo: 95,
    outcome: { kind: "paid", amountMinor: 41000, source: "uploaded", confirmed: true },
  },
  {
    id: "em_hist_08",
    sender: "Peter Njoroge",
    beneficiary: "Kevin Njoroge",
    institutionId: "ins_riverbend",
    institutionName: "Riverbend Academy",
    period: "Term 3 2026",
    capMinor: 45000,
    daysAgo: 40,
    outcome: { kind: "expired" },
  },
];

class Seeder {
  private t = 0; // ms cursor for the earmark currently being written
  private seq = 0; // counter for SEED PayPal ids

  constructor(
    private readonly db: Db,
    private readonly opts: SeedOptions,
  ) {}

  private emit(earmarkId: string, type: EventType, actor: Actor, payload: JsonObject, stepMs = 2 * MIN): void {
    this.t += stepMs;
    appendEvent(this.db, { earmarkId, type, actor, payload }, { now: this.t });
  }

  private seedId(prefix: string): string {
    return `${prefix}-SEED-${String(++this.seq).padStart(4, "0")}`;
  }

  private contract(spec: {
    beneficiary: string;
    institutionId: string;
    institutionName: string;
    period: string;
    capMinor: number;
    expiresAt: number;
    evidence: IntentContract["evidence"]["required"];
  }): IntentContract {
    return {
      version: 1,
      purpose: {
        category: "school_fees",
        description: `${spec.period} fees for ${spec.beneficiary}`,
        beneficiary: spec.beneficiary,
        period: spec.period,
      },
      payee: { institutionName: spec.institutionName, institutionId: spec.institutionId },
      capMinor: spec.capMinor,
      currency: "USD",
      expiresAt: new Date(spec.expiresAt).toISOString(),
      evidence: { required: spec.evidence },
      approvalThresholdMinor: spec.capMinor,
      confidenceFloor: 0.85,
      allowPartial: true,
      payInstitutionOnly: true,
      notes: [],
    };
  }

  /** earmark.created → … → paypal.authorized. Returns the PayPal ids used. */
  private openEarmark(
    id: string,
    sentence: string,
    sender: string,
    recipient: string,
    contract: IntentContract,
    status: EarmarkStatus,
    authorize: boolean,
  ): { orderId: string | null; authorizationId: string | null; authorizedAt: number | null } {
    const contractHash = sha256HexSync(canonicalize(contract));
    const orderId = authorize ? this.seedId("ORDER") : null;
    const authorizationId = authorize ? this.seedId("AUTH") : null;
    const createdAt = this.t;

    this.db
      .insert(earmarks)
      .values({
        id,
        senderName: sender,
        recipientName: recipient,
        sentence,
        contract,
        contractHash,
        capMinor: contract.capMinor,
        currency: contract.currency,
        status,
        frozen: false,
        paypalOrderId: orderId,
        authorizationId,
        expiresAt: new Date(Date.parse(contract.expiresAt)),
        createdAt: new Date(createdAt),
      })
      .run();

    this.emit(id, "earmark.created", "sender", { senderName: sender, recipientName: recipient, sentence }, 0);
    this.emit(id, "contract.compiled", "system", {
      capMinor: contract.capMinor,
      currency: contract.currency,
      institutionId: contract.payee.institutionId,
      evidence: contract.evidence.required,
      period: contract.purpose.period ?? null,
    });
    this.emit(id, "contract.approved", "sender", { contractHash });
    if (!authorize) return { orderId: null, authorizationId: null, authorizedAt: null };

    this.emit(id, "paypal.order_created", "orchestrator", {
      orderId,
      amountMinor: contract.capMinor,
      currency: contract.currency,
      intent: "AUTHORIZE",
    });
    this.emit(id, "paypal.authorized", "paypal", {
      authorizationId,
      amountMinor: contract.capMinor,
      currency: contract.currency,
    });
    return { orderId, authorizationId, authorizedAt: this.t };
  }

  demo(): string {
    const now = this.opts.now;
    this.t = now - 30 * MIN;
    const authorize = this.opts.paypalMode === "mock";
    const contract = this.contract({
      beneficiary: "Brian Kamau",
      institutionId: "ins_lakeview",
      institutionName: "Lakeview Secondary School",
      period: "Term 1 2027",
      capMinor: 40000,
      expiresAt: now + 3 * DAY,
      evidence: "invoice_any",
    });
    // Sandbox mode cannot fake a real authorization: the demo Earmark waits for the sender to approve in PayPal.
    const ids = this.openEarmark(
      DEMO_EARMARK_ID,
      "Pay Brian's Term 1 fees at Lakeview Secondary School, up to $400, only against a real invoice.",
      "Grace Kamau",
      "Brian Kamau",
      contract,
      authorize ? "held" : "awaiting_authorization",
      authorize,
    );
    if (ids.authorizedAt !== null) {
      this.db
        .update(earmarks)
        .set({ authorizedAt: new Date(ids.authorizedAt) })
        .where(eqId(DEMO_EARMARK_ID))
        .run();
    }
    return DEMO_EARMARK_ID;
  }

  history(h: HistorySpec): string {
    this.t = this.opts.now - h.daysAgo * DAY;
    const expiresAt = this.t + 14 * DAY;
    const legacy = h.outcome.kind === "paid" && h.outcome.source === "uploaded";
    const contract = this.contract({
      beneficiary: h.beneficiary,
      institutionId: h.institutionId,
      institutionName: h.institutionName,
      period: h.period,
      capMinor: h.capMinor,
      expiresAt,
      evidence: legacy ? "invoice_and_approval" : "invoice_any",
    });
    const sentence = `Pay ${h.beneficiary}'s ${h.period} fees at ${h.institutionName}, up to ${formatMoney(h.capMinor, "USD")}.`;
    const finalStatus: EarmarkStatus = h.outcome.kind;
    const ids = this.openEarmark(h.id, sentence, h.sender, h.beneficiary, contract, finalStatus, true);

    this.t += 2 * DAY;
    if (h.blocked) this.blockedAttempt(h);

    let capturedMinor = 0;
    let releasedMinor = 0;
    let recipientConfirmedAt: Date | null = null;

    switch (h.outcome.kind) {
      case "paid": {
        const r = this.paid(h, h.outcome);
        capturedMinor = h.outcome.amountMinor;
        releasedMinor = r.releasedMinor;
        recipientConfirmedAt = r.confirmedAt;
        break;
      }
      case "voided":
        this.t += 3 * DAY;
        this.emit(h.id, "earmark.voided", "sender", {
          authorizationId: ids.authorizationId,
          releasedMinor: h.capMinor,
          reason: "Sender cancelled: fees covered by a bursary",
        });
        releasedMinor = h.capMinor;
        break;
      case "expired":
        this.t = expiresAt;
        this.emit(h.id, "earmark.expired", "system", { expiresAt }, 0);
        this.emit(h.id, "earmark.voided", "orchestrator", {
          authorizationId: ids.authorizationId,
          releasedMinor: h.capMinor,
          reason: "Expired with no valid invoice",
        });
        releasedMinor = h.capMinor;
        break;
    }

    this.db
      .update(earmarks)
      .set({
        authorizedAt: ids.authorizedAt === null ? null : new Date(ids.authorizedAt),
        capturedMinor,
        releasedMinor,
        recipientConfirmedAt,
      })
      .where(eqId(h.id))
      .run();
    return h.id;
  }

  private blockedAttempt(h: HistorySpec): void {
    const b = h.blocked!;
    if (b.kind === "lookalike") {
      const invoiceId = `inv_${h.id.slice(3)}_lookalike`;
      const fileHash = sha256HexSync(`seed:${invoiceId}`);
      const failed: RuleId[] = ["R04_PAYEE_IS_CONTRACT_INSTITUTION", "R05_PAYOUT_ACCOUNT_MATCH", "R06_INSTITUTION_VERIFIED"];
      this.db
        .insert(invoices)
        .values({
          id: invoiceId,
          earmarkId: h.id,
          source: "uploaded",
          fileHash,
          invoiceNumber: "LSS-2026-0417",
          institutionId: "ins_lookalike",
          payeeName: "Lakeview Secondary Schools Ltd",
          payeeAccount: this.opts.lookalikeEmail,
          amountMinor: b.amountMinor,
          currency: "USD",
          verdict: "BLOCK",
          reasons: failed.map((ruleId) => ({ ruleId, status: "fail", title: ruleId, reason: "Seeded blocked attempt" })),
          createdAt: new Date(this.t),
        })
        .run();
      this.emit(h.id, "invoice.received", "recipient", { invoiceId, source: "uploaded", fileHash });
      this.emit(h.id, "invoice.extracted", "system", {
        invoiceId,
        invoiceNumber: "LSS-2026-0417",
        payeeName: "Lakeview Secondary Schools Ltd",
        payeeAccount: this.opts.lookalikeEmail,
        amountMinor: b.amountMinor,
        currency: "USD",
      });
      this.emit(h.id, "policy.evaluated", "gate", { invoiceId, verdict: "BLOCK", firstBlocking: failed[0]!, failed });
    } else {
      // A duplicate never gets an invoices row: the unique file_hash index is part of what blocks it.
      const fileHash = sha256HexSync(`seed:${b.ofInvoiceId}`);
      this.emit(h.id, "invoice.received", "recipient", { invoiceId: null, source: "signed", fileHash });
      this.emit(h.id, "policy.evaluated", "gate", {
        invoiceId: null,
        verdict: "BLOCK",
        firstBlocking: "R09_NOT_DUPLICATE",
        failed: ["R09_NOT_DUPLICATE"],
        duplicateOf: b.ofInvoiceId,
      });
    }
    this.t += 1 * DAY;
  }

  private paid(
    h: HistorySpec,
    o: Extract<Outcome, { kind: "paid" }>,
  ): { releasedMinor: number; confirmedAt: Date | null } {
    const n = h.id.slice(3); // hist_01
    const invoiceId = `inv_${n}`;
    const ticketId = `tk_${n}`;
    const paymentId = `pay_${n}`;
    const fileHash = sha256HexSync(`seed:${invoiceId}`);
    const invoiceNumber = `${h.institutionId === "ins_lakeview" ? "LSS" : "RBA"}-2026-1${n.slice(-2)}`;
    const payeeEmail = h.institutionId === "ins_lakeview" ? this.opts.schoolEmail : "sb-riverbend@business.example.com";

    this.db
      .insert(invoices)
      .values({
        id: invoiceId,
        earmarkId: h.id,
        source: o.source,
        fileHash,
        invoiceNumber,
        institutionId: h.institutionId,
        payeeName: h.institutionName,
        payeeAccount: payeeEmail,
        amountMinor: o.amountMinor,
        currency: "USD",
        verdict: "ALLOW",
        reasons: [],
        approvedBy: o.source === "uploaded" ? "sender" : null,
        createdAt: new Date(this.t),
      })
      .run();

    this.emit(h.id, "invoice.received", o.source === "signed" ? "school" : "recipient", { invoiceId, source: o.source, fileHash });
    if (o.source === "signed") {
      this.emit(h.id, "invoice.signature_checked", "system", { invoiceId, valid: true, institutionId: h.institutionId });
    } else {
      this.emit(h.id, "invoice.extracted", "system", {
        invoiceId,
        invoiceNumber,
        payeeName: h.institutionName,
        payeeAccount: payeeEmail,
        amountMinor: o.amountMinor,
        currency: "USD",
      });
    }
    this.emit(h.id, "policy.evaluated", "gate", {
      invoiceId,
      verdict: o.source === "uploaded" ? "REQUIRE_APPROVAL" : "ALLOW",
      warned: o.source === "uploaded" ? ["R11_EVIDENCE_SATISFIED"] : [],
    });
    if (o.source === "uploaded") {
      this.emit(h.id, "approval.requested", "guardian", { invoiceId, amountMinor: o.amountMinor });
      this.emit(h.id, "approval.granted", "sender", { invoiceId }, 3 * 60 * MIN);
    }

    const ticketAt = this.t + 2 * MIN;
    this.db
      .insert(tickets)
      .values({
        id: ticketId,
        earmarkId: h.id,
        invoiceId,
        amountMinor: o.amountMinor,
        currency: "USD",
        payeeEmail,
        mac: sha256HexSync(`seed-mac:${ticketId}`),
        expiresAt: new Date(ticketAt + 5 * MIN),
        redeemedAt: new Date(ticketAt + 1 * MIN),
        createdAt: new Date(ticketAt),
      })
      .run();
    this.emit(h.id, "ticket.issued", "gate", { ticketId, invoiceId, amountMinor: o.amountMinor, currency: "USD", payeeEmail });
    this.emit(h.id, "ticket.redeemed", "orchestrator", { ticketId, paymentId }, 1 * MIN);

    const captureId = this.seedId("CAPTURE");
    const payoutBatchId = this.seedId("PAYOUTBATCH");
    const payoutItemId = this.seedId("PAYOUTITEM");
    this.db
      .insert(payments)
      .values({
        id: paymentId,
        earmarkId: h.id,
        invoiceId,
        ticketId,
        amountMinor: o.amountMinor,
        currency: "USD",
        captureId,
        payoutBatchId,
        payoutItemId,
        status: "paid_out",
        idempotencyKey: paymentId,
        createdAt: new Date(this.t),
      })
      .run();

    this.emit(h.id, "paypal.captured", "paypal", { paymentId, captureId, amountMinor: o.amountMinor, finalCapture: true }, 1 * MIN);
    this.emit(h.id, "paypal.payout_sent", "orchestrator", { paymentId, payoutBatchId, receiver: payeeEmail, amountMinor: o.amountMinor }, 1 * MIN);
    this.emit(h.id, "paypal.payout_succeeded", "paypal", { paymentId, payoutItemId }, 5 * MIN);
    const releasedMinor = subMinor(h.capMinor, o.amountMinor);
    this.emit(h.id, "remainder.released", "orchestrator", { amountMinor: releasedMinor }, 1 * MIN);
    this.emit(h.id, "recipient.notified", "system", { channel: "sms", language: "en" }, 1 * MIN);
    if (!o.confirmed) return { releasedMinor, confirmedAt: null };
    this.emit(h.id, "recipient.confirmed", "recipient", {}, 6 * 60 * MIN);
    return { releasedMinor, confirmedAt: new Date(this.t) };
  }
}

function eqId(id: string) {
  return eq(earmarks.id, id);
}
