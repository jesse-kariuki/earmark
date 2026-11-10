"use client";
// Recomputes every event hash IN THE BROWSER with WebCrypto (docs/08). The server only serves the events;
// it is not trusted to say whether they are intact.
import { Copy, Loader, ShieldAlert, ShieldCheck, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type VerifyResult, verifyChain } from "@/lib/events/chain";
import type { ChainEvent } from "@/lib/events/types";
import { api } from "@/lib/http/client";

export function ChainVerifier({ earmarkId, events, judgeMode }: { earmarkId: string; events: ChainEvent[]; judgeMode: boolean }) {
  const router = useRouter();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [tampering, setTampering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setResult(null);
    void verifyChain(events).then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [events]);

  async function tamper() {
    setTampering(true);
    await api(`/api/admin/tamper/${earmarkId}`, {});
    setTampering(false);
    router.refresh();
  }

  async function copy() {
    await navigator.clipboard.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const broken = result && !result.ok ? result.brokenAt : null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div aria-live="polite" className="min-w-0 flex-1">
          {result === null ? (
            <p className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm">
              <Loader aria-hidden className="size-5 animate-spin" /> Verifying the chain in your browser…
            </p>
          ) : result.ok ? (
            <p data-testid="chain-status" className="inline-flex items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 font-medium text-teal-900">
              <ShieldCheck aria-hidden className="size-5" /> Chain verified: {result.count} events
            </p>
          ) : (
            <p data-testid="chain-status" className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 font-medium text-red-900">
              <ShieldAlert aria-hidden className="size-5" /> Broken at event #{result.brokenAt} ({result.reason.replace("_", " ")})
            </p>
          )}
        </div>
        <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
          <Copy aria-hidden className="size-4" /> {copied ? "Copied" : "Copy link"}
        </button>
        {judgeMode && (
          <button type="button" disabled={tampering} onClick={() => void tamper()} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100 disabled:opacity-60">
            {tampering ? <Loader aria-hidden className="size-4 animate-spin" /> : <Wrench aria-hidden className="size-4" />}
            Simulate tampering (demo)
          </button>
        )}
      </div>

      <ol className="divide-y rounded-xl border font-mono text-xs">
        {events.map((e) => {
          const bad = broken === e.seq;
          return (
            <li key={e.seq} className={bad ? "bg-red-50" : ""}>
              <button type="button" onClick={() => setOpen(open === e.seq ? null : e.seq)} aria-expanded={open === e.seq} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-muted/50">
                <span className="w-8 text-zinc-400">#{e.seq}</span>
                <span className={`min-w-0 flex-1 font-sans text-sm ${bad ? "font-semibold text-red-800" : ""}`}>{e.type}</span>
                <span className="text-zinc-500">{e.actor}</span>
                <span className="text-zinc-400">{new Date(e.createdAt).toLocaleString()}</span>
                <span className={bad ? "text-red-700" : "text-zinc-600"}>{e.hash.slice(0, 8)}…</span>
              </button>
              {bad && result && !result.ok && (
                <p className="px-3 pb-2 text-red-800">
                  expected {result.expected.slice(0, 16)}… got {result.actual.slice(0, 16)}…
                </p>
              )}
              {open === e.seq && <pre className="overflow-x-auto whitespace-pre-wrap break-all bg-zinc-50 px-3 py-2 text-[11px] text-zinc-700">{JSON.stringify(e.payload, null, 2)}</pre>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
