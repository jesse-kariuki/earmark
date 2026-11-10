"use client";
import { Bot, Loader } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/http/client";

interface GuardianReply {
  guardian: { outcome: string; message: string };
  payment: { status?: string; error?: { message: string } } | null;
}

/** Runs the Guardian again (e.g. after a PayPal hiccup). It can only propose; the gate decides. */
export function AskGuardian({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    const r = await api<GuardianReply>(`/api/invoices/${invoiceId}/guardian`);
    setBusy(false);
    if (!r.ok) setMessage(r.error.message);
    else setMessage(r.data.payment?.error?.message ?? r.data.guardian.message);
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <button type="button" disabled={busy} onClick={() => void run()} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60">
        {busy ? <Loader aria-hidden className="size-4 animate-spin" /> : <Bot aria-hidden className="size-4" />}
        Ask the Guardian to pay
      </button>
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
