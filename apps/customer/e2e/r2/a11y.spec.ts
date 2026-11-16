import { expect, test } from "@playwright/test";
import { settle } from "../support";
import { axeRoute, dialogKeyboard, tabStops } from "./axe";
import { statePath, type FixtureKey } from "./fixtures";

/* Axe sweep (wcag2a, wcag2aa, wcag22aa) over the real customer routes, and the keyboard pass, at 1440, 768 and 390. */

const SIGNED_OUT = ["/login", "/signup", "/forgot-password"];
const SIGNED_IN = [
  "/", "/website", "/website/pages", "/website/domain", "/website/blog", "/requests", "/reports", "/business", "/business/brand", "/enquiries",
  "/billing", "/billing/invoices", "/billing/payment", "/settings", "/settings/security", "/settings/notifications", "/settings/team",
  "/settings/privacy", "/settings/delete", "/help", "/help/contact", "/changelog", "/checklist", "/social", "/social/content", "/social/ads",
  "/social/accounts", "/search",
];
const UNPAID = ["/start", "/help", "/settings"];

test.describe("axe: signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const route of SIGNED_OUT) {
    test(`axe ${route}`, async ({ page }, info) => {
      await page.goto(route);
      await axeRoute(page, "customer", route, info.project.name);
    });
  }
});

for (const [key, routes] of [["website", SIGNED_IN], ["unpaid", UNPAID], ["social", ["/", "/social", "/social/accounts"]], ["failing", ["/", "/billing"]]] as const satisfies readonly (readonly [FixtureKey, readonly string[]])[]) {
  test.describe(`axe: ${key} account`, () => {
    test.use({ storageState: statePath(key) });
    for (const route of routes) {
      test(`axe ${key} ${route}`, async ({ page }, info) => {
        const response = await page.goto(route);
        expect(response?.status() ?? 0, `${route} loads`).toBeLessThan(500);
        await axeRoute(page, "customer", route, info.project.name);
      });
    }
  });
}

test.describe("keyboard pass", () => {
  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    for (const route of SIGNED_OUT) {
      test(`${route}: every control reachable, focus visible, no trap`, async ({ page }) => {
        await page.goto(route);
        await settle(page);
        const stops = await tabStops(page);
        expect(stops.length, `Tab reaches controls: ${JSON.stringify(stops)}`).toBeGreaterThan(2);
        expect(stops.filter((stop) => !stop.visible).map((stop) => stop.label), "every stop shows focus").toEqual([]);
        const primary = page.getByRole("button", { name: /sign in|continue|email me|send/i }).first();
        await expect(primary).toBeVisible();
        expect(stops.some((stop) => /sign in|continue|email me|send|reset/i.test(stop.label)), "primary action is in the tab order").toBe(true);
      });
    }
  });

  test.describe("signed in", () => {
    test.use({ storageState: statePath("website") });
    for (const route of ["/", "/website", "/requests", "/billing", "/settings/team"]) {
      test(`${route}: tab order reaches the page actions with visible focus`, async ({ page }) => {
        await page.goto(route);
        await settle(page);
        const stops = await tabStops(page, 150);
        expect(stops.length).toBeGreaterThan(3);
        expect(stops.filter((stop) => !stop.visible).map((stop) => stop.label), "every stop shows focus").toEqual([]);
        const actions = await page.locator("main").getByRole("button").or(page.locator("main").getByRole("link")).evaluateAll((nodes) =>
          nodes.filter((node) => (node as HTMLElement).offsetParent !== null && node.getAttribute("tabindex") !== "-1").map((node) => `${node.tagName.toLowerCase()} ${node.getAttribute("aria-label") ?? (node.textContent ?? "").trim().slice(0, 40)}`),
        );
        const missed = actions.filter((action) => !stops.some((stop) => stop.label === action));
        expect(missed, "every visible action in main is reached by Tab").toEqual([]);
      });
    }

    test("New request dialog traps focus, Escape closes and restores focus", async ({ page }) => {
      await page.goto("/requests");
      await settle(page);
      await dialogKeyboard(page, page.getByRole("link", { name: "New request" }).or(page.getByRole("button", { name: "New request" })).first(), () => page.getByRole("dialog"));
    });

    test("Invite dialog traps focus, Escape closes and restores focus", async ({ page }) => {
      await page.goto("/settings/team");
      await settle(page);
      await dialogKeyboard(page, page.getByRole("button", { name: "Invite someone" }), () => page.getByRole("dialog"));
    });
  });

  test.describe("checkout dialog", () => {
    test.use({ storageState: statePath("unpaid") });
    test("Confirm your plan traps focus and returns it to Pay", async ({ page }) => {
      await page.goto("/checkout");
      await settle(page);
      test.skip(!/\/checkout/.test(page.url()), "an unpaid account without answers is sent to /start");
      await dialogKeyboard(page, page.getByRole("button", { name: /^Pay / }).first(), () => page.getByRole("dialog", { name: "Confirm your plan" }));
    });
  });
});
