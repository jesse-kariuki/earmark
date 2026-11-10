import "server-only";
import { join } from "node:path";
import { env } from "@/lib/env";
import type { AiMode, AiRuntime } from "./call";
import { liveAiConfig } from "./provider";

export const AI_MODE_COOKIE = "earmark_ai_mode";
export const FIXTURES_DIR = join(process.cwd(), "evals", "fixtures");

// Live-call budget for the hosted demo (LIVE_AI_DAILY_BUDGET): counted per UTC day, in memory.
const budget = { day: "", used: 0 };
const today = () => new Date().toISOString().slice(0, 10);

export function liveCallsLeft(): number {
  if (budget.day !== today()) Object.assign(budget, { day: today(), used: 0 });
  return Math.max(0, env.LIVE_AI_DAILY_BUDGET - budget.used);
}

/** Every live model call counts, whichever module makes it. */
export function noteLiveCall(): void {
  liveCallsLeft();
  budget.used += 1;
}

/** The header toggle stores a per-browser override in a cookie; the env value is the default. Live falls back to
 * fixture once today's live budget is spent, so the demo keeps working. */
export function resolveAiMode(cookieValue: string | undefined): AiMode {
  const mode = cookieValue === "live" || cookieValue === "fixture" ? cookieValue : env.AI_MODE;
  return mode === "live" && liveCallsLeft() === 0 ? "fixture" : mode;
}

export function aiRuntime(mode: AiMode, extra: Partial<AiRuntime> = {}): AiRuntime {
  const live = liveAiConfig();
  return {
    mode,
    record: env.AI_RECORD,
    model: live.model,
    apiKeyPresent: live.apiKeyPresent,
    needs: live.needs,
    fixturesDir: FIXTURES_DIR,
    now: Date.now,
    onLiveCall: noteLiveCall,
    ...extra,
  };
}
