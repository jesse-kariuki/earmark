// pnpm eval:contracts:live — compile the 10 sentences in evals/contracts.json with the LIVE model and record
// each output to evals/fixtures/recorded/contract.compile/ (fixture mode then replays them). Costs tokens.
// Needs ANTHROPIC_API_KEY and ANTHROPIC_MODEL in .env.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURES_DIR } from "@/lib/ai/runtime";
import { compileContract } from "@/lib/contract/compile";
import { createDb } from "@/lib/db/client";
import { seed } from "@/lib/db/seed";
import { loadRegistry } from "@/lib/earmarks/service";
import { parseEnv } from "@/lib/env";

interface Case {
  id: string;
  sentence: string;
  expected: Record<string, unknown>;
}

async function main() {
  const env = parseEnv(process.env);
  if (!env.ANTHROPIC_API_KEY || !env.ANTHROPIC_MODEL) throw new Error("Set ANTHROPIC_API_KEY and ANTHROPIC_MODEL in .env");

  const db = createDb(":memory:");
  seed(db, { now: Date.now(), paypalMode: "mock", schoolEmail: env.SCHOOL_PAYPAL_EMAIL, lookalikeEmail: env.LOOKALIKE_PAYPAL_EMAIL, schoolPublicKey: null });
  const registry = loadRegistry(db);
  const cases = JSON.parse(readFileSync(join(process.cwd(), "evals", "contracts.json"), "utf8")) as Case[];

  let pass = 0;
  for (const c of cases) {
    const now = Date.now();
    const r = await compileContract(c.sentence, {
      registry,
      now,
      ai: { mode: "live", record: true, model: env.ANTHROPIC_MODEL, apiKeyPresent: true, fixturesDir: FIXTURES_DIR, now: Date.now },
    });
    if (!r.ok) {
      console.log(`✗ ${c.id}  ${r.error.code}: ${r.error.message}`);
      continue;
    }
    const k = r.value.contract;
    const got: Record<string, unknown> = {
      capMinor: k.capMinor,
      category: k.purpose.category,
      evidence: k.evidence.required,
      institutionName: k.payee.institutionName,
      approvalThresholdMinor: k.approvalThresholdMinor,
      institutionId: k.payee.institutionId,
      warnings: r.value.warnings.map((w) => w.code),
      ...(c.expected.expiresAt ? { expiresAt: k.expiresAt } : {}),
    };
    const diffs = Object.keys(c.expected).filter((key) => JSON.stringify(got[key]) !== JSON.stringify(c.expected[key]));
    if (diffs.length === 0) pass++;
    console.log(
      `${diffs.length === 0 ? "✓" : "✗"} ${c.id}  ${r.value.meta.latencyMs}ms` +
        diffs.map((d) => `\n    ${d}: expected ${JSON.stringify(c.expected[d])}, got ${JSON.stringify(got[d])}`).join(""),
    );
  }
  console.log(`\nContracts (live, ${env.ANTHROPIC_MODEL}): ${pass}/${cases.length}. Outputs recorded to evals/fixtures/recorded/.`);
  if (pass < cases.length) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
