import { describe, expect, it } from "vitest";
import type { StaffRole } from "@brandbasket/db";
import { CONSOLE_RAIL, currentHref, isCurrent, railCount, railFor, tabsFor } from "./console-rail";

const ROLES: readonly StaffRole[] = ["support", "finance", "admin"];
const labels = (role: StaffRole): string[] => railFor(role).map((link) => link.label);
const stripLabels = (role: StaffRole, page: string): string[] | null => tabsFor(role, page)?.pages.map((entry) => entry.label) ?? null;

describe("railFor", () => {
  it("gives an admin the eight items, in order", () => {
    expect(labels("admin")).toEqual(["Today", "Clients", "Inbox", "Calls", "Money", "Ads", "Team", "Settings"]);
  });

  it("gives finance everything but Team", () => {
    expect(labels("finance")).toEqual(["Today", "Clients", "Inbox", "Calls", "Money", "Ads", "Settings"]);
  });

  it("gives support neither Money nor Team, and keeps Ads for its Ad credit page", () => {
    expect(labels("support")).toEqual(["Today", "Clients", "Inbox", "Calls", "Ads", "Settings"]);
  });

  it("links each item to its first page the role may open", () => {
    const targets = (role: StaffRole): string[] => railFor(role).map((link) => link.href);
    expect(targets("admin")).toEqual(["/", "/clients", "/support", "/calls", "/payments", "/ad-credit", "/staff", "/settings"]);
    expect(targets("support")).toEqual(["/", "/clients", "/support", "/calls", "/ad-credit", "/settings"]);
  });

  it("never leaves an item without a page", () => {
    for (const role of ROLES) for (const link of railFor(role)) expect(link.pages.length).toBeGreaterThan(0);
  });
});

describe("tabs under a page header", () => {
  it("shows every Money page to finance and admin", () => {
    for (const role of ["finance", "admin"] as const) {
      for (const page of ["/payments", "/invoices", "/pricing", "/coupons", "/affiliates"]) {
        expect(stripLabels(role, page)).toEqual(["Payments", "Invoices", "Prices", "Coupons", "Affiliates"]);
      }
    }
  });

  it("shows support no Money tabs", () => {
    expect(stripLabels("support", "/payments")).toBeNull();
  });

  it("shows Ad results only to money roles, and nothing to a role left with one page", () => {
    expect(stripLabels("admin", "/ad-credit")).toEqual(["Ad credit", "Ad results"]);
    expect(stripLabels("finance", "/ad-results")).toEqual(["Ad credit", "Ad results"]);
    expect(stripLabels("support", "/ad-credit")).toBeNull();
  });

  it("shows Staff and Compliance to admins only", () => {
    expect(stripLabels("admin", "/staff")).toEqual(["Staff", "Compliance"]);
    expect(stripLabels("admin", "/access-log")).toEqual(["Staff", "Compliance"]);
    expect(stripLabels("finance", "/staff")).toBeNull();
    expect(stripLabels("support", "/access-log")).toBeNull();
  });

  it("shows Requests and Enquiries to every role", () => {
    for (const role of ROLES) {
      expect(stripLabels(role, "/support")).toEqual(["Requests", "Enquiries"]);
      expect(stripLabels(role, "/leads")).toEqual(["Requests", "Enquiries"]);
    }
  });

  it("switches Clients between List, Board and Reports for every role", () => {
    for (const role of ROLES) {
      expect(stripLabels(role, "/clients")).toEqual(["List", "Board", "Reports"]);
      expect(stripLabels(role, "/projects")).toEqual(["List", "Board", "Reports"]);
    }
  });

  it("puts Settings, App errors and Emails and webhooks together for every role", () => {
    for (const role of ROLES) {
      for (const page of ["/settings", "/support/errors", "/deliveries"]) expect(stripLabels(role, page)).toEqual(["Settings", "App errors", "Emails and webhooks"]);
    }
  });

  it("has no strip on a single-page item or an unlisted page", () => {
    expect(stripLabels("admin", "/")).toBeNull();
    expect(stripLabels("admin", "/calls")).toBeNull();
    expect(stripLabels("admin", "/no-access")).toBeNull();
  });
});

describe("counts beside an item", () => {
  it("adds the Requests and Enquiries counts on Inbox", () => {
    const inbox = CONSOLE_RAIL.find((link) => link.label === "Inbox");
    expect(inbox && railCount(inbox, { requests: 3, leads: 2 })).toEqual({ value: 5, tone: "accent" });
    expect(inbox && railCount(inbox, { requests: 3 })).toEqual({ value: 3, tone: "accent" });
    expect(inbox && railCount(inbox, { requests: 0, leads: 0 })).toBeNull();
    expect(inbox && railCount(inbox, {})).toBeNull();
  });

  it("keeps the red Projects count on Clients and the red failed-delivery count on Settings", () => {
    const clients = CONSOLE_RAIL.find((link) => link.label === "Clients");
    const settings = CONSOLE_RAIL.find((link) => link.label === "Settings");
    expect(clients && railCount(clients, { projects: 2 })).toEqual({ value: 2, tone: "alert" });
    expect(settings && railCount(settings, { deliveries: 4 })).toEqual({ value: 4, tone: "alert" });
  });

  it("keeps the other counts and their tones: Today, Calls quiet, Money payments", () => {
    const find = (label: string) => CONSOLE_RAIL.find((link) => link.label === label);
    const today = find("Today");
    const calls = find("Calls");
    const money = find("Money");
    expect(today && railCount(today, { today: 5 })).toEqual({ value: 5, tone: "accent" });
    expect(calls && railCount(calls, { calls: 4 })).toEqual({ value: 4, tone: "quiet" });
    expect(money && railCount(money, { payments: 2 })).toEqual({ value: 2, tone: "accent" });
  });

  it("draws a sum in the loudest tone among the counts that are not zero", () => {
    const mixed = { label: "Mixed", icon: "inbox", countKeys: ["calls", "requests", "projects"], pages: [{ href: "/x", label: "X" }] } as const;
    expect(railCount(mixed, { calls: 1, requests: 1, projects: 1 })).toEqual({ value: 3, tone: "alert" });
    expect(railCount(mixed, { calls: 1, requests: 1, projects: 0 })).toEqual({ value: 2, tone: "accent" });
    expect(railCount(mixed, { calls: 1 })).toEqual({ value: 1, tone: "quiet" });
  });

  it("has no count on Ads or Team", () => {
    for (const label of ["Ads", "Team"]) expect(CONSOLE_RAIL.find((link) => link.label === label)?.countKeys).toBeUndefined();
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
      "/projects": "/clients",
      "/support": "/support",
      "/support/abc": "/support",
      "/support/new": "/support",
      "/leads": "/support",
      "/leads/abc": "/support",
      "/calls": "/calls",
      "/payments": "/payments",
      "/invoices": "/payments",
      "/invoices/abc": "/payments",
      "/pricing": "/payments",
      "/coupons": "/payments",
      "/coupons/abc": "/payments",
      "/affiliates": "/payments",
      "/ad-credit": "/ad-credit",
      "/ad-results": "/ad-credit",
      "/staff": "/staff",
      "/access-log": "/staff",
      "/breaches": "/staff",
      "/privacy-requests": "/staff",
      "/settings": "/settings",
      "/support/errors": "/settings",
      "/support/errors/123": "/settings",
      "/deliveries": "/settings",
      "/deliveries/abc": "/settings",
    };
    const admin = railFor("admin");
    for (const [path, href] of Object.entries(expected)) expect(currentHref(admin, path), path).toBe(href);
  });

  it("picks the longest match, so App errors (Settings) wins over Requests (Inbox)", () => {
    expect(currentHref(railFor("admin"), "/support/errors/123")).toBe("/settings");
    expect(currentHref(railFor("admin"), "/support/abc")).toBe("/support");
  });

  it("links a finance user's Ads item to Ad credit and marks it on Ad results", () => {
    expect(currentHref(railFor("finance"), "/ad-results")).toBe("/ad-credit");
  });

  it("marks nothing on a page the role's menu does not list", () => {
    expect(currentHref(railFor("support"), "/breaches")).toBeNull();
    expect(currentHref(railFor("support"), "/payments")).toBeNull();
    expect(currentHref(railFor("finance"), "/staff")).toBeNull();
    expect(currentHref(railFor("admin"), "/no-access")).toBeNull();
  });
});

it("has no Leaving, Outbox or Projects item of its own", () => {
  for (const role of ROLES) {
    const hrefs = railFor(role).map((link) => link.href);
    for (const gone of ["/leaving", "/outbox", "/projects"]) expect(hrefs).not.toContain(gone);
  }
});
