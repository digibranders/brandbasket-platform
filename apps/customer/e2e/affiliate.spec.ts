import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

/*
 * The affiliate portal, against the affiliate the v4 seed makes (pnpm --filter @brandbasket/db db:seed:v4): Rohan Mehta with
 * codes MEHTA300 (live), MEHTA-FRIENDS (used up) and MEHTA-DIWALI (expired), four members, a payout with TDS kept back and a
 * refunded month; and Kavita Rao, whose setup link is open. The password and the setup link are read from the workspace's
 * local-test-logins.txt, never copied here. Screenshots go to e2e/screens/affiliate/<name>-<width>.png.
 */

test.describe.configure({ mode: "serial" });

const AFFILIATE_EMAIL = "affiliate+seed-v4@example.test";
const PENDING_EMAIL = "affiliate+pending-seed-v4@example.test";
const LOGINS_FILE = process.env.E2E_LOGINS_FILE ?? resolve(__dirname, "../../../../../local-test-logins.txt");
const SESSION = resolve(__dirname, ".auth", "affiliate.json");
const SCREENS = resolve(__dirname, "screens", "affiliate");
const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

/** The second field on the email's latest line of the logins file: a password, or a setup link's path. */
function loginValue(email: string): string | null {
  if (!existsSync(LOGINS_FILE)) return null;
  const lines = readFileSync(LOGINS_FILE, "utf8").split("\n").filter((line) => line.trim().startsWith(`${email} `));
  return lines.at(-1)?.trim().split(/\s+/)[1] ?? null;
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
}

async function seriousAxe(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  return result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical").map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(" | ")}`);
}

/** At each width: no sideways scroll on the phone, axe clean, and a full-page screenshot. */
async function checkAtBothWidths(page: Page, name: string): Promise<void> {
  mkdirSync(SCREENS, { recursive: true });
  for (const size of WIDTHS) {
    await page.setViewportSize(size);
    await page.waitForTimeout(300);
    if (size.width < 768) {
      const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(widths.scroll, `${name} scrolls sideways at ${size.width}`).toBeLessThanOrEqual(widths.client + 1);
    }
    expect(await seriousAxe(page), `${name} at ${size.width}`).toEqual([]);
    await page.screenshot({ path: resolve(SCREENS, `${name}-${size.width}.png`), fullPage: true });
  }
  await page.setViewportSize(WIDTHS[0]);
}

/** A page signed in as the seeded affiliate, reusing the saved session while it still opens the dashboard (sign-in is rate limited). */
async function affiliatePage(browser: Browser): Promise<Page> {
  if (existsSync(SESSION)) {
    const saved = await browser.newContext({ storageState: SESSION });
    const page = await saved.newPage();
    await page.goto("/affiliate");
    if (new URL(page.url()).pathname === "/affiliate") return page;
    await saved.close();
  }
  const password = loginValue(AFFILIATE_EMAIL);
  test.skip(password === null, `No ${AFFILIATE_EMAIL} in ${LOGINS_FILE}: run pnpm --filter @brandbasket/db db:seed:v4.`);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email or mobile number").fill(AFFILIATE_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(password ?? "");
  await page.getByRole("button", { name: /sign in/i }).click();
  // An affiliate with no business lands on their own page.
  await page.waitForURL((url) => url.pathname === "/affiliate", { timeout: 60_000 });
  mkdirSync(resolve(__dirname, ".auth"), { recursive: true });
  await context.storageState({ path: SESSION });
  return page;
}

test("signed out, /affiliate goes to sign in", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/affiliate");
  await expect(page).toHaveURL(/\/login/);
  await context.close();
});

test("affiliate dashboard", async ({ browser }) => {
  const page = await affiliatePage(browser);
  await settle(page);

  await expect(page.getByRole("heading", { level: 1, name: "Hello, Rohan." })).toBeVisible();
  await expect(page.getByText("You earn 10% of each payment, first 12 paid months")).toBeVisible();
  // No customer navigation in the affiliate's own frame: one page and Sign out.
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Codes in status order: live, used up, expired.
  const codes = page.getByRole("table", { name: "Your codes" });
  await expect(codes.getByRole("row", { name: /MEHTA300/ })).toContainText("Live");
  await expect(codes.getByRole("row", { name: /MEHTA-FRIENDS/ })).toContainText("Fully used");
  await expect(codes.getByRole("row", { name: /MEHTA-DIWALI/ })).toContainText("Expired");
  await expect(codes.getByRole("row", { name: /MEHTA300/ })).toContainText("Members get ₹300 off a month for 3 months");

  // Figures: four members, two of them paying now.
  const figures = page.getByLabel("Your figures");
  await expect(figures.getByRole("term")).toHaveText(["Members", "Earned", "To be paid"]);
  await expect(figures).toContainText("4");
  await expect(figures).toContainText("2 paying now");

  const cashOut = page.getByRole("table", { name: "Cash-out" });
  await expect(cashOut.getByRole("row", { name: /Withheld/ })).toBeVisible();
  await expect(cashOut.getByRole("row", { name: /Cancelled after a refund/ })).toBeVisible();

  const months = page.getByRole("table", { name: "By month" });
  await expect(months.getByRole("row")).toHaveCount(7);

  const earnings = page.getByRole("table", { name: "Earnings" });
  await expect(earnings.getByText("Month 1 of 12").first()).toBeVisible();
  // Every earning carries the day its member paid and the code it came through, at both widths.
  await expect(earnings.getByText(/^\w{3} \d{1,2} \w{3}(?: \d{4})?, MEHTA300$/).first()).toBeVisible();
  await expect(earnings.getByText("Cancelled").first()).toBeVisible();
  await expect(earnings.getByText("To be paid").first()).toBeVisible();
  await expect(earnings.getByText("Paid", { exact: true }).first()).toBeVisible();

  const payouts = page.getByRole("table", { name: "Payouts" });
  await expect(payouts).toContainText("UPI 431907652218");
  await expect(payouts).toContainText("TDS at 2%");

  // The copy button works from the keyboard and says so in words.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const copy = codes.getByRole("button", { name: "Copy code MEHTA300" });
  await copy.focus();
  await page.keyboard.press("Enter");
  await expect(codes.getByRole("button", { name: "Copied MEHTA300" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("MEHTA300");

  // The skip link is the first stop and lands on the page.
  await page.goto("/affiliate");
  await settle(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#page")).toBeFocused();

  await checkAtBothWidths(page, "dashboard");
  await page.context().close();
});

test("a dead setup link says so", async ({ page }) => {
  await page.goto("/affiliate/setup/not-a-real-link");
  await expect(page.getByRole("heading", { level: 1, name: "This link no longer works." })).toBeVisible();
  await checkAtBothWidths(page, "setup-dead");
});

test("setup link for a new affiliate", async ({ page }) => {
  const path = loginValue(PENDING_EMAIL);
  test.skip(path === null, `No ${PENDING_EMAIL} setup link in ${LOGINS_FILE}: run pnpm --filter @brandbasket/db db:seed:v4.`);
  await page.goto(path ?? "");
  await settle(page);
  const dead = await page.getByRole("heading", { name: "This link no longer works." }).isVisible();
  test.skip(dead, "The seeded setup link was used or has lapsed: re-run pnpm --filter @brandbasket/db db:seed:v4 for a new one.");

  await expect(page.getByRole("heading", { level: 1, name: "Welcome to Brandbasket." })).toBeVisible();
  await expect(page.getByText(`Finish linking ${PENDING_EMAIL} to your affiliate dashboard.`)).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveValue("Kavita Rao");
  const terms = page.getByRole("checkbox", { name: /I agree to the Terms/ });
  await expect(terms).not.toBeChecked();
  await checkAtBothWidths(page, "setup-create");

  // Without the Terms tick no account is made, the link stays open, and focus goes to the box. This spends one of the
  // network's setup attempts (10 an hour) but never the link: the refusal rolls back before the link is claimed.
  const password = `E2e-${Date.now().toString(36)}-Setup!9`;
  await page.getByLabel("Choose a password").fill(password);
  await page.getByLabel("Repeat the password").fill(password);
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.getByText("Tick the box to agree to the Terms and Privacy Notice.")).toBeVisible();
  await expect(terms).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`${path ?? ""}$`));
});
