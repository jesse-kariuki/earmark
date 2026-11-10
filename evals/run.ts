// pnpm eval        — the 12 invoices + 10 contracts in fixture mode; fails if any invoice case fails.
// pnpm eval:live   — the same with the live model (costs tokens); reports, never fails. AI_RECORD=1 records outputs.
// Both write evals/RESULTS.md.
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AiRuntime } from "@/lib/ai/call";
import { liveAiConfig } from "@/lib/ai/provider";
import { FIXTURES_DIR } from "@/lib/ai/runtime";
import { parseEnv } from "@/lib/env";
import { EVAL_NOW, resultsMarkdown, runContractEvals, runInvoiceEvals } from "./runner";

async function main() {
  const live = process.argv.includes("--live");
  const env = parseEnv({ ...process.env, AI_MODE: live ? "live" : "fixture" });
  const cfg = liveAiConfig(env);
  const ai: AiRuntime = {
    mode: live ? "live" : "fixture",
    record: env.AI_RECORD,
    model: cfg.model,
    apiKeyPresent: cfg.apiKeyPresent,
    needs: cfg.needs,
    fixturesDir: FIXTURES_DIR,
    now: Date.now,
  };
  if (live && !cfg.model) throw new Error(`Set ${cfg.needs} in .env for pnpm eval:live`);

  const invoices = await runInvoiceEvals(ai);
  // Fixture contract outputs were written against the eval clock; live compiles against today.
  const contracts = await runContractEvals(ai, live ? Date.now() : EVAL_NOW);

  for (const r of invoices) {
    console.log(`${r.pass ? "✓" : "✗"} ${r.file.padEnd(28)} ${r.verdict.padEnd(16)} fail[${r.failed.join(",")}] warn[${r.warned.join(",")}] ${r.note}`);
  }
  for (const r of contracts) console.log(`${r.pass ? "✓" : "✗"} contract ${r.id} ${r.diffs.join("; ")}`);

  const model = live ? cfg.model! : "fixtures";
  const md = resultsMarkdown({ mode: live ? "live" : "fixture", model, date: new Date().toISOString().slice(0, 10), invoices, contracts });
  writeFileSync(join(process.cwd(), "evals", live ? "RESULTS.md" : "RESULTS.fixture.md"), md);
  const ip = invoices.filter((r) => r.pass).length;
  const cp = contracts.filter((r) => r.pass).length;
  console.log(`\nInvoices ${ip}/${invoices.length} · Contracts ${cp}/${contracts.length} (${live ? `live, ${model}` : "fixture"})`);
  if (!live && ip < invoices.length) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
