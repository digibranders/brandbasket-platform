import { expect, test } from "../../customer/e2e/r2/pw";
import { axeRoute, dialogKeyboard, tabStops } from "../../customer/e2e/r2/axe";
import { CONSOLE_ORIGIN, consoleStatePath, fixture, settle } from "../../customer/e2e/r2/lite";

/* Axe sweep and keyboard pass over the console's real routes, at 1440, 768 and 390. */

const ROUTES = [
  "/", "/clients", "/projects", "/reports", "/calls", "/support", "/support/new", "/support/errors", "/leads", "/leads/new", "/payments", "/invoices",
  "/pricing", "/coupons", "/affiliates", "/ad-credit", "/ad-results", "/deliveries", "/outbox", "/staff", "/settings", "/access-log", "/privacy-requests",
  "/breaches", "/leaving", "/referrals",
];
const CLIENT_TABS = ["", "/website", "/services", "/billing", "/requests", "/people", "/activity", "/project"];

test.use({ storageState: consoleStatePath });

test.describe("axe: console", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("axe /login", async ({ page }, info) => {
    await page.goto(`${CONSOLE_ORIGIN}/login`);
    await axeRoute(page, "console", "/login", info.project.name);
  });
});

test.describe("axe: console, signed in", () => {
  for (const route of ROUTES) {
    test(`axe ${route}`, async ({ page }, info) => {
      const response = await page.goto(`${CONSOLE_ORIGIN}${route}`);
      expect(response?.status() ?? 0, `${route} loads`).toBeLessThan(500);
      await axeRoute(page, "console", route, info.project.name);
    });
  }
  for (const tab of CLIENT_TABS) {
    test(`axe client workspace ${tab || "overview"}`, async ({ page }, info) => {
      const id = fixture("website").businessId;
      const response = await page.goto(`${CONSOLE_ORIGIN}/clients/${id}${tab}`);
      expect(response?.status() ?? 0).toBeLessThan(500);
      await axeRoute(page, "console", `/clients/[id]${tab}`, info.project.name);
    });
  }
});

test.describe("keyboard pass: console", () => {
  for (const route of ["/", "/clients", "/payments", "/privacy-requests"]) {
    test(`${route}: tab order reaches actions with visible focus`, async ({ page }) => {
      await page.goto(`${CONSOLE_ORIGIN}${route}`);
      await settle(page);
      const stops = await tabStops(page, 150);
      expect(stops.length).toBeGreaterThan(3);
      expect(stops.filter((stop) => !stop.visible).map((stop) => stop.label), "every stop shows focus").toEqual([]);
    });
  }

  test("refund dialog traps focus, Escape closes and restores focus", async ({ page }) => {
    const id = fixture("website").businessId;
    await page.goto(`${CONSOLE_ORIGIN}/clients/${id}/billing`);
    await settle(page);
    await dialogKeyboard(page, page.getByRole("button", { name: /Refund/ }).first(), () => page.getByRole("dialog"));
  });
});
