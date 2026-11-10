import "server-only";
// Ledger rows (docs/07 screen 7): one per Earmark, with counts and the money split, plus the detail panel's data.
import { desc } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { earmarks, type EarmarkStatus, events, institutions, invoices, payments } from "@/lib/db/schema";
import type { RuleResult } from "@/lib/policy/types";
import { moneyBar } from "./summary";

export interface LedgerInvoice {
  id: string;
  number: string | null;
  source: "signed" | "uploaded";
  amountMinor: number | null;
  verdict: string;
  approvedBy: string | null;
  firstFailing: { ruleId: string; title: string; reason: string } | null;
}

export interface LedgerRow {
  id: string;
  beneficiary: string;
  sender: string;
  institution: string;
  period: string;
  status: EarmarkStatus;
  frozen: boolean;
  currency: string;
  capMinor: number;
  heldMinor: number;
  sentMinor: number;
  releasedMinor: number;
  createdAt: number;
  invoices: number;
  blocked: number;
  lastRule: string | null;
  detail: { invoices: LedgerInvoice[]; payments: { id: string; amountMinor: number; status: string; captureId: string | null; payoutBatchId: string | null }[] };
}

export interface LedgerSummary {
  heldMinor: number;
  sentMinor: number;
  releasedMinor: number;
  blockedAttempts: number;
  earmarks: number;
}

export function ledger(db: Db): { rows: LedgerRow[]; summary: LedgerSummary } {
  const names = new Map(db.select({ id: institutions.id, name: institutions.name }).from(institutions).all().map((r) => [r.id, r.name]));
  const allInvoices = db.select().from(invoices).all();
  const allPayments = db.select().from(payments).all();
  // Blocked attempts come from the log: a duplicate is blocked without ever becoming an invoice row.
  const verdicts = db
    .select({ earmarkId: events.earmarkId, payload: events.payload, type: events.type })
    .from(events)
    .all()
    .filter((e) => e.type === "policy.evaluated");

  const rows = db
    .select()
    .from(earmarks)
    .orderBy(desc(earmarks.createdAt))
    .all()
    .map((e): LedgerRow => {
      const inv = allInvoices.filter((i) => i.earmarkId === e.id);
      const evaluated = verdicts.filter((v) => v.earmarkId === e.id).map((v) => v.payload as { verdict?: string; firstBlocking?: string | null });
      const last = evaluated.at(-1);
      const m = moneyBar(e);
      return {
        id: e.id,
        beneficiary: e.contract.purpose.beneficiary,
        sender: e.senderName,
        institution: names.get(e.contract.payee.institutionId ?? "") ?? e.contract.payee.institutionName,
        period: e.contract.purpose.period ?? "",
        status: e.status,
        frozen: e.frozen,
        currency: e.currency,
        capMinor: e.capMinor,
        heldMinor: m.heldMinor,
        sentMinor: m.sentMinor,
        releasedMinor: m.releasedMinor,
        createdAt: e.createdAt.getTime(),
        invoices: inv.length,
        blocked: evaluated.filter((v) => v.verdict === "BLOCK").length,
        lastRule: last ? (last.firstBlocking ?? last.verdict ?? null) : null,
        detail: {
          invoices: inv.map((i) => {
            const f = (i.reasons as RuleResult[]).find((r) => r.status === "fail");
            return {
              id: i.id,
              number: i.invoiceNumber,
              source: i.source,
              amountMinor: i.amountMinor,
              verdict: i.verdict,
              approvedBy: i.approvedBy,
              firstFailing: f ? { ruleId: f.ruleId, title: f.title, reason: f.reason } : null,
            };
          }),
          payments: allPayments
            .filter((p) => p.earmarkId === e.id)
            .map((p) => ({ id: p.id, amountMinor: p.amountMinor, status: p.status, captureId: p.captureId, payoutBatchId: p.payoutBatchId })),
        },
      };
    });

  const summary = rows.reduce<LedgerSummary>(
    (s, r) => ({
      heldMinor: s.heldMinor + r.heldMinor,
      sentMinor: s.sentMinor + r.sentMinor,
      releasedMinor: s.releasedMinor + r.releasedMinor,
      blockedAttempts: s.blockedAttempts + r.blocked,
      earmarks: s.earmarks + 1,
    }),
    { heldMinor: 0, sentMinor: 0, releasedMinor: 0, blockedAttempts: 0, earmarks: 0 },
  );
  return { rows, summary };
}
