import { describe, expect, it } from "vitest";
import { describeEvent } from "@/lib/events/describe";
import { EVENT_TYPES } from "@/lib/events/types";

const ev = (type: string, payload: unknown, actor = "system") => describeEvent({ seq: 1, type, actor, payload, createdAt: 0 });

describe("describeEvent", () => {
  it("describes every event type without falling back to the raw type", () => {
    for (const t of EVENT_TYPES) expect(ev(t, {}).text, t).not.toBe(t);
  });

  it("shows PayPal calls with endpoint and Request-Id", () => {
    const l = ev("trace.step", { stage: "paypal", op: "capture", method: "POST", path: "/v2/payments/authorizations/A/capture", requestId: "pay_1:capture", ok: true, status: 201 }, "orchestrator");
    expect(l).toMatchObject({ actor: "PayPal", paypal: { method: "POST", requestId: "pay_1:capture", status: 201 } });
  });

  it("badges the extractor and the toolkit, and marks blocks", () => {
    expect(ev("trace.step", { stage: "invoice.extract", source: "fixture", model: "m", outputSummary: "x" }).badges).toContain("No tools");
    expect(ev("invoice.extracted", { ok: true, amountMinor: 35000, currency: "USD", containsInstructions: true }).tone).toBe("bad");
    expect(ev("trace.step", { stage: "guardian", tool: "get_order", ok: true, summary: "s" }, "guardian").badges).toContain("PayPal Agent Toolkit");
    expect(ev("policy.evaluated", { verdict: "BLOCK", firstBlocking: "R05_PAYOUT_ACCOUNT_MATCH" }).text).toContain("R05_PAYOUT_ACCOUNT_MATCH");
    expect(ev("paypal.captured", { amountMinor: 1.5 }).text).toContain("unreadable");
  });
});
