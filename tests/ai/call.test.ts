import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { type AiRuntime, callAi, fixturePath } from "@/lib/ai/call";
import { getEvents } from "@/lib/events/append";
import { verifyChain } from "@/lib/events/chain";
import { fixedNow } from "../helpers/clock";
import { makeTestDb } from "../helpers/db";
import { makeEarmark } from "../helpers/factories";

const Schema = z.object({ answer: z.number().int() });
const KEY = "a".repeat(64);

function runtime(overrides: Partial<AiRuntime> = {}): AiRuntime {
  return {
    mode: "fixture",
    record: false,
    model: "claude-test",
    apiKeyPresent: true,
    fixturesDir: mkdtempSync(join(tmpdir(), "earmark-ai-")),
    now: fixedNow().now,
    ...overrides,
  };
}

function writeFixture(dir: string, recorded: boolean, output: unknown, model = "hand-authored") {
  const p = fixturePath(dir, "contract.compile", KEY, recorded);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ stage: "contract.compile", input: "q", output, model }));
}

const input = { stage: "contract.compile" as const, schema: Schema, instructions: "sys", prompt: "q", fixtureKey: KEY };

describe("callAi — fixture mode", () => {
  it("returns the hand-authored fixture", async () => {
    const rt = runtime();
    writeFixture(rt.fixturesDir, false, { answer: 1 });
    const r = await callAi(input, rt);
    expect(r).toMatchObject({ ok: true, value: { output: { answer: 1 }, meta: { source: "fixture", inputHash: KEY } } });
  });

  it("prefers a recorded live output over the hand-authored one", async () => {
    const rt = runtime();
    writeFixture(rt.fixturesDir, false, { answer: 1 });
    writeFixture(rt.fixturesDir, true, { answer: 2 }, "claude-recorded");
    const r = await callAi(input, rt);
    expect(r).toMatchObject({ ok: true, value: { output: { answer: 2 }, meta: { source: "recorded", model: "claude-recorded" } } });
  });

  it("reports a missing fixture without calling any model", async () => {
    const generate = vi.fn();
    const r = await callAi(input, runtime({ generate }));
    expect(r).toMatchObject({ ok: false, error: { code: "AI_FIXTURE_MISSING" } });
    expect(generate).not.toHaveBeenCalled();
  });

  it("validates fixture output with the schema", async () => {
    const rt = runtime();
    writeFixture(rt.fixturesDir, false, { answer: 1.5 });
    expect(await callAi(input, rt)).toMatchObject({ ok: false, error: { code: "AI_INVALID_OUTPUT" } });
  });
});

describe("callAi — live mode", () => {
  it("calls the model with instructions, prompt and schema", async () => {
    const generate = vi.fn().mockResolvedValue({ answer: 42 });
    const r = await callAi(input, runtime({ mode: "live", generate }));
    expect(r).toMatchObject({ ok: true, value: { output: { answer: 42 }, meta: { source: "live", model: "claude-test" } } });
    expect(generate).toHaveBeenCalledWith({ model: "claude-test", instructions: "sys", prompt: "q", schema: Schema });
  });

  it("refuses without an API key or model", async () => {
    const generate = vi.fn();
    expect(await callAi(input, runtime({ mode: "live", apiKeyPresent: false, generate }))).toMatchObject({
      ok: false,
      error: { code: "AI_NOT_CONFIGURED" },
    });
    expect(await callAi(input, runtime({ mode: "live", model: undefined, generate }))).toMatchObject({
      ok: false,
      error: { code: "AI_NOT_CONFIGURED" },
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("maps a thrown model error to AI_ERROR", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("overloaded"));
    expect(await callAi(input, runtime({ mode: "live", generate }))).toEqual({
      ok: false,
      error: { code: "AI_ERROR", message: "overloaded" },
    });
  });

  it("rejects invalid model output and does not record it", async () => {
    const rt = runtime({ mode: "live", record: true, generate: vi.fn().mockResolvedValue({ answer: "no" }) });
    expect(await callAi(input, rt)).toMatchObject({ ok: false, error: { code: "AI_INVALID_OUTPUT" } });
    expect(existsSync(fixturePath(rt.fixturesDir, "contract.compile", KEY, true))).toBe(false);
  });

  it("records the validated output when AI_RECORD is on, and fixture mode then replays it", async () => {
    const rt = runtime({ mode: "live", record: true, generate: vi.fn().mockResolvedValue({ answer: 7 }) });
    await callAi(input, rt);
    const saved = JSON.parse(readFileSync(fixturePath(rt.fixturesDir, "contract.compile", KEY, true), "utf8"));
    expect(saved).toMatchObject({ stage: "contract.compile", input: "q", output: { answer: 7 }, model: "claude-test" });
    expect(await callAi(input, { ...rt, mode: "fixture" })).toMatchObject({
      ok: true,
      value: { output: { answer: 7 }, meta: { source: "recorded" } },
    });
  });
});

describe("callAi — trace", () => {
  it("appends a trace.step with stage, model, latency, input hash and summary", async () => {
    const { db } = makeTestDb({ seed: false });
    const earmarkId = makeEarmark(db).id;
    const clock = fixedNow();
    const generate = vi.fn(async () => {
      clock.advance(1234);
      return { answer: 3 };
    });
    await callAi(
      { ...input, summarize: (o) => `answer ${o.answer}` },
      runtime({ mode: "live", generate, now: clock.now, trace: { db, earmarkId } }),
    );
    const events = getEvents(db, earmarkId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "trace.step",
      payload: { stage: "contract.compile", model: "claude-test", latencyMs: 1234, inputHash: KEY, source: "live", outputSummary: "answer 3" },
    });
    expect(await verifyChain(events)).toMatchObject({ ok: true });
  });
});
