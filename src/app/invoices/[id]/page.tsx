import { eq } from "drizzle-orm";
import { Ban, CircleCheck, Hand } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RuleChecklist } from "@/components/RuleChecklist";
import { invoiceChip, StatusChip } from "@/components/StatusChip";
import { TraceDrawer } from "@/components/TraceDrawer";
import { getDb } from "@/lib/db";
import { earmarks, payments } from "@/lib/db/schema";
import { getEvents } from "@/lib/events/append";
import { describeEvent } from "@/lib/events/describe";
import { findInvoice } from "@/lib/invoice/intake";
import { ExtractedInvoice } from "@/lib/invoice/schema";
import { SignedInvoicePayload } from "@/lib/invoice/signed";
import { formatMoney } from "@/lib/money";
import type { GateResult } from "@/lib/policy/types";
import { AskGuardian } from "./AskGuardian";
import { ReviewActions } from "./ReviewActions";

export const dynamic = "force-dynamic";

const FIELDS: { key: Exclude<keyof ExtractedInvoice, "lineItems" | "containsInstructions">; label: string }[] = [
  { key: "institutionName", label: "Institution" },
  { key: "payoutAccount", label: "Pay to" },
  { key: "invoiceNumber", label: "Invoice no." },
  { key: "studentName", label: "Student" },
  { key: "description", label: "Description" },
  { key: "total", label: "Total" },
  { key: "currency", label: "Currency" },
  { key: "issueDate", label: "Issued" },
  { key: "dueDate", label: "Due" },
];

const BANNER = {
  BLOCK: { icon: Ban, title: "Blocked", text: "A rule failed, so this invoice cannot be paid. No money moved.", className: "border-red-300 bg-red-50 text-red-900" },
  REQUIRE_APPROVAL: {
    icon: Hand,
    title: "Needs your approval",
    text: "Every hard rule passed. Check the invoice, then approve or reject it.",
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
  ALLOW: { icon: CircleCheck, title: "Approved", text: "Every rule passed. The gate checks again at the moment of payment.", className: "border-teal-300 bg-teal-50 text-teal-900" },
} as const;

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const found = findInvoice(db, id);
  if (!found.ok) notFound();
  const inv = found.value;
  const earmark = db.select().from(earmarks).where(eq(earmarks.id, inv.earmarkId)).get()!;
  const payment = db.select().from(payments).where(eq(payments.invoiceId, id)).get();
  const extracted = ExtractedInvoice.safeParse(inv.extracted);
  const signed = inv.source === "signed" ? SignedInvoicePayload.safeParse(inv.extracted) : null;
  const verdict = inv.verdict === "PENDING" ? "REQUIRE_APPROVAL" : inv.verdict;
  const firstBlocking =
    inv.reasons.find((r) => r.status === "fail")?.ruleId ?? (verdict === "REQUIRE_APPROVAL" ? inv.reasons.find((r) => r.status === "warn")?.ruleId : undefined);
  const gate: GateResult = { verdict, results: inv.reasons, ...(firstBlocking ? { firstBlocking } : {}) };
  const rejected = inv.approvedBy === "rejected";
  const banner = BANNER[verdict];
  const isImage = inv.storagePath?.endsWith(".png") || inv.storagePath?.endsWith(".jpg");

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Link href={`/earmarks/${earmark.id}`} className="text-sm text-primary underline-offset-4 hover:underline">
        ← {earmark.contract.purpose.description}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Invoice {inv.invoiceNumber ?? ""}</h1>
        <StatusChip kind={invoiceChip({ ...inv, paid: payment?.status === "paid_out" })} />
        <span className="text-sm text-muted-foreground">{inv.source === "signed" ? "Signed by the school" : "Uploaded · read by an AI with no tools"}</span>
        <span className="ml-auto">
          <TraceDrawer lines={getEvents(db, earmark.id).map(describeEvent)} />
        </span>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <section aria-label="Invoice" className="space-y-4">
          {inv.storagePath ? (
            isImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- served by our own API with an unknown size
              <img src={`/api/invoices/${id}/file`} alt="Uploaded invoice" className="w-full rounded-xl border" />
            ) : (
              <iframe src={`/api/invoices/${id}/file`} title="Uploaded invoice" className="h-[520px] w-full rounded-xl border" />
            )
          ) : signed?.success ? (
            <div className="rounded-xl border">
              <h2 className="border-b px-4 py-2 text-sm font-medium">Signed by {inv.payeeName} · key {signed.data.institutionId}</h2>
              <dl className="divide-y text-sm">
                {(
                  [
                    ["Invoice no.", signed.data.invoiceNumber],
                    ["Student", signed.data.studentName],
                    ["Description", signed.data.description ?? "—"],
                    ["Pay to", signed.data.payoutAccount],
                    ["Issued", signed.data.issuedAt.slice(0, 10)],
                    ["Due", signed.data.dueDate],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[7rem_1fr] gap-3 px-4 py-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="break-words">{v}</dd>
                  </div>
                ))}
                <div className="px-4 py-2">
                  <dt className="text-muted-foreground">Line items</dt>
                  <dd>
                    <ul className="mt-1 space-y-0.5">
                      {signed.data.lineItems.map((li, i) => (
                        <li key={i} className="flex justify-between gap-4">
                          <span>{li.label}</span>
                          <span className="tabular-nums">{formatMoney(li.amountMinor, signed.data.currency)}</span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No file preview for this invoice.</div>
          )}

          {extracted.success && (
            <div className="rounded-xl border">
              <h2 className="border-b px-4 py-2 text-sm font-medium">What the extractor read</h2>
              <dl className="divide-y text-sm">
                {FIELDS.map(({ key, label }) => {
                  const f = extracted.data[key];
                  const pct = Math.round(f.confidence * 100);
                  const confident = f.confidence >= earmark.contract.confidenceFloor;
                  return (
                    <div key={key} className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-3 px-4 py-2">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="min-w-0 break-words">{f.value ?? <span className="text-muted-foreground">not found</span>}</dd>
                      <dd className="flex items-center gap-1.5" title={`Confidence ${pct}%`}>
                        <span className="h-1.5 w-10 overflow-hidden rounded-full bg-zinc-200">
                          <span className={`block h-full ${confident ? "bg-teal-600" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
                      </dd>
                    </div>
                  );
                })}
                <div className="px-4 py-2">
                  <dt className="text-muted-foreground">Line items</dt>
                  <dd>
                    <ul className="mt-1 space-y-0.5">
                      {extracted.data.lineItems.map((li, i) => (
                        <li key={i} className="flex justify-between gap-4">
                          <span>{li.label}</span>
                          <span className="tabular-nums">{li.amount}</span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div className="flex justify-between px-4 py-2">
                  <dt className="text-muted-foreground">Text addressed to an AI</dt>
                  <dd className={extracted.data.containsInstructions ? "font-medium text-red-700" : ""}>
                    {extracted.data.containsInstructions ? "Found and ignored" : "None"}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </section>

        <section aria-label="Policy check" className="space-y-4">
          {rejected ? (
            <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 text-sm">You rejected this invoice. Nothing will be paid against it.</div>
          ) : (
            <div className={`flex gap-3 rounded-xl border p-4 ${banner.className}`} role="status">
              <banner.icon aria-hidden className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-medium">
                  {banner.title}
                  {inv.amountMinor !== null && ` · ${formatMoney(inv.amountMinor, inv.currency ?? earmark.currency)}`}
                </p>
                <p className="text-sm">{banner.text}</p>
              </div>
            </div>
          )}
          {verdict === "REQUIRE_APPROVAL" && inv.approvedBy === null && <ReviewActions invoiceId={inv.id} />}
          {payment && (
            <div className={`rounded-xl border p-4 text-sm ${payment.status === "failed" ? "border-red-300 bg-red-50" : "border-teal-300 bg-teal-50"}`}>
              <p className="font-medium">
                {payment.status === "paid_out" && payment.payoutItemId && `Paid · ${formatMoney(payment.amountMinor, payment.currency)} reached the school`}
                {payment.status === "paid_out" && !payment.payoutItemId && `Payout sent · ${formatMoney(payment.amountMinor, payment.currency)}, waiting for PayPal to confirm`}
                {payment.status === "captured" && `Captured ${formatMoney(payment.amountMinor, payment.currency)} · paying the school`}
                {payment.status === "pending" && "Paying…"}
                {payment.status === "failed" && "The payment did not complete"}
              </p>
              <p className="mt-1 font-mono text-xs text-zinc-600">
                {payment.id}
                {payment.captureId && ` · capture ${payment.captureId}`}
                {payment.payoutBatchId && ` · payout ${payment.payoutBatchId}`}
              </p>
              {payment.error && <p className="mt-1 text-red-800">{payment.error}</p>}
            </div>
          )}
          {verdict === "ALLOW" && !payment && <AskGuardian invoiceId={inv.id} />}
          <RuleChecklist result={gate} />
        </section>
      </div>
    </main>
  );
}
