import { describe, expect, it } from "vitest";
import { CONSOLE_RAIL, currentHref, isCurrent, railFor } from "./console-rail";

const labels = (role: "support" | "finance" | "admin") => railFor(role).map((section) => [section.label, section.links.map((link) => link.label)]);

describe("railFor", () => {
  it("gives an admin every entry, in order", () => {
    expect(labels("admin")).toEqual([
      [null, ["Today"]],
      ["Work", ["Enquiries", "Clients", "Projects", "Requests", "Calls"]],
      ["Money", ["Invoices", "Prices", "Coupons", "Affiliates", "Ad credit"]],
      ["System", ["Outbox", "Errors", "Settings", "Compliance"]],
    ]);
  });

  it("hides money pages and compliance from support", () => {
    const support = labels("support");
    expect(support[2]).toEqual(["Money", ["Coupons", "Affiliates", "Ad credit"]]);
    expect(support[3]).toEqual(["System", ["Outbox", "Errors", "Settings"]]);
  });

  it("gives finance the money pages but not compliance", () => {
    const finance = labels("finance");
    expect(finance[2]?.[1]).toContain("Invoices");
    expect(finance[3]?.[1]).not.toContain("Compliance");
  });

  it("puts a count on Today, Enquiries and Requests only", () => {
    const counted = CONSOLE_RAIL.flatMap((section) => section.links).filter((link) => link.countKey !== undefined).map((link) => link.countKey);
    expect(counted).toEqual(["today", "leads", "projects", "requests", "calls"]);
  });
});

describe("Phase 4 rail entries", () => {
  it("shows Projects and Calls to every role, with their count tones", () => {
    for (const role of ["support", "finance", "admin"] as const) {
      const work = railFor(role).find((section) => section.label === "Work");
      expect(work?.links.find((link) => link.href === "/projects")).toMatchObject({ label: "Projects", icon: "projects", countKey: "projects", countTone: "alert" });
      expect(work?.links.find((link) => link.href === "/calls")).toMatchObject({ label: "Calls", icon: "calls", countKey: "calls", countTone: "quiet" });
    }
  });
});

describe("the current entry", () => {
  it("matches Today exactly and the rest by path", () => {
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/clients", "/")).toBe(false);
    expect(isCurrent("/clients/abc", "/clients")).toBe(true);
    expect(isCurrent("/clientsx", "/clients")).toBe(false);
  });

  it("picks the longest match, so Errors wins over Requests", () => {
    const rail = railFor("admin");
    expect(currentHref(rail, "/support/errors/123")).toBe("/support/errors");
    expect(currentHref(rail, "/support/abc")).toBe("/support");
    expect(currentHref(rail, "/")).toBe("/");
  });

  it("marks Compliance on the breaches and privacy pages", () => {
    expect(currentHref(railFor("admin"), "/breaches")).toBe("/access-log");
    expect(currentHref(railFor("admin"), "/privacy-requests")).toBe("/access-log");
  });

  it("marks nothing on a page the rail does not list", () => {
    expect(currentHref(railFor("support"), "/breaches")).toBeNull();
    expect(currentHref(railFor("admin"), "/no-access")).toBeNull();
  });
});

it("has no Leaving entry: leaving accounts are a Clients filter", () => {
  for (const role of ["support", "finance", "admin"] as const) {
    expect(railFor(role).flatMap((section) => section.links).some((link) => link.href === "/leaving")).toBe(false);
  }
});

