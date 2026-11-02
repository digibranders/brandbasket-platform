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
  expect(links()).toEqual(["Requests:/support", "Enquiries:/leads"]);
  expect(container.querySelector('a[aria-current="page"]')?.textContent).toBe("Enquiries");
  expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe("Inbox");
});

it("lists the Money pages for finance, with the open one marked", async () => {
  await render("finance", "/coupons");
  expect(links().map((entry) => entry.split(":")[0])).toEqual(["Payments", "Invoices", "Prices", "Coupons", "Affiliates"]);
  expect(container.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
  expect(container.querySelector('a[aria-current="page"]')?.textContent).toBe("Coupons");
});

it("leaves out pages the role may not open, and renders nothing when only one is left", async () => {
  await render("support", "/ad-credit");
  expect(container.querySelector("nav")).toBeNull();
  await render("admin", "/ad-results");
  expect(links()).toEqual(["Ad credit:/ad-credit", "Ad results:/ad-results"]);
});

it("scrolls inside the strip instead of widening the page", async () => {
  await render("admin", "/deliveries");
  expect(container.querySelector("nav")?.className).toContain("overflow-x-auto");
  expect(links()).toEqual(["Settings:/settings", "App errors:/support/errors", "Emails and webhooks:/deliveries"]);
});
