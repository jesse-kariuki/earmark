// Money rule 2: only lib/orchestrator may import the money-moving PayPal client.
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

async function restrictedImportErrors(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-imports");
}

// The first case pays for a cold ESLint start, which can exceed 20s when the whole suite runs in parallel.
describe("ESLint money-import rule", { timeout: 60_000 }, () => {
  it.each([
    ['import { paypal } from "@/lib/paypal/client";', "src/app/api/x/route.ts"],
    ['import { paypal } from "../paypal/client";', "src/lib/agents/guardian.ts"],
    ['import { createSandboxPayPal } from "@/lib/paypal/sandbox";', "src/lib/agents/guardian.ts"],
    ['import { createMockPayPal } from "@/lib/paypal/mock";', "src/components/Foo.tsx"],
  ])("blocks %s in %s", async (code, file) => {
    expect(await restrictedImportErrors(`${code}\nexport {};`, file)).toHaveLength(1);
  });

  it.each([
    ['import { paypal } from "@/lib/paypal/client";', "src/lib/orchestrator/execute.ts"],
    ['import { paypal } from "@/lib/paypal/client";', "scripts/paypal-smoke.ts"],
    ['import type { PayPalClient } from "@/lib/paypal/types";', "src/app/api/x/route.ts"],
  ])("allows %s in %s", async (code, file) => {
    expect(await restrictedImportErrors(`${code}\nexport {};`, file)).toHaveLength(0);
  });
});
