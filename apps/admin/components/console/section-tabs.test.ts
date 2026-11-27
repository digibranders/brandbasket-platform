// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { StaffRole } from "@brandbasket/db";
import { SectionTabs } from "./section-tabs";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(role: StaffRole, page: string): Promise<void> {
  await act(async () => root.render(createElement(SectionTabs, { role, page })));
}

const links = (): string[] => [...container.querySelectorAll("a")].map((link) => `${link.textContent}:${link.getAttribute("href")}`);

it("renders the item's pages as links and marks the current one", async () => {
  await render("admin", "/leads");
  expect(links()).toEqual(["Requests:/support", "Enquiries:/leads", "Reports to review:/reports"]);
  expect(container.querySelector('a[aria-current="page"]')?.textContent).toBe("Enquiries");
  expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe("Inbox");
});

it("lists the Money pages for every role, with the open one marked", async () => {
  for (const role of ["support", "finance"] as const) {
    await render(role, "/coupons");
    expect(links().map((entry) => entry.split(":")[0])).toEqual(["Payments", "Invoices", "Prices", "Coupons", "Payment links", "Affiliates", "Acquisition"]);
    expect(container.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
    expect(container.querySelector('a[aria-current="page"]')?.textContent).toBe("Coupons");
  }
});

it("renders nothing for a single-page item or a page no item holds", async () => {
  await render("admin", "/clients");
  expect(container.querySelector("nav")).toBeNull();
  await render("admin", "/ad-credit");
  expect(container.querySelector("nav")).toBeNull();
});

it("scrolls inside the strip instead of widening the page", async () => {
  await render("admin", "/deliveries");
  expect(container.querySelector("nav")?.className).toContain("overflow-x-auto");
  expect(links()).toEqual(["Health:/system", "Emails and webhooks:/deliveries", "App errors:/support/errors", "Settings:/settings", "Access:/staff"]);
});
