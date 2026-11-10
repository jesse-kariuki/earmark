import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SCENARIOS } from "@/lib/attacks/scenarios";
import { LabBoard } from "./LabBoard";

export const dynamic = "force-dynamic";

/** "Invoices: 12/12 · Contracts: 10/10" from the latest eval run (live if recorded, else fixture). */
function evalBadge(): { text: string; mode: string } | null {
  for (const [file, mode] of [
    ["RESULTS.md", "live"],
    ["RESULTS.fixture.md", "fixture"],
  ] as const) {
    const path = join(process.cwd(), "evals", file);
    if (!existsSync(path)) continue;
    const m = /\*\*Invoices: (\d+\/\d+)\*\* · \*\*Contracts: (\d+\/\d+)\*\*/.exec(readFileSync(path, "utf8"));
    if (m) return { text: `Invoices ${m[1]} · Contracts ${m[2]}`, mode };
  }
  return null;
}

export default function LabPage() {
  const badge = evalBadge();
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Attack Lab</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Real attacks through the real pipeline: the same upload, extractor, crosscheck, policy gate and Guardian the app uses. Each run gets a
        fresh lab database and a lab hold, so nothing here can reach PayPal or the ledger.
      </p>
      <div className="mt-6">
        <LabBoard scenarios={SCENARIOS} />
      </div>
      {badge && (
        <p className="mt-8 inline-flex rounded-full border px-3 py-1 text-xs text-muted-foreground">
          Eval set ({badge.mode}): {badge.text}
        </p>
      )}
    </main>
  );
}
