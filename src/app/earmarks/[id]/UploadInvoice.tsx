"use client";
import { FileUp, Loader } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { RuleChecklist } from "@/components/RuleChecklist";
import type { ApiResult } from "@/lib/http/client";
import type { GateResult } from "@/lib/policy/types";

interface UploadResult {
  invoiceId: string;
  stored: boolean;
  verdict: GateResult["verdict"];
  firstBlocking: GateResult["firstBlocking"] | null;
  results: GateResult["results"];
}

// Synthetic invoices from evals/fixtures, so the demo works in fixture mode with no real document.
const SAMPLES = [
  { id: "01", label: "Clean invoice · $350" },
  { id: "05", label: "Swapped payout account" },
  { id: "06", label: "Inflated · $480" },
  { id: "07", label: "Lookalike school" },
  { id: "11", label: "Hidden AI instruction" },
  { id: "12", label: "Totals don't add up" },
];

async function send(earmarkId: string, body: FormData | { sample: string }): Promise<ApiResult<UploadResult>> {
  try {
    const res = await fetch(`/api/earmarks/${earmarkId}/invoices/upload`, {
      method: "POST",
      ...(body instanceof FormData ? { body } : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    return (await res.json()) as ApiResult<UploadResult>;
  } catch {
    return { ok: false, error: { code: "NETWORK", message: "Could not reach the server. Check your connection and try again." } };
  }
}

export function UploadInvoice({ earmarkId }: { earmarkId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unstored, setUnstored] = useState<UploadResult | null>(null);

  async function run(label: string, body: FormData | { sample: string }) {
    setBusy(label);
    setError(null);
    setUnstored(null);
    const r = await send(earmarkId, body);
    setBusy(null);
    if (!r.ok) {
      setError(r.error.message);
      return;
    }
    if (r.data.stored) router.push(`/invoices/${r.data.invoiceId}`);
    else {
      setUnstored(r.data);
      router.refresh();
    }
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    void run("file", form);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Upload an invoice</h3>
          <p className="text-sm text-muted-foreground">PDF or photo. An AI with no tools reads it; the rules decide.</p>
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => input.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy === "file" ? <Loader aria-hidden className="size-4 animate-spin" /> : <FileUp aria-hidden className="size-4" />}
          Choose file
        </button>
        <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>

      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Or try a sample invoice</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {SAMPLES.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={busy !== null}
            onClick={() => void run(s.id, { sample: s.id })}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs hover:bg-muted disabled:opacity-60"
          >
            {busy === s.id && <Loader aria-hidden className="size-3 animate-spin" />}
            {s.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {unstored && (
        <div className="mt-4 space-y-2" role="status">
          <p className="text-sm font-medium text-red-800">This invoice was already submitted, so it was blocked and not saved again. No money moved.</p>
          <RuleChecklist result={{ verdict: unstored.verdict, results: unstored.results, ...(unstored.firstBlocking ? { firstBlocking: unstored.firstBlocking } : {}) }} />
        </div>
      )}
    </div>
  );
}
