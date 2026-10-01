import { expect, test } from "@playwright/test";

test("mobile layout: bottom navigation and command box", async ({ page }) => {
  const email = `m${Date.now()}@test.local`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Mobile-pass-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("I'll explore myself").click();
  const nav = page.locator("nav.fixed");
  await expect(nav.getByText("Home")).toBeVisible();
  await expect(nav.getByText("Approvals")).toBeVisible();
  await nav.getByText("Tasks").click();
  await expect(page).toHaveURL(/\/tasks/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
