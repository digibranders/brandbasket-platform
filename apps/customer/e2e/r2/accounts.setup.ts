import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { test as setup, type Browser } from "@playwright/test";
import { AUTH_DIR, CONSOLE_ORIGIN, CUSTOMER_ORIGIN, consoleStatePath, businessIdFor, closeDb, fixture, makeStaff, payForPlan, saveBusinessId, signUp, sql, statePath, type FixtureKey } from "./fixtures";

/* Builds the six accounts the journeys use. Serial: sign-up is rate limited per network. */
setup.describe.configure({ mode: "serial" });
setup.setTimeout(300_000);

async function build(browser: Browser, key: FixtureKey, plan: string, pay: boolean): Promise<void> {
  mkdirSync(AUTH_DIR, { recursive: true });
  const context = await browser.newContext({ baseURL: CUSTOMER_ORIGIN, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await signUp(page, plan, key);
  if (pay) await payForPlan(page);
  await saveBusinessId(key);
  await context.storageState({ path: statePath(key) });
  await context.close();
}

setup("website owner, paid", async ({ browser }) => {
  rmSync(resolve(__dirname, "../.logs-r2/axe.jsonl"), { force: true });
  await build(browser, "website", "website", true);
});
setup("social owner, paid", async ({ browser }) => build(browser, "social", "social", true));
setup("unpaid sign-up", async ({ browser }) => build(browser, "unpaid", "website", false));
setup("invitee", async ({ browser }) => build(browser, "invitee", "website", false));
setup("failing renewal", async ({ browser }) => {
  await build(browser, "failing", "website", true);
  const businessId = await businessIdFor(fixture("failing").email);
  await sql("update subscriptions set status = 'past_due' where business_id = $1 and status = 'active'", [businessId]);
});
setup("preview ready", async ({ browser }) => {
  await build(browser, "preview", "website", true);
  const businessId = await businessIdFor(fixture("preview").email);
  await sql("update projects set status = 'preview', preview_url = 'https://preview.example.test/site', preview_sent_at = now(), onboarding_submitted_at = now() where business_id = $1 and status not in ('live', 'cancelled')", [businessId]);
});
setup("audit account with console access", async ({ browser }) => {
  await build(browser, "audit", "website", true);
  makeStaff(fixture("audit").email);
  await closeDb();
});

setup("console sign-in", async ({ browser }) => {
  const account = fixture("audit");
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${CONSOLE_ORIGIN}/login`);
  await page.getByLabel(/email/i).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
  await context.storageState({ path: consoleStatePath });
  await context.close();
});
