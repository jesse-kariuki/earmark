"use client";
import { Loader, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/http/client";

/** Judge mode: put the demo back to its seeded state (also undoes the receipt tamper demo). */
export function ResetButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function reset() {
    if (!window.confirm("Reset the demo to its starting data? Everything created since will be removed.")) return;
    setBusy(true);
    await api("/api/admin/reset");
    setBusy(false);
    router.push("/");
    router.refresh();
  }

  return (
    <button type="button" onClick={() => void reset()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60">
      {busy ? <Loader aria-hidden className="size-3.5 animate-spin" /> : <RotateCcw aria-hidden className="size-3.5" />}
      Reset
    </button>
  );
}
