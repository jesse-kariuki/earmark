// Records the demo (demo/script.md) with Playwright: headed Chromium at 1920x1080 with video on.
// Each scene starts on a timestamp written to demo/out/timings.json, pauses ~1.5 s after every visible change,
// and is held until its narration clip (demo/out/audio/durations.json) has finished.
// PayPal: mock mode clicks the mock button; sandbox mode drives the real popup with
// PAYPAL_SANDBOX_BUYER_EMAIL / PAYPAL_SANDBOX_BUYER_PASSWORD (never hardcoded).
// Env: DEMO_URL (default http://localhost:3200), HEADLESS=1, DEMO_TEAM, DEMO_REPO_URL.
import "dotenv/config";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BrowserContext, chromium, expect, type Locator, type Page } from "@playwright/test";
import { DEMO_SENTENCE } from "./config";
import { estimateSeconds, NARRATION_LEAD, parseScript } from "./script";
import { readDurations, type Timings } from "./tools";

const BASE = (process.env.DEMO_URL ?? "http://localhost:3200").replace(/\/$/, "");
const OUT = "demo/out";
const RAW = `${OUT}/raw`;
const PAUSE = 1500;
const SIZE = { width: 1920, height: 1080 };
// The app is laid out for laptop widths: record 1280x720 CSS pixels at 1.5x, which renders a sharp 1920x1080 frame
// with readable text (a 1920-wide viewport leaves the UI small in the middle of the screen).
const VIEW = { width: 1280, height: 720 };

const scenes = parseScript();
const durations = readDurations();
const timings: Timings = { video: "", scenes: [], end: 0 };
let t0 = 0;
const now = () => (Date.now() - t0) / 1000;

// A visible cursor, so viewers can follow the clicks (Playwright's mouse has none on video).
const CURSOR = `(() => {
  const add = () => {
    if (document.getElementById("__demo_cursor")) return;
    const c = document.createElement("div");
    c.id = "__demo_cursor";
    c.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(13,148,136,.35);border:2px solid rgb(13,148,136);transition:transform .12s;left:-50px;top:-50px";
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => { c.style.transform = "scale(.7)"; }, true);
    addEventListener("mouseup", () => { c.style.transform = "scale(1)"; }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", add); else add();
})();`;

async function beat(page: Page, ms = PAUSE) {
  await page.waitForTimeout(ms);
}

/** Move the visible cursor to the element, then click it. */
async function click(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
    await page.waitForTimeout(250);
  }
  await target.click();
}

async function smoothScroll(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "smooth" }), y);
  await page.waitForTimeout(900);
}

async function scene(page: Page, n: number, body: () => Promise<void>) {
  const def = scenes.find((s) => s.n === n);
  if (!def) throw new Error(`script.md has no Scene ${n}`);
  const start = now();
  console.log(`[${start.toFixed(1)}s] scene ${n}: ${def.title}`);
  await body();
  // Hold the scene until its narration (plus a breath) is over, so clips never overlap the next scene.
  const minEnd = start + NARRATION_LEAD + (durations[String(n)] ?? estimateSeconds(def.narration)) + 0.8;
  if (now() < minEnd) await page.waitForTimeout((minEnd - now()) * 1000);
  timings.scenes.push({ n, title: def.title, start: Math.round(start * 1000) / 1000, end: Math.round(now() * 1000) / 1000 });
}

async function holdWithPayPal(page: Page, context: BrowserContext) {
  const mock = page.getByRole("button", { name: "Hold with PayPal (mock)" });
  if (await mock.isVisible()) {
    await click(page, mock);
    return;
  }
  const email = process.env.PAYPAL_SANDBOX_BUYER_EMAIL;
  const password = process.env.PAYPAL_SANDBOX_BUYER_PASSWORD;
  if (!email || !password) throw new Error("PayPal sandbox mode: set PAYPAL_SANDBOX_BUYER_EMAIL and PAYPAL_SANDBOX_BUYER_PASSWORD (a sandbox personal account).");

  const button = page.frameLocator('iframe[title="PayPal"]').first().locator('[data-funding-source="paypal"]').first();
  await button.waitFor({ timeout: 30_000 });
  const opened = now();
  const [popup] = await Promise.all([context.waitForEvent("page"), click(page, button)]);
  await popup.waitForLoadState("domcontentloaded");

  const emailBox = popup.locator("#email");
  await emailBox.waitFor({ timeout: 45_000 });
  await emailBox.fill(email);
  const next = popup.locator("#btnNext");
  if (await next.isVisible()) await next.click();
  const pw = popup.locator("#password");
  await pw.waitFor({ timeout: 30_000 });
  await pw.fill(password);
  await popup.locator("#btnLogin").click();
  // The review page's submit button has changed names over the years; take the first that appears.
  const approve = popup.locator('#payment-submit-btn, [data-testid="submit-button-initial"], button:has-text("Continue"), button:has-text("Pay")').first();
  await approve.waitFor({ timeout: 60_000 });
  await beat(popup, 800);
  await approve.click();
  await popup.waitForEvent("close", { timeout: 60_000 });
  const videoPath = await popup.video()?.path();
  if (videoPath) timings.popup = { video: videoPath.replace(/\\/g, "/"), start: opened, end: now() };
}

function card(title: string, sub: string, foot: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:1920px;height:1080px}
    body{display:flex;flex-direction:column;justify-content:center;align-items:center;gap:28px;
      background:linear-gradient(135deg,#042f2e,#0f766e);color:#f0fdfa;font-family:"Segoe UI",Inter,Helvetica,Arial,sans-serif}
    h1{margin:0;font-size:120px;font-weight:650;letter-spacing:-3px}
    p{margin:0;font-size:52px;opacity:.92;text-align:center}
    small{position:absolute;bottom:56px;font-size:28px;opacity:.75}
  </style></head><body><h1>${title}</h1><p>${sub}</p><small>${foot}</small></body></html>`;
}

async function renderCards(context: BrowserContext) {
  const page = await context.newPage();
  await page.setViewportSize(SIZE);
  await page.setContent(card("Earmark", "money that keeps its promise", "PayPal sandbox · fictional names"));
  await page.screenshot({ path: `${OUT}/title.png` });
  const team = process.env.DEMO_TEAM ?? "Team Earmark";
  const repo = process.env.DEMO_REPO_URL ?? "github.com/your-org/earmark";
  await page.setContent(card("Earmark", `${team}<br><span style="font-size:40px">${repo}</span>`, "Built for the PayPal AI Hackathon 2026 · sandbox only"));
  await page.screenshot({ path: `${OUT}/end.png` });
  await page.close();
}

async function main() {
  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(RAW, { recursive: true });

  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) throw new Error(`The app is not answering at ${BASE}/api/health. Start it (npm run demo does) or set DEMO_URL.`);

  const browser = await chromium.launch({ headless: process.env.HEADLESS === "1", args: [`--window-size=${VIEW.width},${VIEW.height + 120}`] });

  const cards = await browser.newContext({ viewport: SIZE });
  await renderCards(cards);
  await cards.close();

  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1.5, recordVideo: { dir: RAW, size: SIZE }, baseURL: BASE });
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  t0 = Date.now();
  page.setDefaultTimeout(30_000);

  // Start from a known state, and load the first page before the first scene so the video opens on content.
  await page.request.post("/api/admin/reset");
  await page.goto("/earmarks/em_hist_01");
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();

  let earmarkId = "";

  await scene(page, 1, async () => {
    await beat(page, 4500);
    await page.goto("/receipt/em_hist_01");
    await expect(page.getByTestId("chain-status")).toHaveText(/Chain verified/);
    await beat(page);
  });

  await scene(page, 2, async () => {
    await page.goto("/compose");
    await beat(page, 800);
    const box = page.locator("#sentence");
    await click(page, box);
    await box.pressSequentially(DEMO_SENTENCE, { delay: 22 });
    await beat(page, 700);
    await click(page, page.getByRole("button", { name: "Compile contract" }));
    await expect(page.getByText("Will be held")).toBeVisible();
    await beat(page);
  });

  await scene(page, 3, async () => {
    await click(page, page.getByRole("button", { name: "Approve contract" }));
    await beat(page);
    await holdWithPayPal(page, context);
    await page.waitForURL(/\/earmarks\/em_/, { timeout: 60_000 });
    earmarkId = page.url().split("/earmarks/")[1]!.split(/[?#]/)[0]!;
    await expect(page.getByText(/\$200\.00 is held at PayPal, not sent\./)).toBeVisible();
    await beat(page);
  });

  await scene(page, 4, async () => {
    await page.goto(`/school?ref=${earmarkId}`);
    await beat(page, 800);
    await page.getByRole("textbox", { name: "Amount 1", exact: true }).fill("120.00");
    await page.getByRole("textbox", { name: "Item 2", exact: true }).fill("Activity fee");
    await page.getByRole("textbox", { name: "Amount 2", exact: true }).fill("30.00");
    await beat(page, 900);
    await click(page, page.getByRole("button", { name: "Demo: alter it after signing" }));
    const blocked = page.getByRole("status").getByText(/blocked by R12_SIGNATURE_VALID/);
    await expect(blocked).toBeVisible({ timeout: 20_000 });
    await blocked.scrollIntoViewIfNeeded();
    await beat(page);
  });

  await scene(page, 5, async () => {
    await smoothScroll(page, 0);
    await click(page, page.getByRole("button", { name: "Issue signed invoice" }));
    const paid = page.getByRole("status").getByText(/paid\. The money reached the school/);
    await expect(paid).toBeVisible({ timeout: 30_000 });
    await paid.scrollIntoViewIfNeeded();
    await beat(page);
    await smoothScroll(page, 2000);
    await beat(page);
  });

  await scene(page, 6, async () => {
    await page.goto(`/earmarks/${earmarkId}`);
    await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
    await beat(page, 2500);
    await click(page, page.getByRole("button", { name: "Open trace" }));
    const trace = page.getByRole("dialog", { name: "Trace" });
    await expect(trace.getByText(/pay_.+:capture/).first()).toBeVisible();
    await beat(page);
    await trace.getByText("PayPal Agent Toolkit").first().scrollIntoViewIfNeeded();
    await beat(page);
  });

  await scene(page, 7, async () => {
    await page.goto(`/r/${earmarkId}`);
    await expect(page.getByRole("heading", { name: /fees were paid/ })).toBeVisible();
    await beat(page, 2500);
    await click(page, page.getByRole("button", { name: "Kiswahili" }));
    await beat(page);
    await click(page, page.getByRole("button", { name: "Thibitisha nimeona" }));
    await expect(page.getByText(/Asante/)).toBeVisible();
    await beat(page);
  });

  await scene(page, 8, async () => {
    await page.goto("/lab");
    await beat(page, 1000);
    await click(page, page.getByRole("button", { name: "Run all" }));
    await expect(page.getByText("7/7 attacks blocked")).toBeVisible({ timeout: 60_000 });
    await beat(page);
    await smoothScroll(page, 600);
    await beat(page);
    await smoothScroll(page, 0);
  });

  await scene(page, 9, async () => {
    await page.goto(`/receipt/${earmarkId}`);
    await expect(page.getByTestId("chain-status")).toHaveText(/Chain verified/);
    await beat(page, 2500);
    await click(page, page.getByRole("button", { name: "Simulate tampering (demo)" }));
    await expect(page.getByTestId("chain-status")).toHaveText(/Broken at event #\d+/);
    await beat(page, 2500);
  });

  timings.end = Math.round(now() * 1000) / 1000;
  const video = page.video();
  await context.close(); // flushes the video file
  timings.video = ((await video?.path()) ?? "").replace(/\\/g, "/");
  await browser.close();

  writeFileSync(join(OUT, "timings.json"), `${JSON.stringify({ ...timings, recordedAt: new Date().toISOString(), base: BASE }, null, 2)}\n`);
  console.log(`record: ${timings.scenes.length} scenes, ${timings.end.toFixed(1)}s of video → ${timings.video}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
