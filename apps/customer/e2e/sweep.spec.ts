import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, storageStatePath, type AccountKey } from "./accounts";
import { knownIssueFor } from "./known-issues";

/*
 * Screen sweep: every page the sidebar and tabs offer, for each seeded state, at 1440 and 390. Each visit checks console
 * errors, server error text, axe (serious and critical), sideways scroll on phones, the page title and leftover
 * "undefined", "NaN" or "Invalid Date" text, and saves a full-page screenshot to e2e/screens/<account>/<route>-<size>.png.
 * Findings listed in known-issues.ts (each with its E2E-REVIEW.md reference) are reported but do not fail the test.
 */

const SWEPT: readonly AccountKey[] = ["om-sweets", "patel", "kulkarni", "kulkarni-viewer", "reddy", "chatterjee", "iyer"];

interface Route {
  readonly name: string;
  readonly path: string;
  /** For a detail page: open `path`, then follow the first link whose href matches. */
  readonly follow?: RegExp;
  /** For the enquiry sheet: open `path`, then click the first table row and reload the `?open=` address it sets. */
  readonly openFirstRow?: boolean;
}

const ROUTES: readonly Route[] = [
  { name: "home", path: "/" },
  { name: "checklist", path: "/checklist" },
  { name: "enquiries", path: "/enquiries" },
  { name: "enquiries-open", path: "/enquiries", openFirstRow: true },
  { name: "requests", path: "/requests" },
  { name: "request-detail", path: "/requests", follow: /^\/requests\/[0-9a-f-]{36}$/ },
  { name: "website", path: "/website" },
  { name: "website-pages", path: "/website/pages" },
  { name: "website-blog", path: "/website/blog" },
  { name: "website-blog-authors", path: "/website/blog/authors" },
  { name: "website-blog-categories", path: "/website/blog/categories" },
  { name: "website-domain", path: "/website/domain" },
  { name: "social", path: "/social" },
  { name: "social-content", path: "/social/content" },
  { name: "social-ads", path: "/social/ads" },
  { name: "social-accounts", path: "/social/accounts" },
  { name: "search", path: "/search" },
  { name: "reports", path: "/reports" },
  { name: "report-month", path: "/reports", follow: /^\/reports\/\d{4}-\d{2}$/ },
  { name: "business", path: "/business" },
  { name: "business-brand", path: "/business/brand" },
  { name: "billing", path: "/billing" },
  { name: "billing-invoices", path: "/billing/invoices" },
  { name: "billing-payment", path: "/billing/payment" },
  { name: "settings", path: "/settings" },
  { name: "settings-security", path: "/settings/security" },
  { name: "settings-notifications", path: "/settings/notifications" },
  { name: "settings-team", path: "/settings/team" },
  { name: "settings-privacy", path: "/settings/privacy" },
  { name: "settings-delete", path: "/settings/delete" },
  { name: "help", path: "/help" },
  { name: "help-contact", path: "/help/contact" },
  { name: "changelog", path: "/changelog" },
];

const SWEPT_PATHS = new Set(ROUTES.map((route) => route.path));

export type Check = "console" | "server-error" | "axe" | "overflow" | "title" | "bad-text" | "status" | "unswept-link" | "not-found";

export interface Finding {
  readonly check: Check;
  readonly detail: string;
}

const SERVER_ERROR_TEXT = [/Application error/i, /Internal Server Error/i, /Unhandled Runtime Error/i, /Something went wrong/i, /Server Error/];
const BAD_TEXT = /\bundefined\b|\bNaN\b|Invalid Date|\[object Object\]/;

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
}

async function open(page: Page, route: Route): Promise<{ status: number | null; skipped?: string }> {
  const response = await page.goto(route.path);
  await settle(page);
  if (route.follow !== undefined) {
    const hrefs = await page.locator("main a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    let target = hrefs.find((href) => route.follow?.test(href));
    if (target === undefined && (await page.locator("main table tbody tr").count()) > 0) {
      // Rows that open an inspector (`?open=`) holding the link to the full page.
      await page.locator("main table tbody tr").first().click();
      await page.waitForTimeout(1_000);
      const inInspector = await page.locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
      target = inInspector.find((href) => route.follow?.test(href));
    }
    if (target === undefined) return { status: response?.status() ?? null, skipped: `no link matching ${route.follow} on ${page.url()}` };
    const detail = await page.goto(target);
    await settle(page);
    return { status: detail?.status() ?? null };
  }
  if (route.openFirstRow === true) {
    const row = page.locator("main table tbody tr").first();
    if ((await row.count()) === 0) return { status: response?.status() ?? null, skipped: `no enquiry rows on ${page.url()}` };
    await row.click();
    await page.waitForURL(/[?&]open=/, { timeout: 10_000 }).catch(() => undefined);
    if (!/[?&]open=/.test(page.url())) return { status: response?.status() ?? null, skipped: "clicking a row did not set ?open=" };
    const deep = await page.goto(page.url());
    await settle(page);
    return { status: deep?.status() ?? null };
  }
  return { status: response?.status() ?? null };
}

for (const account of SWEPT) {
  test.describe(`sweep ${account}`, () => {
    test.use({ storageState: storageStatePath(account) });

    for (const route of ROUTES) {
      test(`${account} ${route.name}`, async ({ page }, testInfo) => {
        const size = testInfo.project.name;
        const findings: Finding[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") findings.push({ check: "console", detail: message.text().slice(0, 300) });
        });
        page.on("pageerror", (error) => findings.push({ check: "console", detail: `pageerror: ${error.message.slice(0, 300)}` }));

        const { status, skipped } = await open(page, route);
        if (skipped !== undefined) {
          test.info().annotations.push({ type: "skipped-route", description: skipped });
          test.skip(true, skipped);
          return;
        }
        if (status !== null && status >= 500) findings.push({ check: "status", detail: `HTTP ${status}` });
        if (status === 404) findings.push({ check: "not-found", detail: `HTTP 404 at ${page.url()}` });

        const bodyText = await page.locator("body").innerText();
        for (const pattern of SERVER_ERROR_TEXT) {
          if (pattern.test(bodyText)) findings.push({ check: "server-error", detail: `page shows ${pattern}` });
        }
        if ((await page.locator("nextjs-portal").count()) > 0) {
          const issues = await page.locator("nextjs-portal").evaluate((portal) => portal.shadowRoot?.textContent?.match(/(\d+) Issues?/)?.[0] ?? "");
          if (issues !== "") findings.push({ check: "console", detail: `Next dev overlay: ${issues}` });
        }
        const bad = bodyText.match(BAD_TEXT);
        if (bad !== null) {
          const at = bodyText.indexOf(bad[0]);
          findings.push({ check: "bad-text", detail: `"${bodyText.slice(Math.max(0, at - 60), at + 40).replace(/\s+/g, " ")}"` });
        }

        const title = await page.title();
        if (title.trim() === "" || /create next app/i.test(title)) findings.push({ check: "title", detail: `title is "${title}"` });

        if (size === "mobile") {
          const overflow = await page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
            wide: [...document.querySelectorAll("body *")]
              .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
              .filter((element) => getComputedStyle(element).position !== "fixed")
              .slice(0, 3)
              .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).split(" ").slice(0, 3).join(".")}`),
          }));
          if (overflow.scroll > overflow.client + 1) {
            findings.push({ check: "overflow", detail: `scrollWidth ${overflow.scroll} > ${overflow.client}: ${overflow.wide.join(", ")}` });
          }
        }

        const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        for (const violation of axe.violations) {
          if (violation.impact === "serious" || violation.impact === "critical") {
            const targets = violation.nodes.slice(0, 3).map((node) => node.target.join(" ")).join(" | ");
            findings.push({ check: "axe", detail: `${violation.impact} ${violation.id} (${violation.nodes.length}): ${targets}`.slice(0, 400) });
          }
        }

        const tabLinks = await page
          .locator("nav a[href^='/'], [role=tablist] a[href^='/']")
          .evaluateAll((links) => links.map((link) => (link.getAttribute("href") ?? "").split("?")[0] ?? ""));
        for (const href of new Set(tabLinks)) {
          if (href !== "" && !SWEPT_PATHS.has(href) && !/^\/(requests|reports)\//.test(href)) {
            findings.push({ check: "unswept-link", detail: href });
          }
        }

        // The desktop shell scrolls its page column inside a fixed-height frame: let it grow so the screenshot is the whole page.
        await page.evaluate(() => {
          for (let pass = 0; pass < 3; pass += 1) {
            for (const element of document.querySelectorAll<HTMLElement>("body *")) {
              const style = getComputedStyle(element);
              if (style.position === "fixed" || element.clientHeight < 300) continue;
              if (/(auto|scroll|hidden)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1) {
                element.style.overflow = "visible";
                element.style.height = "auto";
                element.style.maxHeight = "none";
              }
            }
          }
        });

        const dir = resolve(__dirname, "screens", account);
        mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: resolve(dir, `${route.name}-${size}.png`), fullPage: true });

        const unexpected = findings.filter((finding) => {
          const known = knownIssueFor({ account, route: route.name, size, finding });
          if (known !== null) testInfo.annotations.push({ type: `known ${known}`, description: `${finding.check}: ${finding.detail}` });
          return known === null && finding.check !== "unswept-link";
        });

        const resultsDir = resolve(__dirname, "sweep-results");
        mkdirSync(resultsDir, { recursive: true });
        writeFileSync(
          resolve(resultsDir, `${account}__${route.name}__${size}.json`),
          JSON.stringify({ account, label: ACCOUNTS[account].label, route: route.name, size, url: page.url(), title, status, findings }, null, 2),
        );

        expect(unexpected, `unexpected findings on ${page.url()}`).toEqual([]);
      });
    }
  });
}
