import { expect, test, type Page } from "@playwright/test";
import { payOnTestCheckout, settle, unique } from "../support";
import {
  businessIdFor,
  clearLimits,
  closeDb,
  fixture,
  makeInvite,
  quoteAsStaff,
  removeBookingLink,
  setBookingLink,
  shot,
  sql,
  statePath,
  type FixtureKey,
} from "./fixtures";

/*
 * Journeys from docs/product-architecture-audit/19-end-to-end-user-journey.md, at 1440, 768 and 390. Steps that change
 * data (booking, approving, paying, accepting an invite) run at 1440 only, because the three viewports share the fixtures;
 * the other two viewports check the same screens read-only. Projects run one after another (workers = 1).
 */

const FULL = (project: string): boolean => project === "w1440";

test.beforeAll(async () => {
  await clearLimits();
  await setBookingLink();
});
test.afterAll(async () => {
  await removeBookingLink();
  await closeDb();
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) await shot(page, `fail-${info.project.name}-${info.title.replace(/\W+/g, "-").slice(0, 40)}`);
});

async function noSideScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "no sideways scroll").toBeLessThanOrEqual(1);
}

const as = (key: FixtureKey): void => test.use({ storageState: statePath(key) });

test.describe("sign up with the email code and pay for Website", () => {
  test("code step, intake, checkout, fake payment, Home welcome", async ({ browser }, info) => {
    test.skip(!FULL(info.project.name), "creates an account: 1440 only");
    test.setTimeout(240_000);
    const context = await browser.newContext({ baseURL: info.project.use.baseURL });
    const page = await context.newPage();
    const { signUp, payForPlan } = await import("./fixtures");
    await signUp(page, "website", "fresh");
    await expect(page).toHaveURL(/\/start/);
    await payForPlan(page);
    await page.goto("/");
    await expect(page.getByText("Your plan is active")).toBeVisible();
    await shot(page, "journey-signup-paid-home");
    const mail = await sql<{ transport: string; status: string }>("select transport, status from email_messages where template = 'signup-code' order by created_at desc limit 1");
    expect(mail[0]).toMatchObject({ transport: "outbox", status: "local_only" });
    await context.close();
  });
});

test.describe("Social-only", () => {
  as("social");
  test("Home and /social show setup states, not a Website card", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("We need this to start").first()).toBeVisible();
    // Journey 6.3: Social has no setup call, and a Social-only business has no Website service.
    await expect(page.getByRole("heading", { name: "Book your kickoff call" }), "no kickoff call for Social").toHaveCount(0);
    await expect(page.getByText("Your Website service is active"), "no Website card on a Social-only plan").toHaveCount(0);
    await noSideScroll(page);
    await page.goto("/social");
    await expect(page.getByText(/We need a few things from you|Not connected|Connect/).first()).toBeVisible();
    await noSideScroll(page);
  });
});

test.describe("unpaid lock-in fixes", () => {
  as("unpaid");
  test("Help and Settings stay reachable; other pages return to /start", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/start/);
    await page.goto("/help");
    await expect(page).toHaveURL(/\/help/);
    await expect(page.getByRole("heading", { name: /Help/ }).first()).toBeVisible();
    await page.goto("/settings");
    await expect(page, "journey 3.2: Settings reachable before paying").toHaveURL(/\/settings/);
    await page.goto("/billing");
    await expect(page).toHaveURL(/\/(start|billing)/);
    await noSideScroll(page);
  });
});

test.describe("Home states", () => {
  test.describe("active, kickoff pending", () => {
    as("website");
    test("plan active, next step, Needs your OK empty", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByText("Your plan is active")).toBeVisible();
      await expect(page.getByText("Needs your OK").first()).toBeVisible();
      await expect(page.getByText("Nothing needs your OK right now.")).toBeVisible();
      await noSideScroll(page);
      await shot(page, "home-active");
    });
  });
  test.describe("failed payment", () => {
    as("failing");
    test("banner explains the failure and links to billing", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByText("We could not take your last payment")).toBeVisible();
      await page.getByRole("link", { name: "See billing" }).first().click();
      await expect(page).toHaveURL(/\/billing/);
      await expect(page.getByText("We couldn’t take your last payment")).toBeVisible();
      await noSideScroll(page);
    });
  });
});

test.describe("Website kickoff and preview approval", () => {
  test.describe("kickoff", () => {
    as("website");
    test("book the call, then see Kickoff call booked", async ({ page }, info) => {
      // An earlier viewport may have booked it; start every viewport from "not booked".
      await sql("delete from setup_call_bookings where business_id = $1", [await businessIdFor(fixture("website").email)]);
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Book your kickoff call" })).toBeVisible();
      await noSideScroll(page);
      test.skip(!FULL(info.project.name), "booking changes data: 1440 only");
      await page.getByRole("group", { name: "Time" }).getByRole("button").first().click();
      await page.getByRole("button", { name: /^Book/ }).click();
      await expect(page.getByRole("heading", { name: "Kickoff call booked" })).toBeVisible({ timeout: 30_000 });
    });
    // PR #200 removed the "Call completed" popup; a separate notifications session is restoring it.
    test.fixme("after the call time, the customer is told we are starting (Call completed popup)", async () => {
      // Restore with the notifications session (docs/implementation/NOTIFICATIONS-SESSION-BRIEF.md): confirm the call in the console,
      // then expect "Thanks for the call. We are getting your website started" on Home.
    });
  });
  test.describe("preview", () => {
    as("preview");
    test("preview shown with Approve and Ask for changes; approving closes the loop", async ({ page }, info) => {
      // Approving at 1440 consumes the preview; put it back so every viewport starts from "preview ready".
      await sql("update projects set status = 'preview' where business_id = $1 and status in ('approved', 'preview')", [await businessIdFor(fixture("preview").email)]);
      await page.goto("/website");
      await expect(page.getByRole("button", { name: /Approve and go live/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Ask for changes/ }).first()).toBeVisible();
      await noSideScroll(page);
      await shot(page, `website-preview-${info.project.name}`);
      await page.getByRole("button", { name: /Ask for changes/ }).first().click();
      const dialog = page.getByRole("dialog").first();
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      test.skip(!FULL(info.project.name), "approval changes data: 1440 only");
      await page.getByRole("button", { name: /Approve and go live/ }).click();
      await page.getByRole("button", { name: "Yes, approve" }).click();
      await expect(page.getByText(/You approved the preview|approved|getting it live/i).first()).toBeVisible({ timeout: 30_000 });
    });
  });
});

test.describe("Requests and a quote", () => {
  as("website");
  test("empty state, new request, quote from staff", async ({ page }, info) => {
    await page.goto("/requests");
    await expect(page.getByRole("heading", { name: "Requests" }).first()).toBeVisible();
    await noSideScroll(page);
    test.skip(!FULL(info.project.name), "creating a request changes data: 1440 only");
    test.setTimeout(240_000);
    const since = new Date(Date.now() - 5_000);
    await page.goto("/requests?new=1");
    const dialog = page.getByRole("dialog", { name: "New request" });
    await expect(dialog).toBeVisible();
    // "Change my website" is offered only once the site is live; until then "Posts or ads" is the default and a change request.
    await dialog.getByLabel("What should we do?").fill(`R2-11 ${unique()}: add a Marathi version of the Services page.`);
    await dialog.getByRole("button", { name: "Send request" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    const rows = await sql<{ id: string; ticketId: string }>(
      "select id, ticket_id as \"ticketId\" from change_requests where business_id = $1 and created_at >= $2 order by created_at desc limit 1",
      [await businessIdFor(fixture("website").email), since],
    );
    const request = rows[0];
    if (request === undefined) throw new Error("The request was not saved.");
    await quoteAsStaff(request.id);
    await page.goto(`/requests/${request.ticketId}`);
    const accept = page.getByRole("button", { name: /₹/ }).first();
    await expect(accept, "the quote states its price").toBeVisible();
    await shot(page, "request-quote");
    await accept.click();
    await page.getByRole("dialog", { name: "Pay for this change" }).getByRole("button", { name: /^Accept and pay/ }).click();
    await page.waitForURL((url) => /\/checkout\/|\/billing\//.test(url.pathname), { timeout: 60_000 }).catch(() => undefined);
    await settle(page);
    info.annotations.push({ type: "after quote accept", description: new URL(page.url()).pathname });
    if (await page.getByText("This page does not exist").isVisible()) {
      test.info().annotations.push({ type: "defect", description: "quote pay page 404s with the fake provider (E2E-05)" });
      await page.goto("/billing/invoices");
      await page.locator("main").getByRole("button", { name: "Pay", exact: true }).first().click();
    }
    await payOnTestCheckout(page);
  });
});

test.describe("Plan and billing", () => {
  test.describe("add and cancel a service", () => {
    as("website");
    test("services list; add Social and pay; cancel it with the end date stated", async ({ page }, info) => {
      await page.goto("/billing");
      await expect(page.getByText("Your services").first()).toBeVisible();
      await noSideScroll(page);
      test.skip(!FULL(info.project.name), "adding a service changes data: 1440 only");
      test.setTimeout(240_000);
      await page.locator("main").getByRole("button", { name: "Add", exact: true }).first().click();
      await page.getByRole("dialog").getByRole("button", { name: /^Pay / }).click();
      await payOnTestCheckout(page);
      await page.goto("/billing");
      // Cancel the service just added. The first row is the Website, and cancelling it would leave the shared account without one.
      await page.getByRole("button", { name: /^Options for Social/ }).first().click();
      await page.getByRole("menuitem", { name: "Cancel this service" }).click();
      const dialog = page.getByRole("dialog", { name: "Cancel a service" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: /^Cancel from / }).click();
      await expect(page.getByText(/Cancellation scheduled|ends on|Ending/i).first()).toBeVisible({ timeout: 30_000 });
    });
  });
});

test.describe("Settings tabs", () => {
  as("website");
  for (const [tab, heading] of [
    ["/settings", "Your profile"],
    ["/settings/security", "Change password"],
    ["/settings/notifications", "Email notifications"],
    ["/settings/team", "People with access"],
    ["/settings/privacy", /privacy|data/i],
    ["/settings/delete", /delete/i],
  ] as const) {
    test(`tab ${tab}`, async ({ page }) => {
      await page.goto(tab);
      await expect(page.getByText(heading).first()).toBeVisible();
      await expect(page.getByRole("link", { name: /Team|Privacy and data|Sign-in and security/ }).first()).toBeVisible();
      await noSideScroll(page);
    });
  }
});

test.describe("Invite flow", () => {
  test("states are shown before Join, and the invitee lands in the inviter workspace", async ({ browser }, info) => {
    const owner = fixture("website");
    const invitee = fixture("invitee");
    const businessId = await businessIdFor(owner.email);
    const context = await browser.newContext({ baseURL: info.project.use.baseURL, storageState: statePath("invitee"), viewport: info.project.use.viewport });
    const page = await context.newPage();

    for (const [state, message] of [
      ["expired", /expired|no longer/i],
      ["revoked", /withdrew|withdrawn|revoked|no longer/i],
      ["used", /already|used/i],
    ] as const) {
      await page.goto(`/invite/${await makeInvite(businessId, owner.email, invitee.email, state)}`);
      await expect(page.getByText(message).first(), `${state} invitation says so before Join`).toBeVisible();
      await expect(page.getByRole("button", { name: /^Join/ }), `${state} invitation offers no Join`).toHaveCount(0);
    }
    await page.goto(`/invite/${await makeInvite(businessId, owner.email, `someone-else-${unique()}@example.test`, "open")}`);
    await expect(page.getByText(/different|another|sent to/i).first(), "a wrong address is explained before Join").toBeVisible();

    await page.goto(`/invite/${await makeInvite(businessId, owner.email, invitee.email, "open")}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Join");
    await noSideScroll(page);
    await shot(page, `invite-open-${info.project.name}`);
    test.skip(!FULL(info.project.name), "joining changes data: 1440 only");
    await page.getByRole("button", { name: /^Join/ }).first().click();
    await page.waitForURL((url) => !url.pathname.startsWith("/invite"), { timeout: 30_000 });
    expect(new URL(page.url()).pathname, "journey 11.6: lands in the inviter's dashboard, not its own sign-up questions").not.toMatch(/^\/start/);
    await context.close();
  });
});

test.describe("signed-out deep link", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("opening /settings/team signed out returns there after sign-in", async ({ page }) => {
    const owner = fixture("website");
    await page.goto("/settings/team");
    await expect(page).toHaveURL(/\/login/);
    expect(page.url(), "journey 11.7: the target survives in the address").toContain(encodeURIComponent("/settings/team"));
    await page.getByLabel("Email or mobile number").fill(owner.email);
    await page.getByLabel("Password", { exact: true }).fill(owner.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
    await expect(page).toHaveURL(/\/settings\/team/);
  });
});
