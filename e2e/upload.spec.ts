import { expect, test } from "@playwright/test";
import { freshHeldEarmark } from "./helpers";

// M4 acceptance: uploading fixture 05 shows BLOCK with R05 in the UI.
test("upload the swapped-account invoice → Blocked by R05", async ({ page, request }) => {
  const id = await freshHeldEarmark(request);
  await page.goto(`/earmarks/${id}`);
  await page.getByRole("tab", { name: "invoices" }).click();
  await page.getByRole("button", { name: "Swapped payout account" }).click();

  await page.waitForURL(/\/invoices\/inv_/);
  await expect(page.getByRole("status").getByText("Blocked", { exact: false })).toBeVisible();
  const blocking = page.locator("[data-blocking=true]");
  await expect(blocking).toContainText("R05");
  await expect(blocking).toContainText("Payout account matches registry");
  await expect(page.getByRole("button", { name: "Approve payment" })).toHaveCount(0);
});
