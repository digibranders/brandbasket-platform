import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEALS_PATH } from "@/lib/deals";
import { REVIEWS_PATH } from "@/lib/owner-replies";
import { isCurrent, linkIsCurrent, railSections, searchRail } from "@/lib/rail";

const FULL = { quiet: false, hasAccess: true, hasWebsite: true, websiteSetupDone: false, listingClaim: false, todoCount: 3 } as const;

const shape = (input: Parameters<typeof railSections>[0]) =>
  railSections(input).map((section) => [section.label, section.links.map((link) => link.label)]);

describe("railSections", () => {
  it("shows only what a new customer can use until the kickoff call", () => {
    expect(shape({ ...FULL, quiet: true })).toEqual([
      [null, ["Overview", "Requests"]],
      ["Account", ["Billing", "Settings"]],
    ]);
  });

  it("adds the website and the account pages after the call", () => {
    expect(shape(FULL)).toEqual([
      [null, ["Overview", "To do", "Requests"]],
      ["Services", ["Website"]],
      ["Account", ["Business profile", "Your plan", "Billing", "Settings"]],
    ]);
  });

  it("gives an account that has not paid, or has lapsed, no To do link", () => {
    const unpaid = { ...FULL, hasAccess: false };
    expect(shape(unpaid)[0]).toEqual([null, ["Overview", "Requests"]]);
    expect(railSections(unpaid).flatMap((section) => section.links).some((link) => link.count !== undefined)).toBe(false);
  });

  it("opens the website on its setup until it is sent, then on the project", () => {
    const website = (done: boolean) => railSections({ ...FULL, websiteSetupDone: done })[1]?.links[0];
    expect(website(false)?.href).toBe("/onboarding");
    expect(website(false)?.children?.[0]?.label).toBe("Set up your website");
    expect(website(true)?.href).toBe("/project");
  });

  it("has no Services section for a plan without the website", () => {
    expect(shape({ ...FULL, hasWebsite: false }).map(([label]) => label)).toEqual([null, "Account"]);
  });

  it("keeps Reviews and Deals for a member with a claimed listing", () => {
    expect(shape({ ...FULL, listingClaim: true })[2]).toEqual(["Directory", ["Reviews", "Deals"]]);
  });
});

describe("current link", () => {
  it("matches Overview exactly and the rest by path", () => {
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/billing", "/")).toBe(false);
    expect(isCurrent("/content/blog/new", "/content/blog")).toBe(true);
    expect(isCurrent("/contents", "/content")).toBe(false);
  });

  it("marks the website current on any of its pages", () => {
    const website = railSections(FULL)[1]?.links[0];
    expect(website === undefined ? false : linkIsCurrent(website, "/domain")).toBe(true);
  });
});

describe("searchRail", () => {
  it("starts with Ask for a change and finds pages inside a group", () => {
    const sections = railSections(FULL);
    expect(searchRail(sections, "")[0]?.label).toBe("Ask for a change");
    expect(searchRail(sections, "BLOG").map((target) => target.label)).toEqual(["Website: Blog"]);
  });
});

describe("the To do link", () => {
  const find = (todoCount: number, quiet: boolean) =>
    railSections({ quiet, hasAccess: true, hasWebsite: true, websiteSetupDone: false, listingClaim: false, todoCount })[0]?.links.find((link) => link.label === "To do");

  it("shows after the call with the number of open items", () => {
    expect(find(3, false)).toMatchObject({ href: "/todo", icon: "todo", count: 3 });
  });

  it("drops the number when nothing is open", () => {
    expect(find(0, false)?.count).toBeUndefined();
  });

  it("is not in the quiet rail before the call", () => {
    expect(find(3, true)).toBeUndefined();
  });

  it("can be found by search", () => {
    const sections = railSections({ quiet: false, hasAccess: true, hasWebsite: true, websiteSetupDone: false, listingClaim: false, todoCount: 2 });
    expect(searchRail(sections, "to do").map((target) => target.label)).toContain("To do");
  });
});

describe("the Requests link", () => {
  const find = (requestsCount: number | undefined, quiet = false) =>
    railSections({ ...FULL, quiet, requestsCount }).flatMap((section) => section.links).find((link) => link.label === "Requests");

  it("opens the Requests page and shows the number of things waiting on the customer", () => {
    expect(find(2)).toMatchObject({ href: "/requests", icon: "requests", count: 2 });
  });

  it("drops the number when nothing waits, or when it is not known", () => {
    expect(find(0)?.count).toBeUndefined();
    expect(find(undefined)?.count).toBeUndefined();
  });

  it("is in the quiet rail before the call too, with its number", () => {
    expect(find(1, true)).toMatchObject({ href: "/requests", count: 1 });
  });

  it("opens the form from search as Ask for a change, and counts Requests as current on the form's page", () => {
    const sections = railSections(FULL);
    expect(searchRail(sections, "")[0]).toEqual({ href: "/requests/new", label: "Ask for a change" });
    expect(isCurrent("/requests/new", "/requests")).toBe(true);
  });
});

describe("browser safety", () => {
  it("keeps the rail model free of server code", () => {
    const source = readFileSync(new URL("./rail.ts", import.meta.url), "utf8");
    const imports = [...source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gm)].map((match) => ({ typeOnly: match[1] !== undefined, spec: match[2] ?? "" }));
    const banned = imports.filter(
      ({ typeOnly, spec }) => spec === "@/lib/deals" || spec === "@/lib/owner-replies" || spec.startsWith("@/lib/server/") || (spec === "@brandbasket/db" && !typeOnly),
    );
    expect(banned, "rail.ts is bundled into client components").toEqual([]);
  });

  it("uses the same paths as the pages", () => {
    const directory = railSections({ quiet: false, hasAccess: true, hasWebsite: true, websiteSetupDone: false, listingClaim: true, todoCount: 0 }).find((section) => section.label === "Directory");
    expect(directory?.links.map((link) => link.href)).toEqual([REVIEWS_PATH, DEALS_PATH]);
  });
});
