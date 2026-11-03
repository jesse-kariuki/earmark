// Money rule 7: events are append-only. Only lib/events/append.ts inserts; nothing in src updates or deletes,
// except the judge-mode tamper demo in src/lib/admin/ (M7). The DB triggers back this up at runtime.
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

describe("events table write paths", () => {
  it("no module outside src/lib/admin updates or deletes events", () => {
    const offenders = files.filter(
      (f) =>
        !f.path.startsWith("src/lib/admin/") &&
        (/\.(update|delete)\(\s*events\b/.test(f.code) || /\b(UPDATE|DELETE\s+FROM)\s+[`"]?events\b/i.test(f.code)),
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it("only lib/events/append.ts inserts into events", () => {
    const writers = files.filter((f) => /\.insert\(\s*events\b/.test(f.code) || /INSERT\s+INTO\s+[`"]?events\b/i.test(f.code));
    expect(writers.map((f) => f.path)).toEqual(["src/lib/events/append.ts"]);
  });
});
