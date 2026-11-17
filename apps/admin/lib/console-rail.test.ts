import { describe, expect, it } from "vitest";
import { CONSOLE_RAIL, CONSOLE_RAIL_LINKS, currentHref, isCurrent, railCount, tabsFor } from "./console-rail";

const stripLabels = (page: string): string[] | null => tabsFor(page)?.pages.map((entry) => entry.label) ?? null;
const find = (label: string) => CONSOLE_RAIL.find((link) => link.label === label);

describe("the rail", () => {
  it("has the six items, in order, the same for everyone", () => {
    expect(CONSOLE_RAIL_LINKS.map((link) => link.label)).toEqual(["Today", "Clients", "Inbox", "Money", "Compliance", "System"]);
  });

  it("links each item to its first page", () => {
    expect(CONSOLE_RAIL_LINKS.map((link) => link.href)).toEqual(["/", "/clients", "/support", "/payments", "/privacy-requests", "/deliveries"]);
  });

  it("has no Calls, Ads, Team or Settings item, and no page left without an item that holds it", () => {
    const labels = CONSOLE_RAIL_LINKS.map((link) => link.label);
    for (const gone of ["Calls", "Ads", "Team", "Settings"]) expect(labels).not.toContain(gone);
    const pages = CONSOLE_RAIL.flatMap((group) => group.pages.map((page) => page.href));
    expect(new Set(pages).size).toBe(pages.length);
    for (const href of ["/leaving", "/breaches", "/privacy-requests", "/access-log", "/reports", "/staff", "/ad-results"]) expect(pages).toContain(href);
    for (const redirected of ["/calls", "/projects"]) expect(pages).not.toContain(redirected);
  });
});

describe("tabs under a page header", () => {
  it("shows every page of the item to everyone", () => {
    for (const page of ["/payments", "/invoices", "/pricing", "/coupons", "/affiliates", "/ad-results"]) {
      expect(stripLabels(page)).toEqual(["Payments", "Invoices", "Prices", "Coupons", "Affiliates", "Acquisition"]);
    }
  });

  it("groups Compliance: Privacy requests, Breaches, Closures and Access log", () => {
    for (const page of ["/privacy-requests", "/breaches", "/leaving", "/access-log"]) {
      expect(stripLabels(page)).toEqual(["Privacy requests", "Breaches", "Closures", "Access log"]);
    }
  });

  it("groups System: Emails and webhooks, App errors, Settings and Access", () => {
    for (const page of ["/deliveries", "/support/errors", "/settings", "/staff"]) {
      expect(stripLabels(page)).toEqual(["Emails and webhooks", "App errors", "Settings", "Access"]);
    }
  });

  it("puts Reports to review in Inbox with Requests and Enquiries", () => {
    for (const page of ["/support", "/leads", "/reports"]) expect(stripLabels(page)).toEqual(["Requests", "Enquiries", "Reports to review"]);
  });

  it("has no strip on a single-page item or an unlisted page", () => {
    for (const page of ["/", "/clients", "/calls", "/projects", "/ad-credit", "/no-access"]) expect(stripLabels(page)).toBeNull();
  });
});

describe("counts beside an item", () => {
  it("adds the Requests and Enquiries counts on Inbox", () => {
    const inbox = find("Inbox");
    expect(inbox && railCount(inbox, { requests: 3, leads: 2 })).toEqual({ value: 5, tone: "accent" });
    expect(inbox && railCount(inbox, { requests: 3 })).toEqual({ value: 3, tone: "accent" });
    expect(inbox && railCount(inbox, { requests: 0, leads: 0 })).toBeNull();
    expect(inbox && railCount(inbox, {})).toBeNull();
  });

  it("keeps the red failed-delivery count on System, and Today and Money counts in gold", () => {
    const system = find("System");
    const today = find("Today");
    const money = find("Money");
    expect(system && railCount(system, { deliveries: 4 })).toEqual({ value: 4, tone: "alert" });
    expect(today && railCount(today, { today: 5 })).toEqual({ value: 5, tone: "accent" });
    expect(money && railCount(money, { payments: 2 })).toEqual({ value: 2, tone: "accent" });
  });

  it("draws a count only from its own item's keys", () => {
    const clients = find("Clients");
    expect(clients && railCount(clients, { today: 5, requests: 2, deliveries: 1 })).toBeNull();
  });

  it("draws a sum in the loudest tone among the counts that are not zero", () => {
    const mixed = { label: "Mixed", icon: "inbox", countKeys: ["payments", "deliveries"], pages: [{ href: "/x", label: "X" }] } as const;
    expect(railCount(mixed, { payments: 1, deliveries: 1 })).toEqual({ value: 2, tone: "alert" });
    expect(railCount(mixed, { payments: 1, deliveries: 0 })).toEqual({ value: 1, tone: "accent" });
  });

  it("has no count on Clients or Compliance (no source yet)", () => {
    for (const label of ["Clients", "Compliance"]) expect(find(label)?.countKeys).toBeUndefined();
  });
});

describe("the current item", () => {
  it("matches Today exactly and the rest by path", () => {
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/clients", "/")).toBe(false);
    expect(isCurrent("/clients/abc", "/clients")).toBe(true);
    expect(isCurrent("/clientsx", "/clients")).toBe(false);
  });

  it("marks the item holding the page, for every page of every item", () => {
    const expected: Readonly<Record<string, string>> = {
      "/": "/",
      "/clients": "/clients",
      "/clients/abc/billing": "/clients",
      "/support": "/support",
      "/support/abc": "/support",
      "/support/new": "/support",
      "/leads": "/support",
      "/leads/abc": "/support",
      "/reports": "/support",
      "/reports/abc": "/support",
      "/payments": "/payments",
      "/invoices": "/payments",
      "/invoices/abc": "/payments",
      "/pricing": "/payments",
      "/coupons": "/payments",
      "/coupons/abc": "/payments",
      "/affiliates": "/payments",
      "/ad-results": "/payments",
      "/access-log": "/privacy-requests",
      "/breaches": "/privacy-requests",
      "/privacy-requests": "/privacy-requests",
      "/leaving": "/privacy-requests",
      "/settings": "/deliveries",
      "/staff": "/deliveries",
      "/support/errors": "/deliveries",
      "/support/errors/123": "/deliveries",
      "/deliveries": "/deliveries",
      "/deliveries/abc": "/deliveries",
      "/outbox/abc": "/deliveries",
    };
    for (const [path, href] of Object.entries(expected)) expect(currentHref(CONSOLE_RAIL_LINKS, path), path).toBe(href);
  });

  it("picks the longest match, so App errors (System) wins over Requests (Inbox)", () => {
    expect(currentHref(CONSOLE_RAIL_LINKS, "/support/errors/123")).toBe("/deliveries");
    expect(currentHref(CONSOLE_RAIL_LINKS, "/support/abc")).toBe("/support");
  });

  it("marks nothing on a page no item holds", () => {
    expect(currentHref(CONSOLE_RAIL_LINKS, "/no-access")).toBeNull();
    expect(currentHref(CONSOLE_RAIL_LINKS, "/ad-credit")).toBeNull();
  });
});
