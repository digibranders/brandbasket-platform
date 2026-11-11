import { expect, test, type Locator, type Page } from "@playwright/test";
import { storageStatePath } from "./accounts";
import { answerStart, fillSignUp, settle, unique } from "./support";

/*
 * Keyboard-only use (plan 60, section 15): tab order, visible focus, no focus traps on pages, dialogs that keep focus
 * inside and give it back on close, the skip link, Command or Control K, and menus. Desktop size only. Nothing here
 * writes: every dialog is closed with Escape before it sends anything.
 */

interface Stop {
  readonly label: string;
  /** The element's look changes when it takes keyboard focus (outline, ring, border or background). */
  readonly visibleFocus: boolean;
}

/** Press Tab once and describe where focus went. Next's dev tools button (nextjs-portal) is skipped. */
async function tab(page: Page, key: "Tab" | "Shift+Tab" = "Tab"): Promise<Stop | null> {
  await page.keyboard.press(key);
  return page.evaluate(async () => {
    // Date inputs restyle their box a frame after an inner part takes focus.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const element = document.activeElement;
    if (!(element instanceof HTMLElement) || element === document.body || element.tagName === "NEXTJS-PORTAL") return null;
    const look = (target: Element): string => {
      const style = getComputedStyle(target);
      return [style.outlineStyle, style.outlineWidth, style.outlineColor, style.boxShadow, style.borderColor, style.backgroundColor, style.textDecorationLine].join("|");
    };
    const focused = look(element);
    // The same element at rest: a shallow copy beside it, never focused. Blurring the real one would reset date inputs
    // to their first part and fire blur handlers.
    const copy = element.cloneNode(false) as HTMLElement;
    copy.removeAttribute("id");
    copy.setAttribute("aria-hidden", "true");
    element.after(copy);
    const rest = look(copy);
    copy.remove();
    const name = (element.getAttribute("aria-label") ?? element.innerText ?? "").replace(/\s+/g, " ").trim();
    const fallback = element.getAttribute("name") ?? element.getAttribute("placeholder") ?? element.getAttribute("href") ?? "";
    return { label: `${element.tagName.toLowerCase()} "${(name || fallback).slice(0, 50)}"`, visibleFocus: focused !== rest };
  });
}

/** Tab through the page from the top and collect each stop until focus comes back to the first one (or `max` presses). */
async function tabCycle(page: Page, max = 120): Promise<{ readonly stops: readonly Stop[]; readonly wrapped: boolean }> {
  // Focus rings fade in over 100ms; without transitions the focused look can be read at once.
  await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; }" });
  const stops: Stop[] = [];
  for (let press = 0; press < max; press += 1) {
    const stop = await tab(page);
    if (stop === null) continue;
    if (stops.length > 0 && stop.label === stops[0]?.label) return { stops, wrapped: true };
    stops.push(stop);
  }
  return { stops, wrapped: false };
}

function expectVisibleFocus(stops: readonly Stop[]): void {
  // A date input is one stop per part (day, month, year); its box shows focus once, read on whichever part was caught.
  const shown = new Set(stops.filter((stop) => stop.visibleFocus).map((stop) => stop.label));
  const hidden = stops.filter((stop) => !shown.has(stop.label)).map((stop) => stop.label);
  expect(hidden, "every tab stop shows that it has focus").toEqual([]);
}

/** Focus `target` by keyboard: tab until it is the active element. */
async function tabTo(page: Page, target: Locator, max = 80): Promise<void> {
  const handle = await target.elementHandle();
  for (let press = 0; press < max; press += 1) {
    if (await page.evaluate((element) => document.activeElement === element, handle)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Tab never reached the target.");
}

/**
 * Focus is inside `dialog` now and stays there for `presses` tabs (focus is trapped in dialogs). Base UI's focus guards
 * sit just outside the popup and hand focus back on the next frame, so each check waits for that.
 */
async function expectFocusTrapped(page: Page, dialog: Locator, presses = 25): Promise<void> {
  const handle = await dialog.elementHandle();
  const where = () =>
    page.evaluate((root) => {
      const active = document.activeElement;
      return root?.contains(active) === true ? "inside" : (active?.outerHTML.slice(0, 160) ?? "nothing");
    }, handle);
  for (let press = 0; press < presses; press += 1) {
    await expect.poll(where, { message: `focus inside the dialog after ${press} tabs`, timeout: 2_000 }).toBe("inside");
    await page.keyboard.press("Tab");
  }
}

async function expectFocused(page: Page, target: Locator): Promise<void> {
  const handle = await target.elementHandle();
  await expect.poll(() => page.evaluate((element) => document.activeElement === element, handle), { timeout: 5_000 }).toBe(true);
}

/** Open a dialog from `trigger` with Enter, check focus stays inside, close with Escape and check focus comes back. */
async function dialogRoundTrip(page: Page, trigger: Locator, name: string | RegExp): Promise<void> {
  await tabTo(page, trigger);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();
  await expectFocusTrapped(page, dialog);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expectFocused(page, trigger);
}

test.describe("signed out", () => {
  test("sign in: fields in order, visible focus, Enter submits", async ({ page }) => {
    await page.goto("/login");
    await settle(page);
    const { stops, wrapped } = await tabCycle(page);
    expect(wrapped, "focus leaves the page and comes back: no trap").toBe(true);
    expect(stops.slice(0, 4).map((stop) => stop.label)).toEqual([
      expect.stringMatching(/^input/),
      expect.stringMatching(/^input/),
      'button "Show password"',
      'button "Sign in"',
    ]);
    expectVisibleFocus(stops);
    // Enter in the password field submits. Sign-in never says which field was wrong, so the answer is one announced banner.
    await page.getByLabel("Password", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("form").getByRole("alert")).toContainText("Enter your email or mobile number.");
  });

  test("sign up: fields in visual order, checkbox with Space, visible focus", async ({ page }) => {
    await page.goto("/signup");
    await settle(page);
    const { stops, wrapped } = await tabCycle(page);
    expect(wrapped).toBe(true);
    expectVisibleFocus(stops);
    const labels = stops.map((stop) => stop.label);
    const order = ['button "Show password"', 'button "Continue"', 'a "Sign in"'].map((label) => labels.indexOf(label));
    expect(order.every((index, position) => index >= 0 && (position === 0 || index > (order[position - 1] ?? -1)))).toBe(true);
    const agree = page.getByRole("checkbox", { name: /I agree/ });
    await tabTo(page, agree);
    await page.keyboard.press("Space");
    await expect(agree).toBeChecked();
  });

  test("forgot password: visible focus, no trap", async ({ page }) => {
    await page.goto("/forgot-password");
    await settle(page);
    const { stops, wrapped } = await tabCycle(page);
    expect(wrapped).toBe(true);
    expectVisibleFocus(stops);
  });
});

test.describe("checkout (unpaid account)", () => {
  test("checkout on a new sign-up: every field and Pay reachable, visible focus, no trap", async ({ page }) => {
    test.setTimeout(240_000);
    // A seeded unpaid account has not answered the questions, so /checkout sends it to /start; a new sign-up gets there.
    // This makes one business per run, as the sign-up flow in flows.spec.ts does.
    await fillSignUp(page, `e2e+kbd-${unique()}@example.test`);
    await page.getByLabel("Code", { exact: true }).fill("123456");
    await page.getByRole("button", { name: /^(Verify and continue|Continue)$/ }).click();
    await page.waitForURL((url) => url.pathname !== "/signup", { timeout: 60_000 });
    await settle(page);
    await answerStart(page);
    await expect(page).toHaveURL(/\/checkout/);
    await settle(page);
    const { stops, wrapped } = await tabCycle(page);
    expect(wrapped).toBe(true);
    expectVisibleFocus(stops);
    expect(stops.some((stop) => /^button "Pay /.test(stop.label))).toBe(true);
  });
});

test.describe("start questions (unpaid account)", () => {
  test.use({ storageState: storageStatePath("iyer") });

  test("start questions: visible focus, no trap", async ({ page }) => {
    await page.goto("/start");
    await settle(page);
    const { stops, wrapped } = await tabCycle(page);
    expect(wrapped).toBe(true);
    expectVisibleFocus(stops);
  });
});

test.describe("workspace (Kulkarni owner)", () => {
  test.use({ storageState: storageStatePath("kulkarni") });

  test("skip link is the first stop and moves focus to the page", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#page")).toBeFocused();
    // The next Tab lands inside the page, past the sidebar and top bar.
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.getElementById("page")?.contains(document.activeElement) ?? false)).toBe(true);
  });

  for (const path of ["/", "/requests", "/enquiries", "/billing", "/settings/team", "/business", "/website/blog"]) {
    test(`${path}: whole page by keyboard, visible focus, no trap`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const { stops, wrapped } = await tabCycle(page, 200);
      expect(wrapped, `focus leaves the page and comes back; last stops: ${stops.slice(-6).map((stop) => stop.label).join(", ")}`).toBe(true);
      expectVisibleFocus(stops);
    });
  }

  test("requests: Enter opens the sheet, Escape closes it, focus returns to the row", async ({ page }) => {
    await page.goto("/requests");
    await settle(page);
    const row = page.locator("main table tbody tr").first().getByRole("button").first();
    await tabTo(page, row);
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/[?&]open=/);
    await expectFocusTrapped(page, sheet);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]open=/);
    await expectFocused(page, row);
  });

  test("enquiries: Enter opens the sheet, Escape closes it, focus returns to the row", async ({ page }) => {
    await page.goto("/enquiries");
    await settle(page);
    const row = page.locator("main table tbody tr").first().getByRole("button").first();
    await tabTo(page, row, 120);
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expectFocusTrapped(page, sheet);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expectFocused(page, row);
  });

  test("new request dialog: open by keyboard, trapped, Escape returns focus", async ({ page }) => {
    await page.goto("/requests");
    await settle(page);
    const trigger = page.locator("main").getByRole("link", { name: "New request" }).or(page.locator("main").getByRole("button", { name: "New request" })).first();
    await dialogRoundTrip(page, trigger, "New request");
  });

  test("book a call dialog: open by keyboard, trapped, Escape returns focus", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await dialogRoundTrip(page, page.locator("main").getByRole("button", { name: "Book a call" }), "Book a call");
  });

  test("cancel a service dialog: open by keyboard, trapped, Escape returns focus", async ({ page }) => {
    await page.goto("/billing");
    await settle(page);
    await dialogRoundTrip(page, page.locator("main").getByRole("button", { name: "Cancel a service" }), "Cancel a service");
  });

  test("invite dialog: open by keyboard, trapped, Escape returns focus", async ({ page }) => {
    await page.goto("/settings/team");
    await settle(page);
    await dialogRoundTrip(page, page.locator("main").getByRole("button", { name: "Invite someone" }), "Invite someone");
  });

  for (const shortcut of ["Control+k", "Meta+k"]) {
    test(`search opens with ${shortcut}, arrows and Enter go to a page, Escape returns focus`, async ({ page }) => {
      await page.goto("/");
      await settle(page);
      const before = page.getByRole("link", { name: "Skip to content" });
      await page.keyboard.press("Tab");
      await page.keyboard.press(shortcut);
      const search = page.getByRole("dialog", { name: "Search" });
      await expect(search).toBeVisible();
      await expect(search.getByRole("combobox", { name: "Search pages" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(search).toBeHidden();
      await expectFocused(page, before);

      await page.keyboard.press(shortcut);
      await expect(search.getByRole("combobox", { name: "Search pages" })).toBeFocused();
      await page.keyboard.type("invoices");
      await expect(search.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/billing\/invoices/);
    });
  }

  test("account menu: Enter opens, arrows move, Escape closes and returns focus", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const trigger = page.getByRole("button", { name: /Anjali Kulkarni/ }).first();
    await tabTo(page, trigger);
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const items = menu.getByRole("menuitem");
    expect(await items.count()).toBeGreaterThan(1);
    await page.keyboard.press("ArrowDown");
    const first = await page.evaluate(() => document.activeElement?.textContent ?? "");
    await page.keyboard.press("ArrowDown");
    const second = await page.evaluate(() => document.activeElement?.textContent ?? "");
    expect(second).not.toBe(first);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expectFocused(page, trigger);
  });

  test("service options menu: Enter opens, Escape closes and returns focus", async ({ page }) => {
    await page.goto("/billing");
    await settle(page);
    const trigger = page.getByRole("button", { name: /^Options for / }).first();
    await tabTo(page, trigger);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expectFocused(page, trigger);
  });

  test("notifications: Enter opens, Escape closes and returns focus", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const trigger = page.getByRole("button", { name: /^Notifications/ });
    await tabTo(page, trigger);
    await page.keyboard.press("Enter");
    const popup = page.getByRole("dialog").or(page.getByRole("menu")).first();
    await expect(popup).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expectFocused(page, trigger);
  });
});
