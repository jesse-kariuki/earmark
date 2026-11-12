// Parses demo/script.md: one `## Scene N · Title` heading per scene, with a `- **Narration:**` line under it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Scene {
  n: number;
  title: string;
  narration: string;
}

export const SCRIPT_PATH = join(process.cwd(), "demo", "script.md");

export function parseScript(md = readFileSync(SCRIPT_PATH, "utf8")): Scene[] {
  const scenes: Scene[] = [];
  let current: Scene | null = null;
  for (const line of md.split(/\r?\n/)) {
    const h = /^## Scene (\d+)\s*[·:-]\s*(.+)$/.exec(line);
    if (h) {
      current = { n: Number(h[1]), title: h[2]!.trim(), narration: "" };
      scenes.push(current);
      continue;
    }
    const nar = /^- \*\*Narration:\*\*\s*(.+)$/.exec(line);
    if (nar && current) current.narration = nar[1]!.trim();
  }
  scenes.forEach((s, i) => {
    if (s.n !== i + 1) throw new Error(`script.md: scenes must be numbered 1..N in order (found Scene ${s.n} at position ${i + 1})`);
    if (!s.narration) throw new Error(`script.md: Scene ${s.n} has no "- **Narration:**" line`);
  });
  if (scenes.length === 0) throw new Error("script.md: no scenes found");
  return scenes;
}

/** Each narration clip starts this long after its scene starts (record.ts and build both use it). */
export const NARRATION_LEAD = 0.4;

/** Rough speaking time when no audio clip exists (about 155 words a minute). */
export function estimateSeconds(text: string): number {
  return (text.split(/\s+/).filter(Boolean).length / 155) * 60;
}
