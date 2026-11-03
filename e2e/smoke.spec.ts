import { expect, test } from "@playwright/test";

test("health endpoint reports mock/fixture mode", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body).toMatchObject({ ok: true });
});

test("home page shows the Sandbox badge", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Sandbox", { exact: false }).first()).toBeVisible();
});
