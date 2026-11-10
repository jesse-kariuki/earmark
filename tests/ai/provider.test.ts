import { describe, expect, it } from "vitest";
import { languageModel, liveAiAvailable, liveAiConfig } from "@/lib/ai/provider";
import { parseEnv } from "@/lib/env";

describe("live AI provider", () => {
  it("defaults to Anthropic", () => {
    const e = parseEnv({ ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "claude-x" });
    expect(liveAiConfig(e)).toMatchObject({ provider: "anthropic", model: "claude-x", apiKeyPresent: true });
    expect(liveAiAvailable(e)).toBe(true);
  });

  it("uses the Google key and model with AI_PROVIDER=google, ignoring the Anthropic ones", () => {
    const e = parseEnv({ AI_PROVIDER: "google", ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "claude-x", GOOGLE_MODEL: "gemini-x" });
    expect(liveAiConfig(e)).toMatchObject({ provider: "google", model: "gemini-x", apiKeyPresent: false });
    expect(liveAiConfig(e).needs).toMatch(/GOOGLE_GENERATIVE_AI_API_KEY/);
    expect(liveAiAvailable(e)).toBe(false);
    expect(liveAiAvailable(parseEnv({ AI_PROVIDER: "google", GOOGLE_GENERATIVE_AI_API_KEY: "g", GOOGLE_MODEL: "gemini-x" }))).toBe(true);
  });

  it("builds a model from the chosen provider", () => {
    const g = languageModel("gemini-x", "google");
    const a = languageModel("claude-x", "anthropic");
    expect(typeof g === "object" && g.provider).toMatch(/google/);
    expect(typeof a === "object" && a.provider).toMatch(/anthropic/);
  });
});
