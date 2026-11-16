import { expect, test, type Page } from "../../customer/e2e/r2/pw";
import { CONSOLE_ORIGIN, consoleStatePath, fixture, shot } from "../../customer/e2e/r2/lite";

/*
 * Console journeys (R2-11): sign in, Today, a client workspace, Payments with the refund dialog, Compliance. They run
 * against a console on CONSOLE_ORIGIN with the audit account that sign-up plus `pnpm staff:create` made. Read-only: the
 * refund dialog is opened and cancelled, never confirmed.
 */

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) await shot(page, `fail-console-${info.project.name}-${info.title.replace(/\W+/g, "-").slice(0, 40)}`);
});

async function noSideScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "no sideways scroll").toBeLessThanOrEqual(1);
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("sign in with the audit account lands on Today", async ({ page }) => {
    const account = fixture("audit");
    await page.goto(`${CONSOLE_ORIGIN}/payments`);
    await expect(page, "a signed-out visit goes to sign in").toHaveURL(/\/login/);
    await page.getByLabel(/email/i).fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
    await noSideScroll(page);
  });
});

test.describe("signed in", () => {
  test.use({ storageState: consoleStatePath });

  test("Today lists what needs someone", async ({ page }) => {
    await page.goto(`${CONSOLE_ORIGIN}/`);
    await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible();
    await expect(page.getByText(/things? need someone today|Nothing needs/)).toBeVisible();
    await noSideScroll(page);
    await shot(page, `console-today-${test.info().project.name}`);
  });

  test("a client workspace opens from Clients and mirrors the customer status", async ({ page }) => {
    await page.goto(`${CONSOLE_ORIGIN}/clients`);
    await expect(page.getByRole("heading", { name: "Clients" }).first()).toBeVisible();
    const business = fixture("audit").businessName;
    await page.getByText(business).first().click();
    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}/);
    await expect(page.getByText(business).first()).toBeVisible();
    await noSideScroll(page);
    for (const tab of ["website", "services", "billing", "requests", "people"]) {
      const response = await page.goto(page.url().replace(/\/clients\/([0-9a-f-]{36}).*/, `/clients/$1/${tab}`));
      expect(response?.status(), `${tab} tab`).toBeLessThan(400);
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("Payments lists the month and the refund dialog opens and closes", async ({ page }) => {
    await page.goto(`${CONSOLE_ORIGIN}/payments`);
    await expect(page.getByRole("heading", { name: "Payments" }).first()).toBeVisible();
    await expect(page.getByText("Collected").first()).toBeVisible();
    await noSideScroll(page);
    await page.getByRole("link", { name: "Open" }).first().click();
    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}\/billing/);
    const refund = page.getByRole("button", { name: /Refund/ }).first();
    await expect(refund, "a captured payment offers a refund").toBeVisible();
    await refund.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Cancel|Go back|Keep/ }).first()).toBeVisible();
    await shot(page, `console-refund-dialog-${test.info().project.name}`);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(refund, "focus returns to the trigger").toBeFocused();
  });

  test("Compliance: privacy requests and the access log", async ({ page }) => {
    await page.goto(`${CONSOLE_ORIGIN}/privacy-requests`);
    await expect(page.getByRole("heading", { name: "Privacy requests" }).first()).toBeVisible();
    await noSideScroll(page);
    await page.goto(`${CONSOLE_ORIGIN}/access-log`);
    await expect(page.locator("main")).toBeVisible();
    await noSideScroll(page);
  });
});
