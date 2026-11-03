import { expect, test, type ConsoleMessage, type Page, type Request, type Response } from "@playwright/test";
import { storageStatePath } from "./accounts";
import { DEV_RACE, settle } from "./support";

/*
 * Loading, empty and error states in the running app (plan 60, section 13; plan 61, section 9), and the production-like
 * checks that need no build: no console errors, no failed requests, no layout shift in the sidebar. Server loaders cannot
 * be failed from the browser, so each panel's own error state is covered by the Vitest files
 * src/features/<name>/**\/states.test.tsx; here the browser side is failed instead: uploads, server actions and slow pages.
 * Nothing here writes: every failing request is answered by the test before it reaches the server.
 */

const NO_DATA = /\bNo data\b|undefined|NaN|\[object Object\]/;

async function oneHeading(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
}

test.describe("empty states (Om Sweets, kickoff stage)", () => {
  test.use({ storageState: storageStatePath("om-sweets") });

  for (const [path, heading, why] of [
    ["/requests", "No requests yet", /Follow it here/],
    ["/enquiries", "No enquiries yet", /they appear here/],
    ["/reports", "No report has been sent yet", /after your first full month/],
    ["/help", "No calls booked", /Book a call when you want to talk/],
  ] as const) {
    test(`${path}: says why it is empty and what will appear`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      await oneHeading(page);
      const main = page.locator("main");
      await expect(main.getByText(heading)).toBeVisible();
      await expect(main.getByText(why)).toBeVisible();
      expect(await main.innerText()).not.toMatch(NO_DATA);
    });
  }
});

test.describe("loading states (Kulkarni)", () => {
  test.use({ storageState: storageStatePath("kulkarni") });

  /**
   * Holds the next page's server answer for a while, so its loading state can be seen. Prefetches go through: they carry
   * the route's loading.tsx, which Next shows at once on the click.
   */
  async function slowNavigation(page: Page, path: string): Promise<void> {
    await page.route(
      (url) => url.pathname === path,
      async (route) => {
        const headers = route.request().headers();
        if (headers.rsc === "1" && headers["next-router-prefetch"] === undefined) await new Promise((resolve) => setTimeout(resolve, 2_500));
        await route.continue();
      },
    );
  }

  test("Business profile shows a skeleton under the shell while it loads", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await slowNavigation(page, "/business");
    const link = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Business profile" });
    await link.hover();
    await page.waitForTimeout(1_500);
    await link.click();
    await expect(page.locator("main [aria-busy=true]").first()).toBeVisible();
    // The shell stays while the page loads: no full-page spinner.
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Business profile" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("main [aria-busy=true]")).toHaveCount(0);
  });

  test("a page with no skeleton keeps the old page on screen until the new one is ready, never a blank", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const home = await page.getByRole("heading", { level: 1 }).innerText();
    await slowNavigation(page, "/requests");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Requests/ }).click();
    await page.waitForTimeout(1_000);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(home);
    await expect(page.getByRole("heading", { level: 1, name: "Requests" })).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("error states when the browser's request fails (Kulkarni)", () => {
  test.use({ storageState: storageStatePath("kulkarni") });

  test("a failed brand kit upload says so on the file and the page stays", async ({ page }) => {
    await page.route("**/api/brand-assets**", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "failed" }) }));
    await page.goto("/business/brand");
    await settle(page);
    const input = page.locator('main input[type="file"]').first();
    await input.setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex") });
    await expect(page.getByText(/could not|did not|failed|try again/i).first()).toBeVisible({ timeout: 30_000 });
    await oneHeading(page);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  });

  test("a save that fails on the way keeps the form and its changes on screen", async ({ page }) => {
    await page.goto("/business");
    await settle(page);
    await page.route("**/business", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"] !== undefined) return route.fulfill({ status: 500, body: "" });
      return route.continue();
    });
    const name = page.locator("main input").first();
    const before = await name.inputValue();
    await name.fill(`${before} `);
    const bar = page.getByRole("region", { name: "Unsaved changes" });
    await bar.getByRole("button", { name: /Save/ }).click();
    // The page is not replaced by the route's error screen, and the change is still there to try again.
    await expect(page.getByRole("heading", { level: 1, name: "Business profile" })).toBeVisible();
    await expect(name).toHaveValue(`${before} `);
    await expect(page.getByRole("alert").filter({ hasText: /could not|try again|went wrong/i }).first()).toBeVisible({ timeout: 15_000 });
  });
});

/* Production-like checks ---------------------------------------------------------------------------------------------- */

// Development-only noise: React's DevTools hint, Fast Refresh, Next's dev overlay and HMR socket.
const DEV_NOISE = /Download the React DevTools|\[Fast Refresh\]|\[HMR\]|webpack-hmr|turbopack|__nextjs|ReactDOM\.preload/i;

interface Watch {
  readonly errors: string[];
  readonly failed: string[];
  readonly devRaces: string[];
  readonly pending: Promise<unknown>[];
}

function watch(page: Page): Watch {
  const seen: Watch = { errors: [], failed: [], devRaces: [], pending: [] };
  page.on("console", (message: ConsoleMessage) => {
    // The browser's own "Failed to load resource" line repeats a response already judged below.
    const text = message.text();
    if (message.type() !== "error" || DEV_NOISE.test(text) || /^Failed to load resource/.test(text)) return;
    if (DEV_RACE.test(text)) seen.devRaces.push(`${page.url()}: ${text.slice(0, 160)}`);
    else seen.errors.push(`${page.url()}: ${text.slice(0, 200)}`);
  });
  page.on("pageerror", (error) => seen.errors.push(`${page.url()}: ${error.message.slice(0, 200)}`));
  page.on("requestfailed", (request: Request) => {
    const failure = request.failure()?.errorText ?? "";
    // A navigation that replaces an in-flight prefetch aborts it; that is not a failure.
    if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(failure) || DEV_NOISE.test(request.url())) return;
    seen.failed.push(`${request.method()} ${request.url()}: ${failure}`);
  });
  page.on("response", (response: Response) => {
    if (response.status() < 400 || DEV_NOISE.test(response.url())) return;
    const line = `${response.status()} ${response.request().method()} ${response.url()}`;
    // Turbopack's dev-only module race under parallel requests is told apart from a real failure by its message.
    seen.pending.push(
      response
        .text()
        .catch(() => "")
        .then((body) => (DEV_RACE.test(body) ? seen.devRaces.push(line) : seen.failed.push(line))),
    );
  });
  return seen;
}

const ROUTES = ["/", "/checklist", "/enquiries", "/requests", "/website", "/website/pages", "/website/blog", "/website/domain", "/social", "/social/content", "/social/ads", "/social/accounts", "/search", "/reports", "/business", "/business/brand", "/billing", "/billing/invoices", "/billing/payment", "/settings", "/settings/security", "/settings/notifications", "/settings/team", "/settings/privacy", "/help", "/help/contact", "/changelog"];

test.describe("production-like checks (Kulkarni)", () => {
  test.use({ storageState: storageStatePath("kulkarni") });

  test("no console errors and no failed requests on any workspace page", async ({ page }) => {
    test.setTimeout(600_000);
    const seen = watch(page);
    for (const path of ROUTES) {
      await page.goto(path);
      await settle(page);
    }
    await Promise.all(seen.pending);
    for (const race of seen.devRaces) test.info().annotations.push({ type: "dev server race (D-01)", description: race });
    expect(seen.errors).toEqual([]);
    expect(seen.failed).toEqual([]);
  });

  test("the sidebar does not move or resize when navigating through it", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto("/");
    await settle(page);
    const sidebar = page.getByRole("navigation", { name: "Main" });
    const box = async (): Promise<string> => {
      const rects = await sidebar.getByRole("link").evaluateAll((links) => links.map((link) => {
        const rect = link.getBoundingClientRect();
        return `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}`;
      }));
      return rects.join(" ");
    };
    // Layout shifts inside the sidebar, as the browser counts them.
    await page.evaluate(() => {
      const shifts: string[] = [];
      (window as unknown as { __sidebarShifts: string[] }).__sidebarShifts = shifts;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as { value: number; sources?: { node?: Node | null }[] }[]) {
          for (const source of entry.sources ?? []) {
            const node = source.node;
            const element = node instanceof Element ? node : node?.parentElement;
            if (element !== null && element !== undefined && element.closest("nav[aria-label='Main'], aside") !== null) shifts.push(`${element.tagName} ${entry.value.toFixed(4)}`);
          }
        }
      }).observe({ type: "layout-shift", buffered: false });
    });
    const start = await box();
    const labels = await sidebar.getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    for (const href of labels.filter((value) => value.startsWith("/"))) {
      await sidebar.locator(`a[href="${href}"]`).first().click();
      await page.waitForURL((url) => url.pathname === href, { timeout: 60_000 });
      await settle(page);
      expect(await box(), `sidebar links moved after opening ${href}`).toBe(start);
    }
    const shifts = await page.evaluate(() => (window as unknown as { __sidebarShifts: string[] }).__sidebarShifts);
    expect(shifts).toEqual([]);
  });
});
