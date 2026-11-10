"use client";
import { KeyRound, Loader, Plus, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RuleChecklist } from "@/components/RuleChecklist";
import { api } from "@/lib/http/client";
import { decimalStringToMinor, formatMoney } from "@/lib/money";
import type { GateResult } from "@/lib/policy/types";

interface IssueReply {
  invoiceId: string | null;
  invoiceNumber: string;
  signatureValid: boolean;
  verdict: GateResult["verdict"];
  firstBlocking: GateResult["firstBlocking"] | null;
  results: GateResult["results"];
  guardian: { outcome: string; message: string } | null;
  payment: { status?: string; payoutConfirmed?: boolean; error?: { message: string } } | null;
}

type Line = { label: string; amount: string };

export function IssueForm({ refs, initialRef }: { refs: { id: string; label: string }[]; initialRef: string }) {
  const router = useRouter();
  const [earmarkRef, setRef] = useState(initialRef);
  const [description, setDescription] = useState("Term 1 2027 school fees");
  const [lines, setLines] = useState<Line[]>([
    { label: "Tuition", amount: "250.00" },
    { label: "Boarding", amount: "100.00" },
  ]);
  const [busy, setBusy] = useState<"real" | "tamper" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<IssueReply | null>(null);

  let total: number | null = 0;
  for (const l of lines) {
    try {
      total = total === null ? null : total + decimalStringToMinor(l.amount);
    } catch {
      total = null;
    }
  }

  async function send(tamper: boolean) {
    if (total === null) return setError("Each amount must look like 250.00.");
    setBusy(tamper ? "tamper" : "real");
    setError(null);
    setReply(null);
    const r = await api<IssueReply>("/api/school/issue", {
      earmarkRef,
      description,
      tamper,
      lineItems: lines.map((l) => ({ label: l.label, amountMinor: decimalStringToMinor(l.amount) })),
    });
    setBusy(null);
    if (!r.ok) setError(r.error.message);
    else setReply(r.data);
    router.refresh();
  }

  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-xl border p-5">
        <label className="block text-sm">
          <span className="font-medium">Earmark reference</span>
          <select value={earmarkRef} onChange={(e) => setRef(e.target.value)} className="mt-1 block w-full rounded-lg border px-3 py-2">
            {refs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} className="mt-1 block w-full rounded-lg border px-3 py-2" />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Line items (USD)</legend>
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input aria-label={`Item ${i + 1}`} value={l.label} onChange={(e) => update(i, { label: e.target.value })} className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" />
              <input
                aria-label={`Amount ${i + 1}`}
                value={l.amount}
                inputMode="decimal"
                onChange={(e) => update(i, { amount: e.target.value })}
                className="w-28 rounded-lg border px-3 py-2 text-right text-sm tabular-nums"
              />
              <button type="button" aria-label={`Remove item ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="rounded-lg border px-2 hover:bg-muted disabled:opacity-40">
                <Trash2 aria-hidden className="size-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setLines((ls) => [...ls, { label: "", amount: "0.00" }])} className="inline-flex items-center gap-1 text-sm text-primary">
              <Plus aria-hidden className="size-4" /> Add item
            </button>
            <span className="text-sm tabular-nums">Total {total === null ? "—" : formatMoney(total, "USD")}</span>
          </div>
        </fieldset>
        <p className="flex items-center gap-1.5 text-xs text-teal-800">
          <KeyRound aria-hidden className="size-3.5" /> Signed with key ins_lakeview (Ed25519) by the Registrar agent
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy !== null} onClick={() => void send(false)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {busy === "real" ? <Loader aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}
            Issue signed invoice
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void send(true)} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60">
            {busy === "tamper" && <Loader aria-hidden className="size-4 animate-spin" />}
            Demo: alter it after signing
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      {reply && (
        <div className="space-y-3" role="status">
          <div className={`rounded-xl border p-4 text-sm ${reply.verdict === "BLOCK" ? "border-red-300 bg-red-50 text-red-900" : "border-teal-300 bg-teal-50 text-teal-900"}`}>
            <p className="font-medium">
              {reply.invoiceNumber}:{" "}
              {reply.payment?.status === "paid_out"
                ? reply.payment.payoutConfirmed
                  ? "paid. The money reached the school's PayPal account."
                  : "payout sent, waiting for PayPal to confirm."
                : reply.verdict === "BLOCK"
                  ? `blocked by ${reply.firstBlocking}. No money moved.`
                  : reply.verdict === "REQUIRE_APPROVAL"
                    ? "waiting for the sender's approval."
                    : (reply.payment?.error?.message ?? reply.guardian?.message ?? "received.")}
            </p>
            <p className="mt-1 text-xs">Signature {reply.signatureValid ? "valid ✓" : "did not verify ✗"}</p>
          </div>
          <RuleChecklist result={{ verdict: reply.verdict, results: reply.results, ...(reply.firstBlocking ? { firstBlocking: reply.firstBlocking } : {}) }} />
        </div>
      )}
    </div>
  );
}
