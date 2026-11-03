import "server-only";
import { join } from "node:path";
import { env } from "@/lib/env";
import type { AiMode, AiRuntime } from "./call";

export const AI_MODE_COOKIE = "earmark_ai_mode";
export const FIXTURES_DIR = join(process.cwd(), "evals", "fixtures");

/** The header toggle stores a per-browser override in a cookie; the env value is the default. */
export function resolveAiMode(cookieValue: string | undefined): AiMode {
  return cookieValue === "live" || cookieValue === "fixture" ? cookieValue : env.AI_MODE;
}

export function aiRuntime(mode: AiMode, extra: Partial<AiRuntime> = {}): AiRuntime {
  return {
    mode,
    record: env.AI_RECORD,
    model: env.ANTHROPIC_MODEL,
    apiKeyPresent: Boolean(env.ANTHROPIC_API_KEY),
    fixturesDir: FIXTURES_DIR,
    now: Date.now,
    ...extra,
  };
}
