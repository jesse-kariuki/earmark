// pnpm demo:prime: compile the demo sentence ONCE with the live model and record the output to
// evals/fixtures/recorded/contract.compile/, so `pnpm demo` replays it offline (AI_MODE=fixture).
// Skips the live call when a recording already exists. Needs live AI keys in .env (Anthropic or AI_PROVIDER=google).
import "dotenv/config";
import { existsSync } from "node:fs";
import { liveAiConfig } from "@/lib/ai/provider";
import { FIXTURES_DIR } from "@/lib/ai/runtime";
import { fixturePath } from "@/lib/ai/call";
import { compileContract, sentenceHash } from "@/lib/contract/compile";
import { createDb } from "@/lib/db/client";
import { seed } from "@/lib/db/seed";
import { loadRegistry } from "@/lib/earmarks/service";
import { parseEnv } from "@/lib/env";
import { DEMO_SENTENCE } from "./config";

async function main() {
  const env = parseEnv(process.env);
  const key = sentenceHash(DEMO_SENTENCE);
  const path = fixturePath(FIXTURES_DIR, "contract.compile", key, true);
  if (existsSync(path) || existsSync(fixturePath(FIXTURES_DIR, "contract.compile", key, false))) {
    console.log(`demo:prime: recording already present (${key.slice(0, 12)}…), no live call.`);
    return;
  }
  const live = liveAiConfig(env);
  if (!live.apiKeyPresent || !live.model) throw new Error(`No recording for the demo sentence yet. Set ${live.needs} in .env, then run pnpm demo:prime.`);
  const db = createDb(":memory:");
  seed(db, { now: Date.now(), paypalMode: "mock", schoolEmail: env.SCHOOL_PAYPAL_EMAIL, lookalikeEmail: env.LOOKALIKE_PAYPAL_EMAIL, schoolPublicKey: null });
  const r = await compileContract(DEMO_SENTENCE, {
    registry: loadRegistry(db),
    now: Date.now(),
    ai: { mode: "live", record: true, model: live.model, apiKeyPresent: true, fixturesDir: FIXTURES_DIR, now: Date.now },
  });
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  const k = r.value.contract;
  console.log(`demo:prime: recorded with ${live.provider}/${live.model}: cap ${k.capMinor}, payee ${k.payee.institutionId}, evidence ${k.evidence.required}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
