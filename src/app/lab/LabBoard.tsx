"use client";
import { Ban, Loader, Play, PlayCircle, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { TraceDrawer } from "@/components/TraceDrawer";
import type { ScenarioInfo, ScenarioResult } from "@/lib/attacks/scenarios";
import { api } from "@/lib/http/client";

type State = { status: "idle" } | { status: "running" } | { status: "done"; result: ScenarioResult } | { status: "error"; message: string };

export function LabBoard({ scenarios }: { scenarios: ScenarioInfo[] }) {
  const [states, setStates] = useState<Record<string, State>>({});
  const [runningAll, setRunningAll] = useState(false);

  async function run(id: string) {
    setStates((s) => ({ ...s, [id]: { status: "running" } }));
    const r = await api<ScenarioResult>(`/api/lab/${id}`);
    setStates((s) => ({ ...s, [id]: r.ok ? { status: "done", result: r.data } : { status: "error", message: r.error.message } }));
  }

  async function runAll() {
    setRunningAll(true);
    for (const s of scenarios) await run(s.id);
    setRunningAll(false);
  }

  const done = scenarios.filter((s) => states[s.id]?.status === "done");
  const blocked = done.filter((s) => {
    const st = states[s.id];
    return st?.status === "done" && st.result.blocked;
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void runAll()} disabled={runningAll} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {runningAll ? <Loader aria-hidden className="size-4 animate-spin" /> : <PlayCircle aria-hidden className="size-4" />}
          Run all
        </button>
        {done.length > 0 && (
          <p aria-live="polite" className="text-sm font-medium">
            {blocked}/{done.length} attacks blocked · no money moved
          </p>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {scenarios.map((s) => {
          const st = states[s.id] ?? { status: "idle" };
          return (
            <article key={s.id} data-testid={`scenario-${s.id}`} className="flex flex-col rounded-xl border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-medium">
                    {s.title}
                    {s.bonus && <span className="ml-2 rounded-full border px-2 py-px text-[11px] text-muted-foreground">bonus</span>}
                  </h2>
                  <p className="text-sm text-muted-foreground">{s.attack}</p>
                </div>
                <button type="button" onClick={() => void run(s.id)} disabled={st.status === "running"} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60">
                  {st.status === "running" ? <Loader aria-hidden className="size-4 animate-spin" /> : <Play aria-hidden className="size-4" />}
                  Run attack
                </button>
              </div>
              <div className="mt-3 flex-1">
                {st.status === "idle" && <p className="text-xs text-muted-foreground">Runs the real pipeline on a lab Earmark with a lab hold. Expected stop: {s.expectedRule.slice(0, 3)}.</p>}
                {st.status === "running" && <p className="text-sm text-muted-foreground">Upload → extractor (no tools) → crosscheck → gate…</p>}
                {st.status === "error" && (
                  <p role="alert" className="text-sm text-red-700">
                    {st.message}
                  </p>
                )}
                {st.status === "done" && (
                  <div className={`rounded-lg border p-3 text-sm ${st.result.blocked ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}>
                    {st.result.blocked && st.result.rule ? (
                      <>
                        <p data-testid="blocked-by" className="flex items-center gap-1.5 font-semibold text-red-900">
                          <Ban aria-hidden className="size-4" /> Blocked by {st.result.rule.ruleId.slice(0, 3)}: {st.result.rule.title}
                        </p>
                        <p className="mt-1 text-red-900">{st.result.rule.reason} No money moved.</p>
                      </>
                    ) : (
                      <p className="flex items-center gap-1.5 font-semibold text-amber-900">
                        <ShieldAlert aria-hidden className="size-4" /> Not blocked
                      </p>
                    )}
                    {st.result.notes.map((n) => (
                      <p key={n} className="mt-1 text-xs text-zinc-700">
                        {n}
                      </p>
                    ))}
                    <div className="mt-2">
                      <TraceDrawer lines={st.result.trace} />
                    </div>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
