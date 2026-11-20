import { expect, test } from "@playwright/test";

test("wrong password is refused, right one lands on the dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("you@store.com").fill("admin@store.com");
  await page.locator('input[type="password"]').fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible({ timeout: 60_000 });
  // A wrong password must not wipe the email that was typed.
  await expect(page.getByPlaceholder("you@store.com")).toHaveValue("admin@store.com");

  await page.locator('input[type="password"]').fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 60_000 });
  await expect(page.getByRole("link", { name: "Products" }).first()).toBeVisible();
});
