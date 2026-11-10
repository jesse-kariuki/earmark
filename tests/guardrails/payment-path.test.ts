// docs/10-TESTING.md: "No payment path skips the gate". Only redeemTicket creates payments (the seed writes history).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(d.name) ? [p] : [];
  });
}

const files = sourceFiles(join(ROOT, "src")).map((f) => ({
  path: relative(ROOT, f).replaceAll("\\", "/"),
  code: readFileSync(f, "utf8"),
}));

describe("payment write paths", () => {
  it("only lib/orchestrator calls redeemTicket", () => {
    const offenders = files.filter(
      (f) => f.path !== "src/lib/policy/tickets.ts" && !f.path.startsWith("src/lib/orchestrator/") && /\bredeemTicket\b/.test(f.code),
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it("only lib/policy/tickets.ts inserts payments or tickets, or marks tickets redeemed", () => {
    const allowed = ["src/lib/policy/tickets.ts", "src/lib/db/seed.ts"];
    const offenders = files.filter((f) => !allowed.includes(f.path) && /\.(insert\(\s*(payments|tickets)|update\(\s*tickets)\b/.test(f.code));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it("only lib/orchestrator advances a payment's status (capture → payout → confirmed)", () => {
    const allowed = ["src/lib/policy/tickets.ts", "src/lib/db/seed.ts"];
    const offenders = files.filter(
      (f) => !allowed.includes(f.path) && !f.path.startsWith("src/lib/orchestrator/") && /\.update\(\s*payments\b/.test(f.code),
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });
});
