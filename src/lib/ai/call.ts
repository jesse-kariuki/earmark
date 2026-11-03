import "server-only";
// Every LLM call goes through here (docs/04-AI-AGENTS.md):
//   fixture → recorded output from evals/fixtures/ (recorded/ first, then hand-authored), keyed by input hash
//   live    → Claude via the AI SDK at temperature 0; with AI_RECORD=1 the output is written to evals/fixtures/recorded/
// Output is always Zod-validated. When an earmark is known, a `trace.step` event is appended.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import type { z } from "zod";
import type { Db } from "@/lib/db/client";
import { appendEvent } from "@/lib/events/append";
import { err, ok, type Result } from "@/lib/result";

export type AiStage = "contract.compile" | "invoice.extract" | "guardian" | "explain";
export type AiMode = "fixture" | "live";

export interface AiCallInput<T> {
  stage: AiStage;
  schema: z.ZodType<T>;
  instructions: string;
  prompt: string;
  /** sha256 of the normalized untrusted input (sentence hash / file hash). Names the fixture file. */
  fixtureKey: string;
  /** One-line, non-sensitive summary for the trace (never raw invoice text). */
  summarize?: (output: T) => string;
}

export interface AiCallMeta {
  stage: AiStage;
  source: "fixture" | "recorded" | "live";
  model: string;
  latencyMs: number;
  inputHash: string;
}

export type AiErrorCode = "AI_FIXTURE_MISSING" | "AI_NOT_CONFIGURED" | "AI_ERROR" | "AI_INVALID_OUTPUT";
export type AiCallResult<T> = Result<{ output: T; meta: AiCallMeta }, { code: AiErrorCode; message: string }>;

/** Live model call, injectable so tests exercise the live path without network. */
export type LiveGenerate = (args: { model: string; instructions: string; prompt: string; schema: z.ZodType }) => Promise<unknown>;

export interface AiRuntime {
  mode: AiMode;
  record: boolean;
  model?: string;
  apiKeyPresent: boolean;
  fixturesDir: string;
  now: () => number;
  generate?: LiveGenerate;
  /** Append a trace.step to this earmark's chain. */
  trace?: { db: Db; earmarkId: string };
}

export interface FixtureFile {
  stage: AiStage;
  input: string;
  output: unknown;
  model: string; // "hand-authored" or the live model id that produced it
  recordedAt?: string;
}

export function fixturePath(dir: string, stage: AiStage, key: string, recorded: boolean): string {
  return recorded ? join(dir, "recorded", stage, `${key}.json`) : join(dir, stage, `${key}.json`);
}

const defaultGenerate: LiveGenerate = async ({ model, instructions, prompt, schema }) => {
  const { output } = await generateText({
    model: anthropic(model),
    instructions,
    prompt,
    temperature: 0,
    output: Output.object({ schema }),
  });
  return output;
};

export async function callAi<T>(input: AiCallInput<T>, rt: AiRuntime): Promise<AiCallResult<T>> {
  const started = rt.now();
  let raw: unknown;
  let source: AiCallMeta["source"];
  let model: string;

  if (rt.mode === "fixture") {
    const recorded = fixturePath(rt.fixturesDir, input.stage, input.fixtureKey, true);
    const authored = fixturePath(rt.fixturesDir, input.stage, input.fixtureKey, false);
    const file = existsSync(recorded) ? recorded : existsSync(authored) ? authored : null;
    if (!file) {
      return err({
        code: "AI_FIXTURE_MISSING",
        message: "No recorded AI output for this input. Use one of the examples, or switch AI to Live.",
      });
    }
    const fixture = JSON.parse(readFileSync(file, "utf8")) as FixtureFile;
    raw = fixture.output;
    source = file === recorded ? "recorded" : "fixture";
    model = fixture.model;
  } else {
    if (!rt.apiKeyPresent || !rt.model) {
      return err({ code: "AI_NOT_CONFIGURED", message: "Live AI needs ANTHROPIC_API_KEY and ANTHROPIC_MODEL." });
    }
    try {
      raw = await (rt.generate ?? defaultGenerate)({
        model: rt.model,
        instructions: input.instructions,
        prompt: input.prompt,
        schema: input.schema,
      });
    } catch (e) {
      return err({ code: "AI_ERROR", message: e instanceof Error ? e.message : "Model call failed" });
    }
    source = "live";
    model = rt.model;
  }

  const parsed = input.schema.safeParse(raw);
  if (!parsed.success) {
    return err({ code: "AI_INVALID_OUTPUT", message: `Model output failed validation: ${parsed.error.issues[0]?.message ?? "invalid"}` });
  }

  if (source === "live" && rt.record) {
    const path = fixturePath(rt.fixturesDir, input.stage, input.fixtureKey, true);
    mkdirSync(dirname(path), { recursive: true });
    const file: FixtureFile = {
      stage: input.stage,
      input: input.prompt,
      output: parsed.data,
      model,
      recordedAt: new Date(rt.now()).toISOString(),
    };
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
  }

  const meta: AiCallMeta = {
    stage: input.stage,
    source,
    model,
    latencyMs: Math.max(0, Math.round(rt.now() - started)),
    inputHash: input.fixtureKey,
  };

  if (rt.trace) {
    appendEvent(
      rt.trace.db,
      {
        earmarkId: rt.trace.earmarkId,
        type: "trace.step",
        actor: "system",
        payload: { ...meta, outputSummary: input.summarize?.(parsed.data) ?? null },
      },
      { now: rt.now() },
    );
  }

  return ok({ output: parsed.data, meta });
}
