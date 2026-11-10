import { expect, test } from "@playwright/test";
import { freshHeldEarmark } from "./helpers";

// M7 acceptance: receipt shows verified → tamper → broken at the edited event.
test("proof receipt verifies in the browser, then breaks at the tampered event", async ({ page, request }) => {
  const id = await freshHeldEarmark(request);
  // Pay it through the school console API so there is a capture to tamper with.
  await request.post("/api/school/issue", { data: { earmarkRef: id, lineItems: [{ label: "Tuition", amountMinor: 25000 }, { label: "Boarding", amountMinor: 10000 }] } });

  await page.goto(`/receipt/${id}`);
  await expect(page.getByTestId("chain-status")).toHaveText(/Chain verified: \d+ events/);
  await page.getByRole("button", { name: "Simulate tampering (demo)" }).click();
  await expect(page.getByTestId("chain-status")).toHaveText(/Broken at event #\d+/);

  const events = (await (await request.get(`/api/earmarks/${id}/events`)).json()).data as { seq: number; type: string }[];
  const captured = events.find((e) => e.type === "paypal.captured")!;
  await expect(page.getByTestId("chain-status")).toHaveText(new RegExp(`Broken at event #${captured.seq} `));
});

// M7 acceptance: recipient page passes a 360px check (no horizontal scroll, confirm button visible and working).
test.describe("recipient view at 360px", () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test("fits the screen and confirms", async ({ page, request }) => {
    const id = await freshHeldEarmark(request);
    await request.post("/api/school/issue", { data: { earmarkRef: id, lineItems: [{ label: "Tuition", amountMinor: 35000 }] } });
    await page.goto(`/r/${id}`);
    await expect(page.getByRole("heading", { name: /fees were paid/ })).toBeVisible();
    await expect(page.getByText("$350.00").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: "test-results/recipient-360.png", fullPage: true });
    await page.getByRole("button", { name: "Kiswahili" }).click();
    await expect(page.getByText(/imelipwa kwa Lakeview Secondary School/)).toBeVisible();
    await page.getByRole("button", { name: "Thibitisha nimeona" }).click();
    await expect(page.getByText(/Asante/)).toBeVisible();
  });
});
