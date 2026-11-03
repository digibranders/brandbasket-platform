import { expect, test, type Page } from "@playwright/test";
import { storageStatePath } from "./accounts";
import {
  businessIdOf,
  choose,
  closeDb,
  ensureBookingLink,
  removeBookingLink,
  deliverableStatus,
  newestChangeSince,
  payOnTestCheckout,
  postForApproval,
  quoteAsStaff,
  removeTestPost,
  settle,
  unique,
} from "./support";

/*
 * Key flows (plan 61, section 10) against the local seed and the fake billing provider (no money moves). Each flow here
 * can run again: it makes what it changes (a new sign-up, a new request, a new post) or puts things back (hours, the
 * invitation, the cancelled service). Runs grow the data a little: one sign-up, one paid request and one approved post
 * per run. The one-way flows (approve preview, lapsed to reactivated) are in flows-one-way.spec.ts.
 * Issue numbers (E2E-nn) refer to docs/customer-app-v4/E2E-REVIEW.md.
 */

test.afterAll(async () => {
  await closeDb();
});

/** Answer every /start question with its first choice until the page moves on. */
async function answerStart(page: Page): Promise<void> {
  for (let step = 0; step < 15 && new URL(page.url()).pathname === "/start"; step += 1) {
    const main = page.locator("main");
    if ((await main.getByRole("radio").count()) > 0 && (await main.getByRole("radio", { checked: true }).count()) === 0) {
      await main.getByRole("radio").first().click();
    } else if ((await main.getByRole("checkbox").count()) > 0 && (await main.getByRole("checkbox", { checked: true }).count()) === 0) {
      await main.getByRole("checkbox").first().click();
    }
    const before = page.url();
    await main.getByRole("button", { name: /^Continue/ }).last().click();
    await page.waitForURL((url) => url.href !== before, { timeout: 30_000 });
    await settle(page);
  }
}

async function fillSignUp(page: Page, email: string): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Business name").fill("E2E Sample Bakery");
  await page.getByLabel("Your name").fill("E2E Owner");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await choose(page, "State", "Maharashtra");
  await page.getByRole("textbox", { name: "Mobile number" }).fill(`9${Math.floor(100_000_000 + Math.random() * 899_999_999)}`);
  await page.getByLabel("Choose a password").fill(`E2e-${unique()}-Pw!42`);
  await page.getByRole("checkbox", { name: /I agree/ }).click();
  await page.getByRole("button", { name: /^(Email me a code|Continue)$/ }).click();
}

test.describe("sign-up journey", () => {
  test.describe.configure({ mode: "serial" });
  let addedBookingLink = false;
  test.beforeAll(async () => {
    addedBookingLink = await ensureBookingLink();
  });
  test.afterAll(async () => {
    if (addedBookingLink) await removeBookingLink();
  });

  test("sign up through the real form (E2E-01)", async ({ page }) => {
    // E2E-01: the country-code select submits under the phone field's name, so every sign-up is refused.
    test.fail();
    await fillSignUp(page, `e2e+${unique()}@example.test`);
    await expect(page.getByLabel("Code")).toBeVisible({ timeout: 30_000 });
  });

  test("sign up to paid, book kickoff, add and cancel a service", async ({ page }) => {
    test.setTimeout(400_000);
    // Work around E2E-01 so the rest of the journey is covered: send the country code under its own name.
    await page.route("**/signup", async (route) => {
      const body = route.request().postData();
      if (route.request().method() !== "POST" || body === null) return route.continue();
      return route.continue({ postData: body.replace(/(name="(?:\$?[A-Z_0-9]*_)?)phone("\r\n\r\n[A-Z]{2}\r\n)/i, "$1phoneCountry$2") });
    });
    await fillSignUp(page, `e2e+${unique()}@example.test`);

    // EMAIL_CODE_BYPASS is on locally: any six digits pass.
    await page.getByLabel("Code").fill("123456");
    await page.getByRole("button", { name: /^(Verify and continue|Continue)$/ }).click();
    await page.waitForURL((url) => url.pathname !== "/signup", { timeout: 60_000 });
    await settle(page);

    await answerStart(page);
    await expect(page).toHaveURL(/\/checkout/);
    // GST invoice details: an address is required before paying.
    await page.getByLabel("Address line 1").fill("12 FC Road");
    await page.getByLabel("Pincode").fill("411004");
    await page.getByLabel("City").fill("Pune");
    await choose(page, "State", "Maharashtra");
    await page.getByRole("button", { name: /^Pay / }).click();
    await payOnTestCheckout(page);

    // Book kickoff: Home's task offers the call; take the first day and time the local scheduler offers.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Book your kickoff call" })).toBeVisible();
    // Day and time are toggle chips; the first day is picked already.
    await page.getByRole("group", { name: "Time" }).getByRole("button").first().click();
    await page.getByRole("button", { name: /^Book/ }).click();
    await expect(page.getByRole("heading", { name: "Kickoff call booked" })).toBeVisible({ timeout: 30_000 });

    // Add a service and pay for it, then cancel it: the dialog states the date it ends.
    await page.goto("/billing");
    const panel = page.getByRole("region", { name: "Your services" }).or(page.locator("section", { hasText: "Your services" }).first());
    await panel.getByRole("button", { name: "Add", exact: true }).first().click();
    await page.getByRole("button", { name: "Add and pay" }).click();
    await payOnTestCheckout(page);
    await page.goto("/billing");
    await page.getByRole("button", { name: /^Options for / }).first().click();
    await page.getByRole("menuitem", { name: "Cancel this service" }).click();
    const dialog = page.getByRole("dialog", { name: "Cancel a service" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^Cancel from / }).click();
    await expect(page.getByText(/Cancellation scheduled|ends on|Ending/i).first()).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("live business (Kulkarni)", () => {
  test.use({ storageState: storageStatePath("kulkarni") });

  test("new request to quote to pay", async ({ page }) => {
    test.setTimeout(240_000);
    const since = new Date(Date.now() - 5_000);
    const businessId = await businessIdOf("kulkarni-physio-wellness");

    await page.goto("/requests?new=1");
    const dialog = page.getByRole("dialog", { name: "New request" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("radio", { name: "Change my website" }).or(dialog.getByRole("button", { name: "Change my website" })).first().click();
    await dialog.getByLabel("Which page?").fill("Services");
    await dialog.getByLabel("What should we do?").fill(`E2E ${unique()}: add a Marathi version of the Services page.`);
    await dialog.getByRole("button", { name: "Send request" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    const request = await newestChangeSince(businessId, since);
    await quoteAsStaff(request.id);

    await page.goto(`/requests/${request.ticketId}`);
    // Quote acceptance states the price (plan 61, section 4).
    const accept = page.getByRole("button", { name: /₹/ }).first();
    await expect(accept).toBeVisible();
    await accept.click();
    await page.waitForURL(/\/checkout\/charges\//, { timeout: 60_000 });
    await settle(page);
    // E2E-05: the quote's pay page (/checkout/charges/[id]) is Razorpay only and shows "This page does not exist" with the
    // fake provider. Pay the same charge from Plan & billing, where the fake provider's checkout is wired.
    if (await page.getByText("This page does not exist").isVisible()) {
      test.info().annotations.push({ type: "known E2E-05", description: "quote pay page 404s with the fake provider" });
      await page.goto("/billing/invoices");
      await page.locator("main").getByRole("button", { name: "Pay", exact: true }).first().click();
    }
    await payOnTestCheckout(page);

    await expect.poll(async () => (await newestChangeSince(businessId, since)).state, { timeout: 30_000 }).toBe("in_progress");
  });

  test("approve post", async ({ page }) => {
    const businessId = await businessIdOf("kulkarni-physio-wellness");
    const title = `E2E post ${unique()}`;
    await postForApproval(businessId, title);

    await page.goto("/social");
    const row = page.getByRole("listitem").filter({ hasText: title }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => deliverableStatus(businessId, title), { timeout: 30_000 }).toBe("approved");
    await removeTestPost(businessId, title);
  });

  test("change business hours, then put them back", async ({ page }) => {
    await page.goto("/business");
    const mode = page.getByRole("combobox", { name: "Sunday hours" });
    await expect(mode).toBeVisible();
    const before = (await mode.innerText()).trim();
    const other = before === "Closed" ? /^Open/ : "Closed";

    const save = async (): Promise<void> => {
      const bar = page.getByRole("region", { name: "Unsaved changes" });
      await expect(bar).toBeVisible();
      await bar.getByRole("button", { name: /Save/ }).click();
      await expect(bar).toBeHidden({ timeout: 30_000 });
    };

    await choose(page, "Sunday hours", other);
    await save();
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Sunday hours" })).not.toHaveText(before);

    await choose(page, "Sunday hours", before);
    await save();
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Sunday hours" })).toHaveText(before);
  });

  test("download invoice", async ({ page }) => {
    await page.goto("/billing/invoices");
    const link = page.locator("main").getByRole("link", { name: "PDF", exact: true }).first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).not.toBeNull();
    const response = await page.request.get(href ?? "");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("cancel a service, then keep it", async ({ page }) => {
    // E2E-11: the seed gives subscriptions provider ids the fake provider refuses, so a seeded plan cannot change.
    // The sign-up journey above cancels a service on a fresh account instead.
    test.skip(true, "seeded subscription ids are refused by the fake provider (E2E-11)");
    await page.goto("/billing");
    await page.getByRole("button", { name: "Options for Social Media and Ads" }).or(page.getByRole("button", { name: /^Options for Social/ })).first().click();
    await page.getByRole("menuitem", { name: "Cancel this service" }).click();
    const dialog = page.getByRole("dialog", { name: "Cancel a service" });
    // Cancelling states the new total (plan 60, section 14).
    await expect(dialog.getByText(/₹/).first()).toBeVisible();
    await dialog.getByRole("button", { name: /^Cancel from / }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    const keep = page.getByRole("button", { name: "Keep", exact: true }).first();
    await expect(keep).toBeVisible();
    await keep.click();
    await expect(page.getByText(/stays\. Your monthly payment does not change/)).toBeVisible({ timeout: 30_000 });
  });

  test("invite a teammate, then revoke the invitation", async ({ page }) => {
    const email = `e2e+invite-${unique()}@example.test`;
    await page.goto("/settings/team");
    await page.getByRole("button", { name: "Invite someone" }).click();
    const dialog = page.getByRole("dialog", { name: "Invite someone" });
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByRole("button", { name: "Send invitation" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(page.getByText(email)).toBeVisible();
    await page.getByRole("button", { name: `Revoke the invitation to ${email}` }).click();
    await expect(page.getByText(email)).toBeHidden({ timeout: 30_000 });
  });
});
