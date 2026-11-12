// Helpers the shell scripts call (npx tsx demo/tools.ts <command>):
//   texts <dir>        write scene-N.txt for each narration line in script.md; prints the scene count
//   durations <dir>    read scene-N.wav headers, write <dir>/durations.json ({"1": seconds, ...})
//   plan               from demo/out/timings.json: write captions.srt, filter.txt and inputs.txt for build.sh
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { estimateSeconds, NARRATION_LEAD, parseScript } from "./script";

const OUT = "demo/out";
const AUDIO = `${OUT}/audio`;
export const TITLE_SECONDS = 3;
export const END_SECONDS = 4;

export interface Timings {
  video: string;
  scenes: { n: number; title: string; start: number; end: number }[];
  end: number;
  popup?: { video: string; start: number; end: number };
}

/** Duration of a PCM WAV from its header (narrate.sh normalises every clip to 16-bit PCM). */
export function wavSeconds(buf: Buffer): number {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV file");
  let byteRate = 0;
  for (let off = 12; off + 8 <= buf.length; ) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") byteRate = buf.readUInt32LE(off + 16);
    if (id === "data") return byteRate ? Math.min(size, buf.length - off - 8) / byteRate : 0;
    off += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

export function readDurations(dir = AUDIO): Record<string, number> {
  const p = join(dir, "durations.json");
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Record<string, number>) : {};
}

function srtTime(s: number): string {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

/** Caption-sized pieces: sentences, then split at commas or every ~12 words. */
export function chunks(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?:])\s+/)) {
    const words = sentence.split(/\s+/).filter(Boolean);
    let cur: string[] = [];
    for (const w of words) {
      cur.push(w);
      if ((cur.length >= 7 && /,$/.test(w)) || cur.length >= 12) {
        out.push(cur.join(" "));
        cur = [];
      }
    }
    if (cur.length) out.push(cur.join(" "));
  }
  return out;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function plan(): void {
  const t = JSON.parse(readFileSync(join(OUT, "timings.json"), "utf8")) as Timings;
  const scenes = parseScript();
  const durations = readDurations();
  const trim = t.scenes[0]!.start;
  const recLen = t.end - trim;
  const total = TITLE_SECONDS + recLen + END_SECONDS;
  const at = (sceneStart: number) => TITLE_SECONDS + (sceneStart - trim) + NARRATION_LEAD;

  // Captions
  const srt: string[] = [];
  let idx = 1;
  for (const s of scenes) {
    const timing = t.scenes.find((x) => x.n === s.n);
    if (!timing) continue;
    const dur = durations[String(s.n)] ?? estimateSeconds(s.narration);
    const parts = chunks(s.narration);
    const chars = parts.reduce((a, p) => a + p.length, 0);
    let cursor = at(timing.start);
    for (const p of parts) {
      const len = (p.length / chars) * dur;
      srt.push(`${idx++}\n${srtTime(cursor)} --> ${srtTime(cursor + len - 0.05)}\n${p}\n`);
      cursor += len;
    }
  }
  writeFileSync(join(OUT, "captions.srt"), srt.join("\n"));

  // ffmpeg inputs: 0 title, 1 recording, 2 end card, [3 popup], then one per narration clip.
  const inputs = [
    ["-loop", "1", "-framerate", "30", "-t", String(TITLE_SECONDS), "-i", `${OUT}/title.png`],
    ["-i", t.video],
    ["-loop", "1", "-framerate", "30", "-t", String(END_SECONDS), "-i", `${OUT}/end.png`],
  ];
  const f: string[] = [];
  f.push(`[0:v]scale=1920:1080,setsar=1,fps=30,format=yuv420p[t]`);
  f.push(
    `[1:v]trim=start=${r3(trim)},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease,` +
      `pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1,fps=30,format=yuv420p[r0]`,
  );
  let rec = "r0";
  if (t.popup && existsSync(t.popup.video)) {
    // The PayPal popup is its own page (own video file): float it over the main recording while it was open.
    inputs.push(["-i", t.popup.video]);
    const ps = r3(t.popup.start - trim);
    const pe = r3(t.popup.end - trim);
    f.push(`[3:v]setpts=PTS-STARTPTS+${ps}/TB,scale=-2:900,setsar=1[pp]`);
    f.push(`[r0][pp]overlay=x=(W-w)/2:y=(H-h)/2:eof_action=pass:enable='between(t,${ps},${pe})'[r1]`);
    rec = "r1";
  }
  f.push(`[2:v]scale=1920:1080,setsar=1,fps=30,format=yuv420p[e]`);
  f.push(`[t][${rec}][e]concat=n=3:v=1:a=0[cat]`);
  const style = "FontName=Arial,FontSize=13,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=6,Shadow=0,MarginV=30";
  f.push(`[cat]subtitles=filename=${OUT}/captions.srt:force_style='${style}'[v]`);

  const clips: string[] = [];
  for (const s of scenes) {
    const wav = `${AUDIO}/scene-${s.n}.wav`;
    const timing = t.scenes.find((x) => x.n === s.n);
    if (!timing || !existsSync(wav)) continue;
    const index = inputs.length;
    inputs.push(["-i", wav]);
    const ms = Math.round(at(timing.start) * 1000);
    f.push(`[${index}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${ms}:all=1[a${s.n}]`);
    clips.push(`[a${s.n}]`);
  }
  if (clips.length > 0) {
    f.push(`${clips.join("")}amix=inputs=${clips.length}:normalize=0:duration=longest,apad=whole_dur=${r3(total)}[a]`);
  } else {
    inputs.push(["-f", "lavfi", "-t", String(r3(total)), "-i", "anullsrc=r=48000:cl=mono"]);
    f.push(`[${inputs.length - 1}:a]anull[a]`);
  }

  writeFileSync(join(OUT, "filter.txt"), `${f.join(";\n")}\n`);
  writeFileSync(join(OUT, "inputs.txt"), `${inputs.flat().join("\n")}\n`);
  console.log(r3(total));
}

function main(): void {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "texts") {
    const dir = arg ?? `${OUT}/text`;
    mkdirSync(dir, { recursive: true });
    const scenes = parseScript();
    for (const s of scenes) writeFileSync(join(dir, `scene-${s.n}.txt`), `${s.narration}\n`);
    console.log(scenes.length);
  } else if (cmd === "durations") {
    const dir = arg ?? AUDIO;
    const out: Record<string, number> = {};
    for (const s of parseScript()) {
      const p = join(dir, `scene-${s.n}.wav`);
      if (existsSync(p)) out[String(s.n)] = r3(wavSeconds(readFileSync(p)));
    }
    writeFileSync(join(dir, "durations.json"), `${JSON.stringify(out, null, 2)}\n`);
    console.log(Object.entries(out).map(([k, v]) => `scene ${k}: ${v}s`).join(", "));
  } else if (cmd === "plan") {
    plan();
  } else {
    console.error("usage: tsx demo/tools.ts texts <dir> | durations <dir> | plan");
    process.exit(2);
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("demo/tools.ts")) main();
