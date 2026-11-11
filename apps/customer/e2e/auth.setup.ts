import { existsSync } from "node:fs";
import { expect, test as setup, type Page } from "@playwright/test";
import { ACCOUNT_KEYS, ACCOUNTS, passwordFor, storageStatePath, type AccountKey } from "./accounts";

/*
 * One real sign-in per account through the /login form; the session is saved for the sweep and the flows. A saved
 * session that still opens the workspace is reused, because sign-in is rate limited per address (a few a minute).
 */

setup.describe.configure({ mode: "serial" });

const RATE_LIMITED = /Too many sign-in attempts/i;

async function signIn(page: Page, key: AccountKey): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto("/login");
    await page.getByLabel("Email or mobile number").fill(ACCOUNTS[key].email);
    await page.getByLabel("Password", { exact: true }).fill(passwordFor(key));
    await page.getByRole("button", { name: /sign in/i }).click();
    const outcome = await Promise.race([
      page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 }).then(() => "in" as const),
      page.getByText(RATE_LIMITED).waitFor({ timeout: 60_000 }).then(() => "limited" as const),
    ]);
    if (outcome === "in") return;
    await page.waitForTimeout(65_000);
  }
  throw new Error(`Sign-in for ${key} stayed rate limited.`);
}

for (const key of ACCOUNT_KEYS) {
  setup(`sign in: ${key}`, async ({ browser }) => {
    setup.setTimeout(330_000);
    const path = storageStatePath(key);
    if (existsSync(path)) {
      const saved = await browser.newContext({ storageState: path });
      const page = await saved.newPage();
      await page.goto("/settings/security");
      const stillIn = !new URL(page.url()).pathname.startsWith("/login");
      await saved.close();
      if (stillIn) return;
    }
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, key);
    await expect(page).not.toHaveURL(/\/login(\?|$)/);
    await context.storageState({ path });
    await context.close();
  });
}
