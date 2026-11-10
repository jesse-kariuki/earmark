import { test } from "@playwright/test";
import { freshHeldEarmark } from "./helpers";

// Not an assertion test: captures README screenshots (run with SCREENS=1).
test.skip(!process.env.SCREENS, "screenshots only on demand");
test("screens", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  const shot = async (path: string, name: string) => {
    await page.goto(path);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: true });
  };
  await shot("/", "home");
  await page.goto("/compose");
  await page.getByRole("button", { name: /Pay Brian's Term 1 fees/ }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "docs/screenshots/compose.png", fullPage: true });
  const id = await freshHeldEarmark(request);
  await request.post("/api/school/issue", { data: { earmarkRef: id, lineItems: [{ label: "Tuition", amountMinor: 25000 }, { label: "Boarding", amountMinor: 10000 }] } });
  await shot(`/earmarks/${id}`, "earmark");
  await page.getByRole("button", { name: "Open trace" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "docs/screenshots/trace.png" });
  const up = await (await request.post(`/api/earmarks/em_demo/invoices/upload`, { data: { sample: "05" } })).json();
  if (up.data?.invoiceId) await shot(`/invoices/${up.data.invoiceId}`, "invoice-blocked");
  await shot("/school", "school");
  await shot(`/receipt/${id}`, "receipt");
  await shot("/ledger", "ledger");
  await page.goto("/lab");
  await page.getByRole("button", { name: "Run all" }).click();
  await page.getByText("7/7 attacks blocked").waitFor({ timeout: 30000 });
  await page.screenshot({ path: "docs/screenshots/lab.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(`/r/${id}`, "recipient");
});
