import { expect, test } from "@playwright/test";
import { freshHeldEarmark } from "./helpers";

// M5 vertical slice in the browser (mock PayPal, fixture AI): upload → approve → Guardian → capture → payout → paid.
test("clean invoice → approve → school paid, remainder released, trace shows the PayPal Request-Id", async ({ page, request }) => {
  const id = await freshHeldEarmark(request);
  await page.goto(`/earmarks/${id}`);
  await page.getByRole("tab", { name: "invoices" }).click();
  await page.getByRole("button", { name: "Clean invoice · $350" }).click();
  await page.waitForURL(/\/invoices\/inv_/);
  await expect(page.getByText("Needs your approval")).toBeVisible();

  await page.getByRole("button", { name: "Approve payment" }).click();
  await expect(page.getByText(/Paid · \$350\.00 reached the school/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Open trace" }).click();
  const trace = page.getByRole("dialog", { name: "Trace" });
  await expect(trace.getByText(/pay_.+:capture/)).toBeVisible();
  await expect(trace.getByText("No tools").first()).toBeVisible();
  await expect(trace.getByText("PayPal Agent Toolkit").first()).toBeVisible();

  const detail = await (await request.get(`/api/earmarks/${id}`)).json();
  expect(detail.data.earmark.status).toBe("paid");
  expect(detail.data.money).toMatchObject({ heldMinor: 0, sentMinor: 35000, releasedMinor: 5000 });
});
