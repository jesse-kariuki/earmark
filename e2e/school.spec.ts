import { expect, test } from "@playwright/test";
import { freshHeldEarmark } from "./helpers";

// M6 in the browser: the school issues a signed invoice → paid with no upload; an altered copy → R12.
test("school console: signed invoice is paid; an altered one is blocked by R12", async ({ page, request }) => {
  const id = await freshHeldEarmark(request);
  await page.goto(`/school?ref=${id}`);
  await page.getByRole("button", { name: "Demo: alter it after signing" }).click();
  await expect(page.getByRole("status").getByText(/blocked by R12_SIGNATURE_VALID/)).toBeVisible();

  await page.getByRole("button", { name: "Issue signed invoice" }).click();
  await expect(page.getByRole("status").getByText(/paid\. The money reached the school/)).toBeVisible({ timeout: 15_000 });
  const detail = await (await request.get(`/api/earmarks/${id}`)).json();
  expect(detail.data.money).toMatchObject({ heldMinor: 0, sentMinor: 35000, releasedMinor: 5000 });
});
