import { Ban, Lock, RotateCcw, Send } from "lucide-react";
import { getDb } from "@/lib/db";
import { ledger } from "@/lib/earmarks/ledger";
import { formatMoney } from "@/lib/money";
import { LedgerGrid } from "./LedgerGrid";

export const dynamic = "force-dynamic";

export default function LedgerPage() {
  const { rows, summary } = ledger(getDb());
  const cards = [
    { label: "Held at PayPal", value: formatMoney(summary.heldMinor, "USD"), icon: Lock, className: "text-teal-800" },
    { label: "Sent to schools", value: formatMoney(summary.sentMinor, "USD"), icon: Send, className: "text-teal-800" },
    { label: "Released to senders", value: formatMoney(summary.releasedMinor, "USD"), icon: RotateCcw, className: "text-zinc-700" },
    { label: "Blocked attempts", value: String(summary.blockedAttempts), icon: Ban, className: "text-red-700" },
  ];
  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Ledger</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every Earmark, what was held, what reached a school, and what was stopped. {summary.earmarks} Earmarks.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <c.icon aria-hidden className={`size-3.5 ${c.className}`} />
              {c.label}
            </p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${c.className}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No Earmarks yet. Create one on Compose.</div>
        ) : (
          <LedgerGrid rows={rows} />
        )}
      </div>
    </main>
  );
}
