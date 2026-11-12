// npm run demo: the whole pipeline, re-runnable.
//   1. demo:prime   make sure the demo sentence has a recorded AI output (live call only the first time)
//   2. narrate.sh   one audio clip per scene
//   3. app          production build + `next start` on :3200 with a fresh demo DB (skipped when DEMO_URL is set)
//   4. record.ts    Playwright recording + demo/out/timings.json
//   5. build.sh     ffmpeg → demo/out/earmark-demo.mp4
// Env: DEMO_URL (use a running app), DEMO_PORT (3200), DEMO_SKIP_BUILD=1, HEADLESS=1, NARRATE_ENGINE, DEMO_TEAM, DEMO_REPO_URL.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import "dotenv/config";

const root = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
process.chdir(root);
const win = process.platform === "win32";
const port = Number(process.env.DEMO_PORT ?? 3200);
const started = Date.now();

function findBash() {
  if (!win) return "bash";
  // Git Bash, never WSL's System32\bash.exe (it cannot see this Windows node/ffmpeg).
  try {
    const exec = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim(); // …/Git/mingw64/libexec/git-core
    const bash = join(exec, "..", "..", "..", "bin", "bash.exe");
    if (existsSync(bash)) return bash;
  } catch {}
  for (const p of ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files (x86)\\Git\\bin\\bash.exe"]) if (existsSync(p)) return p;
  throw new Error("Git Bash not found. Install Git for Windows, or run the steps in demo/ by hand.");
}

function step(name, cmd, args, opts = {}) {
  console.log(`\n▶ ${name}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: opts.shell ?? false, env: { ...process.env, ...opts.env } });
  if (r.status !== 0) throw new Error(`${name} failed (exit ${r.status ?? r.signal})`);
}

// Run tsx and next through node directly, so neither pnpm nor a shell is needed.
const node = process.execPath;
const tsx = (script) => [node, ["node_modules/tsx/dist/cli.mjs", "--conditions=react-server", script], {}];
const next = (...a) => [node, ["node_modules/next/dist/bin/next", ...a]];

async function waitForHealth(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`App did not become healthy at ${url}`);
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (win) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

async function main() {
  const bash = findBash();
  const [cmd, args, o] = tsx("demo/prime.ts");
  step("demo:prime (recorded AI output for the demo sentence)", cmd, args, o);
  step("narrate", bash, ["demo/narrate.sh"]);

  let server = null;
  let base = process.env.DEMO_URL;
  if (!base) {
    base = `http://localhost:${port}`;
    if (await fetch(`${base}/api/health`).then((r) => r.ok, () => false)) throw new Error(`Port ${port} is already in use. Stop that server or set DEMO_PORT.`);
    // The demo server is ours: fresh DB, recorded AI, no rate limit. PayPal mode comes from .env (mock or sandbox).
    const env = {
      DATABASE_PATH: ".data/demo.db",
      AI_MODE: "fixture",
      RATE_LIMIT_PER_MIN: "100000",
      JUDGE_MODE: "true",
      NEXT_DIST_DIR: ".next-demo",
      PORT: String(port),
      ...(process.env.PAYPAL_MODE?.startsWith("sandbox") && !process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ? { NEXT_PUBLIC_PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID ?? "" } : {}),
    };
    for (const f of [".data/demo.db", ".data/demo.db-wal", ".data/demo.db-shm"]) rmSync(f, { force: true });
    if (process.env.DEMO_SKIP_BUILD !== "1") step("next build", ...next("build"), { env });
    console.log(`\n▶ app on ${base}`);
    server = spawn(...next("start", "-p", String(port)), { env: { ...process.env, ...env }, stdio: ["ignore", "ignore", "inherit"] });
    await waitForHealth(`${base}/api/health`, 120_000);
  }

  try {
    const [c, a, opt] = tsx("demo/record.ts");
    step("record", c, a, { ...opt, env: { DEMO_URL: base } });
  } finally {
    killTree(server);
  }
  step("build", bash, ["demo/build.sh"]);
  console.log(`\n✔ demo/out/earmark-demo.mp4 (pipeline took ${Math.round((Date.now() - started) / 1000)}s)`);
}

main().catch((e) => {
  console.error(`\n✖ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
