"use client";
import { Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/http/client";

// Prominent pause switch: while paused, the policy gate refuses every payment (R01_NOT_FROZEN).
export function PauseSwitch({ earmarkId, initial }: { earmarkId: string; initial: boolean }) {
  const [frozen, setFrozen] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function toggle() {
    setBusy(true);
    setError(null);
    const r = await api<{ frozen: boolean }>(`/api/earmarks/${earmarkId}/freeze`, { frozen: !frozen });
    setBusy(false);
    if (!r.ok) {
      setError(r.error.message);
      return;
    }
    setFrozen(r.data.frozen);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={frozen}
        disabled={busy}
        onClick={toggle}
        className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
          frozen ? "border-amber-300 bg-amber-50 text-amber-900" : "hover:bg-muted"
        }`}
      >
        {frozen ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
        {frozen ? "Paused · resume payments" : "Pause payments"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
