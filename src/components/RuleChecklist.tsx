import { Check, Minus, TriangleAlert, X } from "lucide-react";
import type { GateResult, RuleStatus } from "@/lib/policy/types";

// Gate results as a checklist (docs/07-UI-SCREENS.md). Icon + word + colour, never colour alone.
const STATUS: Record<RuleStatus, { label: string; icon: typeof Check; className: string }> = {
  pass: { label: "Passed", icon: Check, className: "text-teal-700" },
  fail: { label: "Failed", icon: X, className: "text-red-700" },
  warn: { label: "Needs approval", icon: TriangleAlert, className: "text-amber-700" },
  skip: { label: "Skipped", icon: Minus, className: "text-zinc-500" },
};

export function RuleChecklist({ result }: { result: GateResult }) {
  return (
    <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
      {result.results.map((rule) => {
        const status = STATUS[rule.status];
        const Icon = status.icon;
        const blocking = rule.ruleId === result.firstBlocking;
        const accent = rule.status === "fail" ? "border-l-red-600 bg-red-50" : "border-l-amber-500 bg-amber-50";
        const compare = (rule.status === "fail" || rule.status === "warn") && rule.expected !== undefined;
        return (
          <li
            key={rule.ruleId}
            data-blocking={blocking ? "true" : undefined}
            className={`flex gap-3 border-l-4 px-3 py-2.5 text-sm ${blocking ? accent : "border-l-transparent"}`}
          >
            <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${status.className}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="font-medium text-zinc-900">
                  <span className="mr-1.5 font-mono text-xs text-zinc-500">{rule.ruleId.slice(0, 3)}</span>
                  {rule.title}
                </p>
                <span className={`text-xs font-medium ${status.className}`}>{status.label}</span>
              </div>
              <p className="text-zinc-600">{rule.reason}</p>
              {compare && (
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs text-zinc-500">
                  <dt>Expected</dt>
                  <dd className="break-all font-mono text-zinc-700">{rule.expected}</dd>
                  <dt>Actual</dt>
                  <dd className="break-all font-mono text-zinc-700">{rule.actual ?? "—"}</dd>
                </dl>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
