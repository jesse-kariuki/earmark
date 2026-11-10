"use client";
import { Check, Loader, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/http/client";

/** Approve / Reject for a REQUIRE_APPROVAL invoice. Approval re-runs the gate; it never pays by itself. */
export function ReviewActions({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
    setBusy(action);
    setError(null);
    const r = await api(`/api/invoices/${invoiceId}/${action}`);
    setBusy(null);
    if (!r.ok) setError(r.error.message);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void act("approve")}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy === "approve" ? <Loader aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
          Approve payment
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void act("reject")}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          {busy === "reject" ? <Loader aria-hidden className="size-4 animate-spin" /> : <X aria-hidden className="size-4" />}
          Reject
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
