// Records the demo (demo/script.md) with Playwright: headed Chromium at 1920x1080 with video on.
// Each scene starts on a timestamp written to demo/out/timings.json, pauses ~1.2 s after every visible change,
// and is held until its narration clip (demo/out/audio/durations.json) has finished.
// PayPal: mock mode clicks the mock button; sandbox mode drives the real popup with
// PAYPAL_SANDBOX_BUYER_EMAIL / PAYPAL_SANDBOX_BUYER_PASSWORD (never hardcoded), and films the buyer's real
// sandbox.paypal.com balance before the hold, after it, after the blocked attempt and after payment.
// Env: DEMO_URL (default http://localhost:3200), HEADLESS=1, DEMO_TEAM, DEMO_REPO_URL (default: the git remote).
// `--cards-only` re-renders the title and end cards and exits (npm run demo -- --rebuild uses it).
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Browser, type BrowserContext, chromium, expect, type Locator, type Page } from "@playwright/test";
import { DEMO_SENTENCE } from "./config";
import { estimateSeconds, NARRATION_LEAD, parseScript } from "./script";
import { readDurations, type Timings } from "./tools";

const BASE = (process.env.DEMO_URL ?? "http://localhost:3200").replace(/\/$/, "");
const OUT = "demo/out";
const RAW = `${OUT}/raw`;
const PAUSE = 1200;
const SIZE = { width: 1920, height: 1080 };
// The app is laid out for laptop widths: record 1280x720 CSS pixels at 1.5x, which renders a sharp 1920x1080 frame
// with readable text (a 1920-wide viewport leaves the UI small in the middle of the screen).
const VIEW = { width: 1280, height: 720 };

const scenes = parseScript();
const durations = readDurations();
const timings: Timings = { video: "", scenes: [], end: 0 };
let t0 = 0;
const now = () => (Date.now() - t0) / 1000;
let current: Page | undefined;

const PAYPAL_WEB = "https://www.sandbox.paypal.com";
/** Buyer balance readings taken from sandbox.paypal.com during the recording (minor units). */
const balances: { label: string; availableMinor: number; at: number }[] = [];

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

/** The school's genuine invoice: Tuition $120 + Activity fee $30 = $150 (under the $200 cap). */
async function fillInvoice(page: Page) {
  await page.getByRole("textbox", { name: "Amount 1", exact: true }).fill("120.00");
  await page.getByRole("textbox", { name: "Item 2", exact: true }).fill("Activity fee");
  await page.getByRole("textbox", { name: "Amount 2", exact: true }).fill("30.00");
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

function buyerCredentials() {
  const email = process.env.PAYPAL_SANDBOX_BUYER_EMAIL;
  const password = process.env.PAYPAL_SANDBOX_BUYER_PASSWORD;
  if (!email || !password) throw new Error("PayPal sandbox mode: set PAYPAL_SANDBOX_BUYER_EMAIL and PAYPAL_SANDBOX_BUYER_PASSWORD (a sandbox buyer account).");
  return { email, password };
}

/** PayPal's two-step login. Its fields animate in, so each gets a moment to settle before typing, otherwise the
 *  input is lost and Log In never lands. Also handles a remembered email (password only). */
async function paypalLogin(p: Page) {
  const { email, password } = buyerCredentials();
  const emailBox = p.locator("#email");
  const pw = p.locator("#password");
  await emailBox.or(pw).first().waitFor({ timeout: 45_000 });
  if (await emailBox.isVisible()) {
    await p.waitForTimeout(1000);
    await emailBox.fill(email);
    const next = p.locator("#btnNext");
    if (await next.isVisible()) await next.click();
  }
  await pw.waitFor({ state: "visible", timeout: 30_000 });
  await p.waitForTimeout(1500);
  await pw.fill(password);
  await p.locator("#btnLogin").click();
}

async function holdWithPayPal(page: Page, context: BrowserContext) {
  const mock = page.getByRole("button", { name: "Hold with PayPal (mock)" });
  if (await mock.isVisible()) {
    await click(page, mock);
    return;
  }
  const button = page.frameLocator('iframe[title="PayPal"]').first().locator('[data-funding-source="paypal"]').first();
  await button.waitFor({ timeout: 30_000 });
  const opened = now();
  const [popup] = await Promise.all([context.waitForEvent("page"), click(page, button)]);
  await popup.waitForLoadState("domcontentloaded");

  // Signed in already (the session from paypalSession) goes straight to review; otherwise log in first.
  // Newer one-page review: #one-time-cta ("Pay"); older two-step review: submit-button-initial / payment-submit-btn.
  const approve = popup.locator('#one-time-cta, [data-testid="submit-button-initial"], #payment-submit-btn').first();
  await approve
    .or(popup.locator("#email, #password"))
    .first()
    .waitFor({ timeout: 45_000 })
    .catch(async (e: unknown) => {
      await popup.screenshot({ path: `${OUT}/popup-fail.png` }).catch(() => {});
      const buttons = await popup.locator("button:visible, input:visible").evaluateAll((els) => els.map((e) => `${e.tagName}#${e.id} [${(e as HTMLElement).dataset.testid ?? ""}] ${(e as HTMLElement).innerText?.trim().slice(0, 40) ?? ""}`)).catch(() => []);
      console.error(`record: unexpected PayPal popup at ${popup.url()} (screenshot: ${OUT}/popup-fail.png)\n  ${buttons.join("\n  ")}`);
      throw e;
    });
  if (!(await approve.isVisible())) await paypalLogin(popup);
  await approve.waitFor({ timeout: 60_000 });
  // Pay from the PayPal balance, so the hold shows on the balance we film.
  const balance = popup.locator('[data-testid="BALANCEUSD-funding-option"]');
  if ((await balance.count()) && !(await balance.isChecked())) await balance.check({ force: true });
  await beat(popup, 800);
  await approve.click();
  await popup.waitForEvent("close", { timeout: 60_000 });
  const videoPath = await popup.video()?.path();
  if (videoPath) timings.popup = { video: videoPath.replace(/\\/g, "/"), start: opened, end: now() };
}

/** Sign the buyer in to sandbox.paypal.com in an unrecorded context; the recording reuses the session. */
async function paypalSession(browser: Browser) {
  const ctx = await browser.newContext({ viewport: VIEW });
  const p = await ctx.newPage();
  await p.goto(`${PAYPAL_WEB}/myaccount/summary`);
  if (!p.url().includes("/myaccount")) await paypalLogin(p);
  await p.getByText("PayPal balance").first().waitFor({ timeout: 60_000 });
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

const BALANCE_TEXT = /^US\$[\d,]+\.\d{2}$/;

function parseUsd(text: string): number {
  const m = /US\$([\d,]+)\.(\d{2})/.exec(text);
  if (!m) throw new Error(`No balance in "${text}"`);
  return Number(m[1]!.replace(/,/g, "")) * 100 + Number(m[2]);
}

const signedUsd = (minor: number) => `${minor < 0 ? "−" : minor > 0 ? "+" : ""}$${(Math.abs(minor) / 100).toFixed(2)}`;

/** Film the buyer's real balance on sandbox.paypal.com, with a banner naming the account and the change since the
 *  first reading (computed from what PayPal shows), then go back to `back`. */
async function showPayPalBalance(page: Page, label: string, expectDeltaMinor: number | null, back: string) {
  await page.goto(`${PAYPAL_WEB}/myaccount/summary`);
  if (!page.url().includes("/myaccount")) await paypalLogin(page);
  const amount = page.getByText(BALANCE_TEXT).first();
  await amount.waitFor({ timeout: 60_000 });
  // PayPal keeps polling (never network-idle); give the recent-activity list a moment to render instead.
  await page.getByText("Recent activity").first().waitFor({ timeout: 4000 }).catch(() => {});
  // Close PayPal's cookie banner so it doesn't cover the page (sandbox only; accepting changes nothing real).
  const cookies = page.getByRole("button", { name: "Yes, I accept" });
  if (await cookies.isVisible().catch(() => false)) await cookies.click().catch(() => {});
  const available = parseUsd(await amount.innerText());
  const first = balances[0]?.availableMinor ?? available;
  balances.push({ label, availableMinor: available, at: Math.round(now() * 1000) / 1000 });
  const delta = available - first;
  const change = balances.length > 1 ? `Available ${signedUsd(delta)} since the start` : "Starting balance";
  console.log(`record: PayPal balance (${label}): US$${(available / 100).toFixed(2)} · ${change}`);
  if (expectDeltaMinor !== null && delta !== expectDeltaMinor) {
    console.warn(`record: expected ${signedUsd(expectDeltaMinor)} since the start, PayPal shows ${signedUsd(delta)}`);
  }
  await page.evaluate(
    ({ label, change, pattern }) => {
      const re = new RegExp(pattern);
      const bar = document.createElement("div");
      bar.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;z-index:2147483646;display:flex;justify-content:space-between;align-items:center;gap:24px;padding:14px 28px;background:#042f2e;color:#f0fdfa;font:600 17px/1.35 'Segoe UI',Arial,sans-serif;box-shadow:0 -4px 18px rgba(0,0,0,.25)";
      bar.innerHTML = `<span>Live · Grace's PayPal sandbox account (sandbox.paypal.com)<br><span style="font-weight:400;opacity:.85">${label}</span></span><span style="font-size:22px">${change}</span>`;
      // On <html>, not <body>: PayPal re-renders <body> and would drop it (the demo cursor lives there too).
      document.documentElement.appendChild(bar);
      const el = [...document.querySelectorAll<HTMLElement>("body *")].find((e) => e.children.length === 0 && re.test(e.textContent?.trim() ?? ""));
      // The balance card: the nearest ancestor that also holds its "Transfer Funds" button.
      let card: HTMLElement | null | undefined = el;
      while (card && !card.textContent?.includes("Transfer Funds")) card = card.parentElement;
      if (card) {
        // A positioned ring over the balance card, also on <html> so a re-render cannot remove it.
        const r = card.getBoundingClientRect();
        const ring = document.createElement("div");
        ring.style.cssText = `position:absolute;z-index:2147483645;pointer-events:none;left:${r.left + scrollX - 8}px;top:${r.top + scrollY - 8}px;width:${r.width + 16}px;height:${r.height + 16}px;border:4px solid rgb(13,148,136);border-radius:20px`;
        document.documentElement.appendChild(ring);
      }
    },
    { label, change, pattern: BALANCE_TEXT.source },
  );
  const box = await amount.boundingBox();
  // Point just under the amount, so the cursor never covers a digit.
  if (box) await page.mouse.move(box.x + box.width * 0.3, box.y + box.height + 40, { steps: 18 });
  await beat(page, 3500);
  await page.goto(back);
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

/** The git remote as "github.com/owner/repo", for the end card. */
function originUrl(): string | undefined {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
    return url.replace(/^git@([^:]+):/, "$1/").replace(/^https?:\/\//, "").replace(/\.git$/, "") || undefined;
  } catch {
    return undefined;
  }
}

async function renderCards(context: BrowserContext) {
  const page = await context.newPage();
  await page.setViewportSize(SIZE);
  await page.setContent(card("Earmark", "money that keeps its promise", "PayPal sandbox · fictional names"));
  await page.screenshot({ path: `${OUT}/title.png` });
  const team = process.env.DEMO_TEAM ?? "Team Earmark";
  const repo = process.env.DEMO_REPO_URL ?? originUrl() ?? "github.com/your-org/earmark";
  await page.setContent(card("Earmark", `${team}<br><span style="font-size:40px">${repo}</span>`, "Built for the PayPal AI Hackathon 2026 · sandbox only"));
  await page.screenshot({ path: `${OUT}/end.png` });
  await page.close();
}

async function main() {
  if (process.argv.includes("--cards-only")) {
    const browser = await chromium.launch({ headless: true });
    await renderCards(await browser.newContext({ viewport: SIZE }));
    await browser.close();
    console.log("record: title and end cards re-rendered");
    return;
  }
  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(RAW, { recursive: true });

  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) throw new Error(`The app is not answering at ${BASE}/api/health. Start it (npm run demo does) or set DEMO_URL.`);

  const browser = await chromium.launch({ headless: process.env.HEADLESS === "1", args: [`--window-size=${VIEW.width},${VIEW.height + 120}`] });

  const cards = await browser.newContext({ viewport: SIZE });
  await renderCards(cards);
  await cards.close();

  // Sandbox mode films the buyer's real PayPal balance; the mock has no account to show.
  const { paypalMode } = (await health.json()) as { paypalMode?: string };
  const live = paypalMode === "sandbox";
  if (!live) console.warn(`record: PAYPAL_MODE=${paypalMode}: the PayPal balance shots are skipped (they need the sandbox)`);
  const storageState = live ? await paypalSession(browser) : undefined;

  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1.5, recordVideo: { dir: RAW, size: SIZE }, baseURL: BASE, storageState });
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  current = page;
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
    if (live) await showPayPalBalance(page, "Before: nothing held", null, "/compose");
    else await page.goto("/compose");
  });

  await scene(page, 3, async () => {
    if (!page.url().endsWith("/compose")) await page.goto("/compose");
    await beat(page, 800);
    const box = page.locator("#sentence");
    await click(page, box);
    await box.pressSequentially(DEMO_SENTENCE, { delay: 22 });
    await beat(page, 700);
    await click(page, page.getByRole("button", { name: "Compile contract" }));
    await expect(page.getByText("Will be held")).toBeVisible();
    await beat(page);
  });

  await scene(page, 4, async () => {
    await click(page, page.getByRole("button", { name: "Approve contract" }));
    await beat(page);
    await holdWithPayPal(page, context);
    await page.waitForURL(/\/earmarks\/em_/, { timeout: 60_000 });
    earmarkId = page.url().split("/earmarks/")[1]!.split(/[?#]/)[0]!;
    await expect(page.getByText(/\$200\.00 is held at PayPal, not sent\./)).toBeVisible();
    await beat(page);
    if (live) await showPayPalBalance(page, "After the hold: $200.00 held, nothing sent", -20000, `/school?ref=${earmarkId}`);
  });

  await scene(page, 5, async () => {
    await page.goto(`/school?ref=${earmarkId}`);
    await beat(page, 800);
    await fillInvoice(page);
    await beat(page, 900);
    await click(page, page.getByRole("button", { name: "Demo: alter it after signing" }));
    const blocked = page.getByRole("status").getByText(/blocked by R12_SIGNATURE_VALID/);
    await expect(blocked).toBeVisible({ timeout: 20_000 });
    await blocked.scrollIntoViewIfNeeded();
    await beat(page);
    if (live) {
      await showPayPalBalance(page, "After the altered invoice was blocked: no money moved", -20000, `/school?ref=${earmarkId}`);
      await expect(page.getByRole("button", { name: "Issue signed invoice" })).toBeVisible();
    }
  });

  await scene(page, 6, async () => {
    await smoothScroll(page, 0);
    // The balance shot reloaded the school console, so the genuine invoice lines are entered again.
    if (live) await fillInvoice(page);
    await click(page, page.getByRole("button", { name: "Issue signed invoice" }));
    // Mock confirms the payout at once; a real sandbox payout starts PENDING ("payout sent, waiting for PayPal to confirm").
    const paid = page.getByRole("status").getByText(/paid\. The money reached the school|payout sent, waiting for PayPal to confirm/);
    await expect(paid).toBeVisible({ timeout: 60_000 });
    await paid.scrollIntoViewIfNeeded();
    await beat(page);
    await smoothScroll(page, 2000);
    await beat(page);
  });

  await scene(page, 7, async () => {
    // Each load of the Earmark page asks PayPal for the payout status (no webhook on localhost), so reload until paid.
    const paidChip = page.getByText("Paid", { exact: true }).first();
    for (let i = 0; ; i++) {
      await page.goto(`/earmarks/${earmarkId}`);
      if (await paidChip.isVisible()) break;
      if (i === 20) throw new Error("PayPal did not confirm the payout within ~1 minute");
      await page.waitForTimeout(3000);
    }
    await beat(page, 2500);
    await click(page, page.getByRole("button", { name: "Open trace" }));
    const trace = page.getByRole("dialog", { name: "Trace" });
    await expect(trace.getByText(/pay_.+:capture/).first()).toBeVisible();
    await beat(page);
    await trace.getByText("PayPal Agent Toolkit").first().scrollIntoViewIfNeeded();
    await beat(page);
    if (live) await showPayPalBalance(page, "After payment: $150.00 to the school, $50.00 hold released", -15000, `/earmarks/${earmarkId}`);
  });

  await scene(page, 8, async () => {
    await page.goto(`/r/${earmarkId}`);
    await expect(page.getByRole("heading", { name: /fees were paid/ })).toBeVisible();
    await beat(page, 2500);
    await click(page, page.getByRole("button", { name: "Kiswahili" }));
    await beat(page);
    await click(page, page.getByRole("button", { name: "Thibitisha nimeona" }));
    await expect(page.getByText(/Asante/)).toBeVisible();
    await beat(page);
  });

  await scene(page, 9, async () => {
    await page.goto("/lab");
    await beat(page, 1000);
    await click(page, page.getByRole("button", { name: "Run all" }));
    await expect(page.getByText("7/7 attacks blocked")).toBeVisible({ timeout: 60_000 });
    await beat(page);
    await smoothScroll(page, 600);
    await beat(page);
    await smoothScroll(page, 0);
  });

  await scene(page, 10, async () => {
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

  writeFileSync(join(OUT, "timings.json"), `${JSON.stringify({ ...timings, balances, recordedAt: new Date().toISOString(), base: BASE }, null, 2)}\n`);
  console.log(`record: ${timings.scenes.length} scenes, ${timings.end.toFixed(1)}s of video → ${timings.video}`);
}

main().catch(async (e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  // What the page showed when it failed, for debugging a run that cannot be watched.
  await current?.screenshot({ path: `${OUT}/record-fail.png`, fullPage: true }).then(
    () => console.error(`record: screenshot of the failing page: ${OUT}/record-fail.png`),
    () => {},
  );
  process.exit(1);
});
