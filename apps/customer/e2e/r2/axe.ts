import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Locator } from "@playwright/test";
import { settle, shot } from "./lite";

const LOG_DIR = resolve(__dirname, "../.logs-r2");

export interface Violation {
  readonly app: "customer" | "console";
  readonly route: string;
  readonly viewport: string;
  readonly rule: string;
  readonly impact: string;
  readonly nodes: number;
  readonly target: string;
  readonly screenshot: string | null;
}

/** Axe with the WCAG 2.0 A and AA and 2.2 AA tags. Every violation is appended to .results-r2/axe.jsonl; serious and critical ones fail the test. */
export async function axeRoute(page: Page, app: Violation["app"], route: string, viewport: string): Promise<void> {
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  mkdirSync(LOG_DIR, { recursive: true });
  const blocking = result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  let screenshot: string | null = null;
  if (blocking.length > 0) screenshot = await shot(page, `axe-${app}-${viewport}-${route.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "root"}`);
  for (const violation of result.violations) {
    const row: Violation = {
      app,
      route,
      viewport,
      rule: violation.id,
      impact: violation.impact ?? "unknown",
      nodes: violation.nodes.length,
      target: violation.nodes[0]?.target.join(" ").slice(0, 160) ?? "",
      screenshot: violation.impact === "serious" || violation.impact === "critical" ? screenshot : null,
    };
    appendFileSync(resolve(LOG_DIR, "axe.jsonl"), `${JSON.stringify(row)}\n`);
  }
  expect(blocking.map((violation) => `${violation.id} (${violation.impact}, ${violation.nodes.length})`), `${app} ${route} at ${viewport}`).toEqual([]);
}

/** Tab through the page until focus leaves it (the page's last control, or the dev overlay), returning every stop and whether it showed a focus indicator. */
export async function tabStops(page: Page, limit = 150): Promise<{ label: string; visible: boolean }[]> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const stops: { label: string; visible: boolean }[] = [];
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const element = document.activeElement;
      if (element === null || element === document.body || element.tagName === "NEXTJS-PORTAL" || element.closest("nextjs-portal") !== null) return null;
      if (element.hasAttribute("data-r2-seen")) return "wrapped" as const;
      element.setAttribute("data-r2-seen", "1");
      const style = getComputedStyle(element);
      const outlined = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
      return {
        label: `${element.tagName.toLowerCase()} ${element.getAttribute("aria-label") ?? ((element.textContent ?? "").trim().slice(0, 40) || element.getAttribute("name") || element.getAttribute("placeholder") || element.id)}`,
        visible: outlined || style.boxShadow !== "none" || element.matches(":focus-visible"),
      };
    });
    if (stop === null || stop === "wrapped") break;
    stops.push(stop);
  }
  return stops;
}

/** Open a dialog from its trigger by keyboard, check Tab stays inside, Escape closes it and focus returns. */
export async function dialogKeyboard(page: Page, trigger: Locator, dialog: () => Locator): Promise<void> {
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(dialog()).toBeVisible();
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    // Base UI's focus guards take focus for one animation frame and hand it back to the dialog; wait that frame out.
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    const inside = await dialog().evaluate((element) => element.contains(document.activeElement));
    expect(inside, "focus stays in the dialog").toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog()).toBeHidden();
  await expect(trigger, "focus returns to the trigger").toBeFocused();
}
