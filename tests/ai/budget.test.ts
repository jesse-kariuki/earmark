import { describe, expect, it } from "vitest";
import { liveCallsLeft, noteLiveCall, resolveAiMode } from "@/lib/ai/runtime";

describe("live AI daily budget", () => {
  it("falls back to fixture once today's live calls are spent", () => {
    expect(resolveAiMode("live")).toBe("live");
    const left = liveCallsLeft();
    for (let i = 0; i < left; i++) noteLiveCall();
    expect(liveCallsLeft()).toBe(0);
    expect(resolveAiMode("live")).toBe("fixture");
    expect(resolveAiMode("fixture")).toBe("fixture");
  });
});
