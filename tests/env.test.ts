import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

describe("env", () => {
  it("defaults to the offline modes", () => {
    const e = parseEnv({});
    expect(e.PAYPAL_MODE).toBe("mock");
    expect(e.AI_MODE).toBe("fixture");
    expect(e.JUDGE_MODE).toBe(true);
    expect(e.KES_DISPLAY_RATE).toBe(129);
  });

  it("strips inline comments as written in .env.example", () => {
    expect(parseEnv({ PAYPAL_MODE: "sandbox            # mock | sandbox", PAYPAL_CLIENT_ID: "a", PAYPAL_CLIENT_SECRET: "b" }).PAYPAL_MODE).toBe(
      "sandbox",
    );
  });

  it("requires PayPal credentials in sandbox mode", () => {
    expect(() => parseEnv({ PAYPAL_MODE: "sandbox" })).toThrow(/PAYPAL_CLIENT_ID is required/);
  });

  it("requires an Anthropic key in live AI mode", () => {
    expect(() => parseEnv({ AI_MODE: "live" })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("requires a Google key in live AI mode with AI_PROVIDER=google", () => {
    expect(() => parseEnv({ AI_MODE: "live", AI_PROVIDER: "google" })).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
    expect(parseEnv({ AI_MODE: "live", AI_PROVIDER: "google", GOOGLE_GENERATIVE_AI_API_KEY: "k" }).AI_PROVIDER).toBe("google");
    expect(() => parseEnv({ AI_PROVIDER: "openai" })).toThrow(/AI_PROVIDER/);
  });

  it("rejects unknown modes", () => {
    expect(() => parseEnv({ PAYPAL_MODE: "live" })).toThrow(/PAYPAL_MODE/);
  });
});
