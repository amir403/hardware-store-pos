import { expect, test, type Page } from "@playwright/test";

// A full counter sale, then a void, so the stock ends where it started and the
// test can run against the demo data. Needs the seeded admin and Claw Hammer.
const SKU = "HT-HAM-016";

async function stockOf(page: Page, sku: string): Promise<number> {
  await page.goto(`/products?q=${sku}`);
  const row = page.locator("tbody tr", { hasText: sku }).first();
  const text = await row.locator("td").nth(3).innerText();
  return Number(text.replace(/[^\d.]/g, ""));
}

test("cash sale takes stock out and a void puts it back", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/login");
  await page.getByPlaceholder("you@store.com").fill("admin@store.com");
  await page.locator('input[type="password"]').fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  // The first dashboard render after login can be slow in dev; wait for the app itself.
  await expect(page.getByRole("link", { name: "Products" }).first()).toBeVisible({ timeout: 60_000 });

  const before = await stockOf(page, SKU);
  expect(before).toBeGreaterThan(0);

  // Scan the SKU the way a barcode reader would: type it, then Enter.
  await page.goto("/pos");
  const search = page.getByPlaceholder(/Scan barcode/);
  await search.fill(SKU);
  await search.press("Enter");
  await page.getByRole("button", { name: /Complete sale/ }).click();

  await page.waitForURL(/\/sales\/[^/?]+/);
  const saleUrl = page.url().split("?")[0];
  try {
    await expect(page.getByText(/INV-\d{8}-\d{4}/).first()).toBeVisible();
    expect(await stockOf(page, SKU)).toBe(before - 1);
  } finally {
    // Always undo the sale, even when a check above fails, so the books and
    // stock are left as they were.
    await page.goto(saleUrl);
    await page.getByPlaceholder(/Reason for void/i).fill("e2e test sale");
    await page.getByRole("button", { name: /Void/ }).click();
    await expect(page.getByText(/voided/i).first()).toBeVisible({ timeout: 30_000 });
  }
  expect(await stockOf(page, SKU)).toBe(before);
});

test("the cart never holds more than is in stock", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("you@store.com").fill("admin@store.com");
  await page.locator('input[type="password"]').fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: "Products" }).first()).toBeVisible({ timeout: 60_000 });

  const stock = await stockOf(page, SKU);
  await page.goto("/pos");
  const search = page.getByPlaceholder(/Scan barcode/);
  await search.fill(SKU);
  await search.press("Enter");

  const qty = page.locator("tbody tr", { hasText: "Claw Hammer" }).locator('input[type="number"]').first();
  await qty.fill(String(stock + 50));
  await expect(qty).toHaveValue(String(stock));
  await expect(page.getByText(/only .* available/).first()).toBeVisible();
});
