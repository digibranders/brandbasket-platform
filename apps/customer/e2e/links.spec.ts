import { createHash, randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { hashInviteToken } from "@brandbasket/db";
import { ACCOUNTS, passwordFor, storageStatePath } from "./accounts";
import { businessIdOf, closeDb, DEV_RACE, settle, staffDb } from "./support";

/*
 * Links people open from email and from old bookmarks (plan 61, sections 3 and 10):
 * - password reset links: valid, expired, used;
 * - staff setup links: valid, expired;
 * - team invitations: the right email, a wrong email, expired, revoked, used;
 * - the safe `next` return after sign-in (only an invitation page is honoured);
 * - every old address in docs/customer-app-v4/PARITY.md Part 2 (and src/app/old-paths.test.ts), signed in and out.
 * Tokens are made straight in the local v4 database (support.ts refuses any other) and removed afterwards. The valid
 * reset sets Om Sweets' password to the one it already has, then signs in again and saves the session, because a reset
 * signs the account out everywhere.
 */

const token = (): string => randomBytes(32).toString("base64url");
const query = async (sql: string, params: readonly unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> => staffDb().db.$client.query(sql, [...params]);
const userIdOf = async (email: string): Promise<string> => String((await query("select id from users where email = $1", [email])).rows[0]?.id);
const DAY = 86_400_000;

test.afterAll(async () => {
  await closeDb();
});

const bucketKey = (key: string): string => createHash("sha256").update(key).digest("base64url");

/**
 * Local runs repeat: clear this machine's counters for the limits these tests spend (reset links 10 an hour per network,
 * setup link lookups per network, invitation accepts 10 an hour per person), so a rerun is not refused. Keys are stored hashed (packages/db rate-limit.ts
 * bucketKeyFor); the dev server sees this machine as one of these addresses.
 */
async function clearLimits(): Promise<void> {
  const viewer = await userIdOf(ACCOUNTS["kulkarni-viewer"].email);
  const addresses = ["unknown", "::1", "127.0.0.1", "::ffff:127.0.0.1"];
  const keys = [`business-invite-accept:user:${viewer}`, ...addresses.flatMap((ip) => [`password-reset-use:client:${ip}`, `setup-view:client:${ip}`])];
  await query("delete from rate_limit_buckets where key = any($1)", [keys.map(bucketKey)]);
}

async function signInThroughForm(page: Page, key: keyof typeof ACCOUNTS, path = "/login"): Promise<void> {
  await page.goto(path);
  await page.getByLabel("Email or mobile number").fill(ACCOUNTS[key].email);
  await page.getByLabel("Password", { exact: true }).fill(passwordFor(key));
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

test.describe("password reset links", () => {
  test.describe.configure({ mode: "serial" });
  const made: string[] = [];

  test.beforeAll(clearLimits);
  test.afterAll(async () => {
    await query("delete from verifications where identifier = any($1)", [made.map((value) => `reset-password:${value}`)]);
  });

  async function resetToken(expiresIn: number): Promise<string> {
    const value = token().slice(0, 24);
    made.push(value);
    await query("insert into verifications (id, identifier, value, expires_at) values ($1, $2, $3, $4)", [
      crypto.randomUUID(),
      `reset-password:${value}`,
      await userIdOf(ACCOUNTS["om-sweets"].email),
      new Date(Date.now() + expiresIn),
    ]);
    return value;
  }

  async function submitReset(page: Page, value: string): Promise<void> {
    await page.goto(`/reset-password/${value}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Choose a new password");
    await page.getByLabel("New password").fill(passwordFor("om-sweets"));
    await page.getByLabel("Repeat the password").fill(passwordFor("om-sweets"));
    await page.getByRole("button", { name: "Save new password" }).click();
  }

  test("an expired link says it no longer works and offers a new one", async ({ page }) => {
    await submitReset(page, await resetToken(-60_000));
    await expect(page.getByText("This link no longer works.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: /new link|reset link|Send/i }).first()).toBeVisible();
  });

  test("a valid link changes the password and lands on sign in; used again it no longer works", async ({ page, browser }) => {
    const value = await resetToken(60 * 60_000);
    await submitReset(page, value);
    await page.waitForURL(/\/login\?notice=password-changed/, { timeout: 60_000 });
    await expect(page.getByText(/password/i).first()).toBeVisible();

    await submitReset(page, value);
    await expect(page.getByText("This link no longer works.")).toBeVisible({ timeout: 30_000 });

    // The reset signed Om Sweets out everywhere: sign in again and save the session the other specs use.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const fresh = await context.newPage();
    await signInThroughForm(fresh, "om-sweets");
    await context.storageState({ path: storageStatePath("om-sweets") });
    await context.close();
  });
});

test.describe("staff setup links", () => {
  const made: string[] = [];
  test.beforeAll(clearLimits);
  test.afterAll(async () => {
    await query("delete from setup_invites where token_hash = any($1)", [made.map(hashInviteToken)]);
  });

  async function setupToken(expiresIn: number, email: string): Promise<string> {
    const value = token();
    made.push(value);
    const lead = (await query("select id from leads order by created_at limit 1")).rows[0]?.id;
    const staff = await userIdOf("staff+seed-v4@example.test");
    await query("insert into setup_invites (id, lead_id, email, business_name, token_hash, expires_at, created_by_staff_id) values ($1, $2, $3, $4, $5, $6, $7)", [
      crypto.randomUUID(),
      lead,
      email,
      "E2E Setup Studio",
      hashInviteToken(value),
      new Date(Date.now() + expiresIn),
      staff,
    ]);
    return value;
  }

  test("a valid link shows the business and the address it was sent to", async ({ page }) => {
    const email = `e2e+setup-${Date.now().toString(36)}@example.test`;
    await page.goto(`/setup/${await setupToken(7 * DAY, email)}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome to");
    await expect(page.getByText(`Finish setting up E2E Setup Studio with ${email}.`)).toBeVisible();
  });

  test("an expired link says so and points to sign in", async ({ page }) => {
    await page.goto(`/setup/${await setupToken(-DAY, "e2e+setup-expired@example.test")}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("This link no longer works.");
    await expect(page.getByRole("link", { name: "Go to sign in" })).toBeVisible();
  });

  test("a made-up link says the same", async ({ page }) => {
    await page.goto(`/setup/${token()}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("This link no longer works.");
  });
});

test.describe("team invitations", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: storageStatePath("kulkarni-viewer") });
  const made: string[] = [];

  test.beforeAll(clearLimits);
  test.afterAll(async () => {
    await query("delete from business_invites where token_hash = any($1)", [made.map(hashInviteToken)]);
  });

  /** An invitation to Kulkarni as a viewer. The viewer already belongs there, so accepting changes no membership. */
  async function invite(input: { email: string; expiresIn?: number; revoked?: boolean; used?: boolean }): Promise<string> {
    const value = token();
    made.push(value);
    const now = new Date();
    await query(
      "insert into business_invites (id, business_id, email, role, token_hash, invited_by, expires_at, accepted_at, revoked_at, created_at) values ($1, $2, $3, 'viewer', $4, $5, $6, $7, $8, $9)",
      [
        crypto.randomUUID(),
        await businessIdOf("kulkarni-physio-wellness"),
        input.email,
        hashInviteToken(value),
        await userIdOf(ACCOUNTS.kulkarni.email),
        new Date(now.getTime() + (input.expiresIn ?? 7 * DAY)),
        input.used === true ? now : null,
        input.revoked === true ? now : null,
        // An invitation must expire after it was made, so an expired one is made 8 days ago.
        new Date(now.getTime() - 8 * DAY),
      ],
    );
    return value;
  }

  async function accept(page: Page, value: string): Promise<void> {
    await page.goto(`/invite/${value}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Join the team.");
    await page.getByRole("button", { name: /join|accept/i }).first().click();
  }

  test("the right address joins and goes Home", async ({ page }) => {
    // A unique address per run would need a new account; the viewer's own address keeps the data as seeded.
    await query("delete from business_invites where email = $1 and accepted_at is null and revoked_at is null", [ACCOUNTS["kulkarni-viewer"].email]);
    await accept(page, await invite({ email: ACCOUNTS["kulkarni-viewer"].email }));
    await page.waitForURL((url) => url.pathname === "/", { timeout: 30_000 });
  });

  for (const [name, input, message] of [
    ["a wrong address", { email: "someone-else@example.test" }, /different email|another address|sent to/i],
    ["an expired invitation", { email: "e2e+expired@example.test", expiresIn: -DAY }, /expired/i],
    ["a revoked invitation", { email: "e2e+revoked@example.test", revoked: true }, /withdrew|withdrawn|revoked|no longer/i],
    ["a used invitation", { email: "e2e+used@example.test", used: true }, /already|used/i],
  ] as const) {
    test(`${name} is refused with a reason and changes nothing`, async ({ page }) => {
      await accept(page, await invite(input));
      await expect(page.locator("main, body").getByRole("alert").filter({ hasText: message })).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveURL(/\/invite\//);
    });
  }

  test("signed out, the invitation offers sign in and create an account, both coming back here", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const value = token();
    await page.goto(`/invite/${value}`);
    const signIn = page.getByRole("link", { name: "Sign in" });
    await expect(signIn).toHaveAttribute("href", `/login?next=${encodeURIComponent(`/invite/${value}`)}`);
    await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", new RegExp(`next=${encodeURIComponent(`/invite/${value}`)}`));
    await context.close();
  });

  test("a malformed invitation link says it is not valid", async ({ page }) => {
    await page.goto("/invite/not-a-token");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("This invitation link is not valid.");
  });
});

test.describe("the next return after sign-in", () => {
  // Fresh sign-ins: one per account, so the per-address limit is never hit.
  async function signInWithNext(browser: Browser, key: keyof typeof ACCOUNTS, next: string): Promise<string> {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await signInThroughForm(page, key, `/login?next=${encodeURIComponent(next)}`);
    await settle(page);
    const landed = new URL(page.url());
    await context.close();
    return `${landed.pathname}${landed.search}`;
  }

  test("an invitation page is honoured", async ({ browser }) => {
    const value = token();
    expect(await signInWithNext(browser, "kulkarni-editor", `/invite/${value}`)).toBe(`/invite/${value}`);
  });

  test("outside addresses and invalid paths are ignored", async ({ browser }) => {
    // One sign-in per account, so three accounts; all land where they normally would.
    expect(await signInWithNext(browser, "patel", "https://evil.example/steal")).not.toMatch(/evil/);
    expect(await signInWithNext(browser, "reddy", "//evil.example/steal")).not.toMatch(/evil/);
    expect(await signInWithNext(browser, "chatterjee", "/unknown-unmapped-top-level")).not.toBe("/unknown-unmapped-top-level");
  });

  test("a safe workspace page is honoured", async ({ browser }) => {
    expect(await signInWithNext(browser, "chatterjee", "/settings/delete")).toBe("/settings/delete");
  });

  test("the sign-in page never puts an outside next into its links", async ({ page }) => {
    await page.goto(`/login?next=${encodeURIComponent("https://evil.example")}`);
    const hrefs = await page.locator("a, form input[type=hidden]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href") ?? (node as HTMLInputElement).value));
    expect(hrefs.filter((href) => /evil/.test(href ?? ""))).toEqual([]);
  });
});

/* Old addresses ----------------------------------------------------------------------------------------------------- */

interface Hop {
  readonly url: string;
  readonly status: number;
}

/** Follows redirects one at a time, so each hop's status is seen. Stops at 10 hops or a repeat (a loop). */
async function follow(request: APIRequestContext, path: string): Promise<{ readonly hops: readonly Hop[]; readonly loop: boolean }> {
  const hops: Hop[] = [];
  let url = new URL(path, "http://localhost:3197").href;
  for (let step = 0; step < 10; step += 1) {
    if (hops.some((hop) => hop.url === url)) return { hops, loop: true };
    let response = await request.get(url, { maxRedirects: 0, failOnStatusCode: false });
    // The dev server (Turbopack) sometimes answers 500 to concurrent first compiles; a production build does not. Ask again.
    for (let retry = 0; retry < 3 && response.status() === 500 && DEV_RACE.test(await response.text()); retry += 1) {
      response = await request.get(url, { maxRedirects: 0, failOnStatusCode: false });
    }
    hops.push({ url, status: response.status() });
    const location = response.headers().location;
    if (response.status() < 300 || response.status() >= 400 || location === undefined) return { hops, loop: false };
    url = new URL(location, url).href;
  }
  return { hops, loop: true };
}

const pathOf = (hop: Hop | undefined): string => {
  if (hop === undefined) return "";
  const url = new URL(hop.url);
  return `${url.pathname}${url.search}`;
};

/**
 * Old path, where its first redirect must point (null: it is still served at the same address), and where a signed-in
 * owner of a live business (Kulkarni) ends. `final` may be a RegExp. Ids are filled in at run time.
 */
interface OldPath {
  readonly old: string;
  readonly to: string | RegExp | null;
  readonly final: string | RegExp;
  /** The final answer for a signed-in owner, when it is not 200 (or any of a list). */
  readonly status?: number | readonly number[];
}

function oldPaths(ids: { readonly ticket: string; readonly payment: string }): readonly OldPath[] {
  return [
    { old: "/login", to: null, final: /^\/(\?.*)?$/ },
    { old: "/login?new=1&plan=managed-website", to: /^\/signup\?plan=managed-website/, final: /^\// },
    { old: "/join?plan=managed-website", to: "/signup?plan=managed-website", final: /^\// },
    { old: "/forgot-password", to: null, final: /^\// },
    { old: "/reset-password/abc", to: null, final: "/reset-password/abc" },
    { old: "/setup/abc", to: null, final: "/setup/abc" },
    { old: "/restore-account", to: null, final: /^\// },
    { old: "/restore-account/keep-plan", to: null, final: /^\// },
    { old: "/personalize", to: /^\/start/, final: /^\// },
    { old: "/plan", to: /^\/checkout/, final: /^\// },
    { old: "/onboarding/review?payment=received", to: /^\/checkout\?payment=received/, final: /^\// },
    { old: "/billing", to: null, final: "/billing" },
    { old: "/billing?payment=received", to: null, final: /^\/billing/ },
    // Razorpay's window only: the fake provider used locally answers 404 here by design.
    { old: "/billing/pay", to: /^\/checkout\/pay/, final: /^\//, status: 404 },
    { old: `/billing/charges/${ids.payment}/pay`, to: `/checkout/charges/${ids.payment}`, final: /^\//, status: 404 },
    { old: `/billing/receipts?ids=${ids.payment}`, to: null, final: `/billing/receipts?ids=${ids.payment}` },
    { old: "/services", to: "/billing", final: "/billing" },
    { old: "/add-ons", to: /^\/(billing|services)/, final: "/billing" },
    { old: "/", to: null, final: "/" },
    { old: "/?welcome=1", to: null, final: "/?welcome=1" },
    { old: "/todo", to: "/", final: "/" },
    { old: "/monitoring", to: "/", final: "/" },
    { old: "/onboarding", to: "/checklist", final: "/checklist" },
    { old: "/onboarding/business", to: /^\/checklist/, final: /^\/checklist/ },
    { old: "/onboarding/brand", to: /^\/checklist/, final: /^\/checklist/ },
    { old: "/onboarding/content", to: /^\/checklist/, final: /^\/checklist/ },
    { old: "/onboarding/domain", to: /^\/checklist/, final: /^\/checklist/ },
    { old: "/requests", to: null, final: "/requests" },
    // Opens the request's sheet over the list (the sheet's own address), so it stays.
    { old: `/requests?open=${ids.ticket}`, to: null, final: `/requests?open=${ids.ticket}` },
    { old: "/requests/new", to: "/requests?new=1", final: "/requests?new=1" },
    { old: "/requests/new?kind=website&page=Services", to: /^\/requests\?new=1&kind=website&page=Services$/, final: /^\/requests\?new=1&kind=website&page=Services$/ },
    { old: "/requests/calls", to: "/help", final: "/help" },
    { old: "/support", to: "/requests", final: "/requests" },
    { old: `/support/${ids.ticket}`, to: `/requests/${ids.ticket}`, final: `/requests/${ids.ticket}` },
    { old: "/support/not-a-ticket", to: null, final: "/support/not-a-ticket", status: 404 },
    { old: "/website", to: null, final: "/website" },
    { old: "/project", to: "/website", final: "/website" },
    { old: "/website/pages", to: null, final: "/website/pages" },
    { old: "/website/enquiries", to: "/enquiries", final: "/enquiries" },
    { old: "/website/enquiries?page=2", to: /^\/enquiries/, final: /^\/enquiries/ },
    { old: "/website/enquiries/leads", to: "/enquiries", final: "/enquiries" },
    { old: "/website/enquiries/name", to: /^\/enquiries/, final: /^\/enquiries/ },
    { old: "/oyechats", to: "/enquiries", final: "/enquiries" },
    { old: "/domain", to: "/website/domain", final: "/website/domain" },
    { old: "/content", to: "/website/blog", final: "/website/blog" },
    { old: "/content/blog", to: "/website/blog", final: "/website/blog" },
    { old: "/content/blog/new", to: "/website/blog/new", final: "/website/blog/new" },
    { old: "/content/blog/987654", to: "/website/blog/987654", final: "/website/blog/987654", status: 404 },
    { old: "/content/blog/settings", to: /^\/(website\/blog\/categories|content\/categories)$/, final: "/website/blog/categories" },
    { old: "/content/authors", to: "/website/blog/authors", final: "/website/blog/authors" },
    { old: "/content/authors/new", to: "/website/blog/authors/new", final: "/website/blog/authors/new" },
    { old: "/content/categories", to: "/website/blog/categories", final: "/website/blog/categories" },
    { old: "/content/categories/new", to: "/website/blog/categories/new", final: "/website/blog/categories/new" },
    { old: "/details", to: "/business", final: "/business" },
    { old: "/social", to: null, final: "/social" },
    { old: "/search", to: null, final: "/search" },
    { old: "/changelog", to: null, final: "/changelog" },
    { old: "/settings", to: null, final: "/settings" },
    { old: "/settings/privacy", to: null, final: "/settings/privacy" },
    // A download, limited to a few an hour: 429 once a run or two have taken it.
    { old: "/settings/privacy/export", to: null, final: "/settings/privacy/export", status: [200, 429] },
    { old: "/settings/delete", to: null, final: "/settings/delete" },
    { old: "/media/00000000-0000-0000-0000-000000000000", to: null, final: /^\/media\//, status: 404 },
    { old: "/deliverable-images/00000000-0000-0000-0000-000000000000", to: null, final: /^\/deliverable-images\//, status: 404 },
    { old: "/support-attachments/00000000-0000-0000-0000-000000000000", to: null, final: /^\/support-attachments\//, status: 404 },
    { old: "/listing", to: null, final: "/listing", status: 404 },
  ];
}

const matches = (value: string, expected: string | RegExp): boolean => (typeof expected === "string" ? value === expected : expected.test(value));

async function ids(): Promise<{ ticket: string; payment: string }> {
  const business = await businessIdOf("kulkarni-physio-wellness");
  const ticket = String((await query("select ticket_id from change_requests where business_id = $1 order by created_at limit 1", [business])).rows[0]?.ticket_id);
  const payment = String((await query("select id from payments where business_id = $1 order by created_at limit 1", [business])).rows[0]?.id);
  return { ticket, payment };
}

test.describe("old addresses, signed in (Kulkarni owner)", () => {
  test.use({ storageState: storageStatePath("kulkarni") });

  test("every old path redirects once, permanently, to its new home, with no 404 or loop", async ({ page }) => {
    test.setTimeout(600_000);
    const problems: string[] = [];
    for (const entry of oldPaths(await ids())) {
      const { hops, loop } = await follow(page.request, entry.old);
      const first = hops[0];
      const last = hops.at(-1);
      const chain = hops.map((hop) => `${hop.status} ${pathOf(hop)}`).join(" > ");
      if (loop) problems.push(`${entry.old}: redirect loop (${chain})`);
      if (entry.to === null) {
        if (hops.length > 1 && entry.old !== "/login" && !entry.old.startsWith("/restore-account") && entry.old !== "/forgot-password") {
          // Served at the same address: any redirect here is a guard sending the owner elsewhere.
          if (!matches(pathOf(last), entry.final)) problems.push(`${entry.old}: expected to stay, went ${chain}`);
        }
      } else {
        if (first === undefined || ![301, 308].includes(first.status)) problems.push(`${entry.old}: first answer ${first?.status}, not a permanent redirect (${chain})`);
        const target = pathOf(hops[1]);
        if (!matches(target, entry.to)) problems.push(`${entry.old}: redirects to ${target}, expected ${String(entry.to)}`);
      }
      if (!matches(pathOf(last), entry.final)) problems.push(`${entry.old}: ends at ${pathOf(last)}, expected ${String(entry.final)} (${chain})`);
      const allowed = [entry.status ?? 200].flat();
      if (!allowed.includes(last?.status ?? 0)) problems.push(`${entry.old}: ends with ${last?.status}, expected ${allowed.join(" or ")} (${chain})`);
    }
    expect(problems).toEqual([]);
  });
});

test.describe("old addresses, signed out", () => {
  test("every old path ends on its public page, sign in, or a 404, never a loop or a server error", async ({ request }) => {
    test.setTimeout(600_000);
    const problems: string[] = [];
    for (const entry of oldPaths({ ticket: "01a1a03b-45ba-7963-8030-8c0ff90d65b3", payment: "01a1a03a-dea2-741e-b25c-51adc60a7020" })) {
      const { hops, loop } = await follow(request, entry.old);
      const last = hops.at(-1);
      const chain = hops.map((hop) => `${hop.status} ${pathOf(hop)}`).join(" > ");
      if (loop) problems.push(`${entry.old}: redirect loop (${chain})`);
      if ((last?.status ?? 0) >= 500) problems.push(`${entry.old}: server error (${chain})`);
      const ended = pathOf(last);
      // File and download routes answer a bare 401 instead of a sign-in page.
      const fileRoute = /^\/(media|deliverable-images|support-attachments|settings\/privacy\/export|billing\/receipts)/.test(ended) && last?.status === 401;
      const fine = fileRoute || ended.startsWith("/login") || ended.startsWith("/signup") || last?.status === 404 || /^\/(forgot-password|reset-password|setup|restore-account)/.test(ended);
      if (!fine) problems.push(`${entry.old}: signed out, ends at ${ended} with ${last?.status} (${chain})`);
      if (entry.to !== null && hops.length > 1 && ![301, 307, 308].includes(hops[0]?.status ?? 0)) problems.push(`${entry.old}: first answer ${hops[0]?.status} (${chain})`);
    }
    expect(problems).toEqual([]);
  });
});
