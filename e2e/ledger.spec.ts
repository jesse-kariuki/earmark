import { expect, test } from "@playwright/test";

// M8 acceptance: filter, sort, expand work on seeded data; from any row you reach the full trace in ≤ 2 clicks.
test("ledger: quick filter, Blocked attempts, sort, and row → trace in two clicks", async ({ page }) => {
  await page.goto("/ledger");
  const grid = page.getByTestId("ledger-grid");
  const rows = grid.locator(".ag-center-cols-container .ag-row");
  await expect(rows.first()).toBeVisible();
  const all = await rows.count();
  expect(all).toBeGreaterThanOrEqual(9);

  await page.getByPlaceholder(/Search beneficiary/).fill("Riverbend");
  await expect.poll(() => rows.count()).toBeLessThan(all);
  await page.getByPlaceholder(/Search beneficiary/).fill("");

  await page.getByRole("button", { name: "Blocked attempts" }).click();
  await expect.poll(() => rows.count()).toBe(2); // the seeded duplicate and lookalike attempts
  await page.getByRole("button", { name: "Blocked attempts" }).click();

  await grid.getByText("Cap", { exact: true }).click(); // sort by cap
  await expect(grid.locator(".ag-header-cell[col-id=capMinor] .ag-sort-ascending-icon")).toBeVisible();

  await page.screenshot({ path: "test-results/ledger.png", fullPage: true });

  await rows.filter({ hasText: "Achieng Otieno" }).first().click(); // click 1
  await expect(page.getByRole("complementary", { name: "Earmark detail" }).getByText(/R04/)).toBeVisible();
  await page.getByRole("button", { name: "Open trace" }).click(); // click 2
  await expect(page.getByRole("dialog", { name: "Trace" }).getByText(/Blocked by R04/)).toBeVisible();
});
