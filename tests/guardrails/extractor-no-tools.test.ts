// Money rule 4: the model that reads untrusted invoice content has no tools (docs/09 §3).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LiveGenerate } from "@/lib/ai/call";
import { extractInvoice } from "@/lib/invoice/extract";
import { makeExtracted } from "../helpers/gate";

describe("quarantined extractor", () => {
  it("calls the model with the document and no tools property", async () => {
    const calls: Parameters<LiveGenerate>[0][] = [];
    const generate: LiveGenerate = async (args) => {
      calls.push(args);
      return makeExtracted();
    };
    const r = await extractInvoice(
      { bytes: new Uint8Array([37, 80, 68, 70]), mime: "application/pdf" },
      { mode: "live", record: false, model: "test-model", apiKeyPresent: true, fixturesDir: "unused", now: Date.now, generate },
    );
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0]!).sort()).toEqual(["files", "instructions", "model", "prompt", "schema"]);
    expect(calls[0]!.files![0]!.mediaType).toBe("application/pdf");
  });

  it("has no tool plumbing in the AI wrapper or the extractor source", () => {
    for (const file of ["src/lib/ai/call.ts", "src/lib/invoice/extract.ts"]) {
      const code = readFileSync(join(process.cwd(), file), "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");
      expect(code, file).not.toMatch(/\btools\s*:/);
      expect(code, file).not.toMatch(/import\s*\{[^}]*\btool\b[^}]*\}\s*from\s*"ai"/);
    }
  });

  it("rejects model output that does not fit the schema", async () => {
    const r = await extractInvoice(
      { bytes: new Uint8Array([1]), mime: "image/png" },
      { mode: "live", record: false, model: "m", apiKeyPresent: true, fixturesDir: "unused", now: Date.now, generate: async () => ({ total: "800" }) },
    );
    expect(r).toMatchObject({ ok: false, error: { code: "AI_INVALID_OUTPUT" } });
  });
});
