import "server-only";
// Which model provider live AI uses (AI_PROVIDER). Anthropic is the default; Google Gemini is an option with a
// free tier. Both are created through the AI SDK, so the rest of the code never names a provider.
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { type Env, env } from "@/lib/env";

export type AiProvider = Env["AI_PROVIDER"];

export interface LiveAiConfig {
  provider: AiProvider;
  model?: string;
  apiKeyPresent: boolean;
  /** The env vars live AI needs for this provider, for error messages. */
  needs: string;
}

export function liveAiConfig(e: Env = env): LiveAiConfig {
  if (e.AI_PROVIDER === "google") {
    return {
      provider: "google",
      model: e.GOOGLE_MODEL,
      apiKeyPresent: Boolean(e.GOOGLE_GENERATIVE_AI_API_KEY),
      needs: "GOOGLE_GENERATIVE_AI_API_KEY and GOOGLE_MODEL",
    };
  }
  return { provider: "anthropic", model: e.ANTHROPIC_MODEL, apiKeyPresent: Boolean(e.ANTHROPIC_API_KEY), needs: "ANTHROPIC_API_KEY and ANTHROPIC_MODEL" };
}

export function liveAiAvailable(e: Env = env): boolean {
  const c = liveAiConfig(e);
  return c.apiKeyPresent && Boolean(c.model);
}

/** Each provider package reads its own key from process.env (ANTHROPIC_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY). */
export function languageModel(modelId: string, provider: AiProvider = env.AI_PROVIDER): LanguageModel {
  return provider === "google" ? google(modelId) : anthropic(modelId);
}
