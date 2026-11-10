import { expect, test } from "@playwright/test";

// M2 acceptance: the browser flow ends with a stored authorization id (mock PayPal, fixture AI).
test("compose → compile → approve → hold (mock) → held Earmark", async ({ page, request }) => {
  await page.goto("/compose");
  await page.getByRole("button", { name: /Pay Brian's Term 1 fees/ }).click();

  await expect(page.getByText("ins_lakeview")).toBeVisible();
  await expect(page.getByText("Will be held")).toBeVisible();

  await page.getByRole("button", { name: "Approve contract" }).click();
  await page.getByRole("button", { name: "Hold with PayPal (mock)" }).click();

  await page.waitForURL(/\/earmarks\/em_/);
  await expect(page.getByText("Held", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("$400.00 is held at PayPal, not sent.")).toBeVisible();

  const id = page.url().split("/earmarks/")[1]!;
  const detail = await (await request.get(`/api/earmarks/${id}`)).json();
  expect(detail.data.earmark).toMatchObject({ status: "held", authorizationId: expect.stringMatching(/^AUTH-MOCK-/) });
  expect(detail.data.money).toMatchObject({ heldMinor: 40000, sentMinor: 0, releasedMinor: 0 });
});

test("a lookalike payee cannot be approved until a verified institution is picked", async ({ page }) => {
  await page.goto("/compose");
  await page.getByRole("button", { name: /Pay Lakeview Secondary Schools Ltd/ }).click();
  await expect(page.getByText(/not verified/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve contract" })).toBeDisabled();
  await page.getByLabel("Choose the verified institution").selectOption("ins_lakeview");
  await expect(page.getByRole("button", { name: "Approve contract" })).toBeEnabled();
});

test("pause switch on the demo Earmark", async ({ page }) => {
  await page.goto("/earmarks/em_demo");
  await page.getByRole("switch", { name: /Pause payments/ }).click();
  await expect(page.getByRole("switch", { name: /resume payments/ })).toBeVisible();
  await page.getByRole("switch", { name: /resume payments/ }).click();
  await expect(page.getByRole("switch", { name: /Pause payments/ })).toBeVisible();
});
