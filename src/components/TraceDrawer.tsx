"use client";
// Right-side trace drawer (docs/07): every step of one Earmark in plain language, with who did it.
// PayPal calls show method + path + Request-Id + debug id; the extractor step shows "No tools".
import { Ban, Bot, Building2, CircleCheck, Cog, Landmark, ListTree, ScanText, Shield, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { TraceActor, TraceLine } from "@/lib/events/describe";

const ACTOR_ICON: Record<TraceActor, typeof User> = {
  Sender: User,
  School: Building2,
  Recipient: User,
  Extractor: ScanText,
  Guardian: Bot,
  Gate: Shield,
  Orchestrator: Cog,
  PayPal: Landmark,
  System: Cog,
};

const TONE: Record<TraceLine["tone"], string> = {
  neutral: "text-zinc-700",
  good: "text-teal-800",
  bad: "text-red-800",
  warn: "text-amber-900",
};

export function TraceDrawer({ lines, label = "Open trace", initialOpen = false }: { lines: TraceLine[]; label?: string; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
        <ListTree aria-hidden className="size-4" />
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Trace">
          <button type="button" aria-label="Close trace" className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-xl">
            <header className="flex items-center justify-between border-b px-5 py-3">
              <div>
                <h2 className="font-semibold">Trace</h2>
                <p className="text-xs text-muted-foreground">Every step, in order. The model proposes; the gate decides; only the orchestrator moves money.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-muted" aria-label="Close">
                <X aria-hidden className="size-5" />
              </button>
            </header>
            <ol className="flex-1 space-y-0 overflow-y-auto px-5 py-4">
              {lines.length === 0 && <li className="text-sm text-muted-foreground">Nothing has happened yet.</li>}
              {lines.map((l) => {
                const Icon = ACTOR_ICON[l.actor];
                return (
                  <li key={l.seq} className="relative flex gap-3 pb-4 before:absolute before:left-[15px] before:top-8 before:h-[calc(100%-2rem)] before:w-px before:bg-zinc-200 last:before:hidden">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border bg-zinc-50">
                      <Icon aria-hidden className="size-4 text-zinc-600" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{l.actor}</span>
                        {l.badges.map((b) => (
                          <span key={b} className="rounded-full border border-teal-300 bg-teal-50 px-2 py-px text-[11px] font-medium text-teal-800">
                            {b}
                          </span>
                        ))}
                        <span className="ml-auto text-[11px] tabular-nums text-zinc-400">
                          #{l.seq} · {new Date(l.at).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className={`mt-0.5 flex items-start gap-1.5 text-sm ${TONE[l.tone]}`}>
                        {l.tone === "bad" && <Ban aria-hidden className="mt-0.5 size-3.5 shrink-0" />}
                        {l.tone === "good" && <CircleCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />}
                        <span className="break-words">{l.text}</span>
                      </p>
                      {l.paypal && (
                        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 rounded bg-zinc-50 px-2 py-1 font-mono text-[11px] text-zinc-600">
                          <dt>call</dt>
                          <dd className="break-all">
                            {l.paypal.method} {l.paypal.path}
                            {l.paypal.status !== undefined && ` → ${l.paypal.status}`}
                          </dd>
                          {l.paypal.requestId && (
                            <>
                              <dt>PayPal-Request-Id</dt>
                              <dd className="break-all">{l.paypal.requestId}</dd>
                            </>
                          )}
                          {l.paypal.debugId && (
                            <>
                              <dt>debug_id</dt>
                              <dd className="break-all">{l.paypal.debugId}</dd>
                            </>
                          )}
                        </dl>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>
      )}
    </>
  );
}
