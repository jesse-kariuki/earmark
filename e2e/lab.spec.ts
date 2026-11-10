import { expect, test } from "@playwright/test";

const EXPECTED: Record<string, string> = {
  "swapped-account": "R05",
  "inflated-amount": "R07",
  "reused-invoice": "R09",
  "expired-earmark": "R02",
  "prompt-injection": "R13",
  "forged-signature": "R12",
  "agent-overpay": "R17",
};

// M9 acceptance: "Run all" → every card blocked, each naming its rule.
test("Attack Lab: run all → every attack blocked by its rule", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Run all" }).click();
  for (const [id, rule] of Object.entries(EXPECTED)) {
    await expect(page.getByTestId(`scenario-${id}`).getByTestId("blocked-by")).toContainText(`Blocked by ${rule}`, { timeout: 20_000 });
  }
  await expect(page.getByText("7/7 attacks blocked")).toBeVisible();
  await page.getByTestId("scenario-prompt-injection").getByRole("button", { name: "Open trace" }).click();
  await expect(page.getByRole("dialog", { name: "Trace" }).getByText("No tools").first()).toBeVisible();
});
