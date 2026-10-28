import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isCurrent, linkIsCurrent, menuChildren, railSections, searchRail } from "@/lib/rail";
import { WEBSITE_PATH } from "@/lib/website/tabs";

const FULL = { hasAccess: true, hasWebsite: true, websiteSetupDone: false, todoCount: 3 } as const;

const shape = (input: Parameters<typeof railSections>[0]) =>
  railSections(input).map((section) => [section.label, section.links.map((link) => link.label)]);

describe("railSections", () => {
  it("shows the whole rail from the first day, before the kickoff call", () => {
    expect(shape(FULL)).toEqual([
      [null, ["Overview", "To do", "Requests"]],
      ["Services", ["Website", "OyeChats"]],
      ["Account", ["Business profile", "Your plan", "Billing", "Settings"]],
    ]);
  });

  it("gives an account that has not paid, or has lapsed, no To do link", () => {
    const unpaid = { ...FULL, hasAccess: false };
    expect(shape(unpaid)[0]).toEqual([null, ["Overview", "Requests"]]);
    expect(railSections(unpaid).flatMap((section) => section.links).some((link) => link.count !== undefined)).toBe(false);
  });

  it("opens the website on its Progress page whether or not setup is sent, with the pages that are not tabs inside", () => {
    const website = (done: boolean) => railSections({ ...FULL, websiteSetupDone: done })[1]?.links[0];
    expect(website(false)).toMatchObject({ href: WEBSITE_PATH, label: "Website", icon: "website" });
    expect(website(true)?.href).toBe(WEBSITE_PATH);
    expect(website(false)?.children?.map((child) => [child.label, child.href])).toEqual([
      ["Authors", "/content/authors"],
      ["Categories", "/content/categories"],
    ]);
  });

  it("has no Services section for a plan without the website", () => {
    expect(shape({ ...FULL, hasWebsite: false }).map(([label]) => label)).toEqual([null, "Account"]);
  });

  it("has no Directory section: the dashboard has no directory pages", () => {
    expect(shape(FULL).map(([label]) => label)).not.toContain("Directory");
    expect(railSections(FULL).flatMap((section) => section.links).map((link) => link.href)).not.toContain("/reviews");
  });
});

describe("the Social & Ads and Search links", () => {
  const services = (input: Partial<Parameters<typeof railSections>[0]>) => railSections({ ...FULL, ...input }).find((section) => section.label === "Services");

  it("lists Website, Social & Ads and Search in that order for a customer with all three", () => {
    expect(services({ hasSocial: true, hasSearch: true })?.links.map((link) => [link.label, link.href, link.icon])).toEqual([
      ["Website", "/website", "website"],
      ["OyeChats", "/oyechats", "chatbot"],
      ["Social & Ads", "/social", "social"],
      ["Search", "/search", "search"],
    ]);
  });

  it("has no OyeChats link for a plan without the website: the assistant comes with the site", () => {
    expect(services({ hasWebsite: false, hasSocial: true })?.links.map((link) => link.label)).not.toContain("OyeChats");
  });

  it("has Social & Ads and no Website link for a plan without the website", () => {
    expect(services({ hasWebsite: false, hasSocial: true })?.links.map((link) => link.label)).toEqual(["Social & Ads"]);
  });

  it("leaves them out when they are not bought, or not said", () => {
    expect(services({})?.links.map((link) => link.label)).toEqual(["Website", "OyeChats"]);
    expect(services({ hasWebsite: false })).toBeUndefined();
  });

  it("can be found by search", () => {
    const sections = railSections({ ...FULL, hasSocial: true, hasSearch: true });
    expect(searchRail(sections, "social").map((target) => target.label)).toEqual(["Social & Ads"]);
    expect(searchRail(sections, "search").map((target) => target.href)).toEqual(["/search"]);
  });

  it("counts a page under them as current", () => {
    expect(isCurrent("/social/anything", "/social")).toBe(true);
    expect(isCurrent("/searching", "/search")).toBe(false);
  });
});

describe("Calls under Requests", () => {
  const requests = (input: Parameters<typeof railSections>[0]) => railSections(input)[0]?.links.find((link) => link.label === "Requests");

  it("appears for a paid account, and keeps Requests lit on its page", () => {
    expect(requests(FULL)?.children).toEqual([{ href: "/requests/calls", label: "Calls" }]);
    const link = requests(FULL);
    expect(link === undefined ? false : linkIsCurrent(link, "/requests/calls")).toBe(true);
    expect(isCurrent("/requests/calls", "/requests/calls")).toBe(true);
  });

  it("is not there for an account that has not paid", () => {
    expect(requests({ ...FULL, hasAccess: false })?.children).toBeUndefined();
  });

  it("is something search can jump to", () => {
    expect(searchRail(railSections(FULL), "calls").map((target) => target.href)).toEqual(["/requests/calls"]);
  });
});

describe("current link", () => {
  it("matches Overview exactly and the rest by path", () => {
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/billing", "/")).toBe(false);
    expect(isCurrent("/content/blog/new", "/content/blog")).toBe(true);
    expect(isCurrent("/contents", "/content")).toBe(false);
  });

  it("marks the website current on any of its pages, tabs or not", () => {
    const website = railSections(FULL)[1]?.links[0];
    expect(website === undefined ? false : linkIsCurrent(website, "/website/pages")).toBe(true);
    expect(website === undefined ? false : linkIsCurrent(website, "/content/authors")).toBe(true);
    expect(website === undefined ? false : linkIsCurrent(website, "/content/blog/new")).toBe(true);
  });

  it("lights OyeChats on its own page and not the Website link", () => {
    const sections = railSections(FULL);
    const website = sections[1]?.links[0];
    const oyechats = sections[1]?.links[1];
    expect(oyechats === undefined ? false : linkIsCurrent(oyechats, "/oyechats")).toBe(true);
    expect(website === undefined ? true : linkIsCurrent(website, "/oyechats")).toBe(false);
  });
});

describe("menuChildren", () => {
  const link = (label: string) => railSections(FULL).flatMap((section) => section.links).find((candidate) => candidate.label === label);

  it("lists the Website tabs that are not Progress, then its other pages", () => {
    const website = link("Website");
    expect(website === undefined ? [] : menuChildren(website).map((child) => child.label)).toEqual([
      "Pages",
      "Blog",
      "Authors",
      "Categories",
    ]);
  });

  it("lists only the pages a link names for the rest", () => {
    const requests = link("Requests");
    expect(requests === undefined ? [] : menuChildren(requests).map((child) => child.label)).toEqual(["Calls"]);
    const billing = link("Billing");
    expect(billing === undefined ? ["x"] : menuChildren(billing)).toEqual([]);
  });
});

describe("searchRail", () => {
  it("starts with Ask for a change and finds pages inside a group", () => {
    const sections = railSections(FULL);
    expect(searchRail(sections, "")[0]?.label).toBe("Ask for a change");
    expect(searchRail(sections, "AUTHORS").map((target) => target.label)).toEqual(["Website: Authors"]);
    expect(searchRail(sections, "oyechats").map((target) => target.href)).toEqual(["/oyechats"]);
    expect(searchRail(sections, "website: blog").map((target) => target.href)).toEqual(["/content/blog"]);
  });
});

describe("the To do link", () => {
  const find = (todoCount: number) =>
    railSections({ hasAccess: true, hasWebsite: true, websiteSetupDone: false, todoCount })[0]?.links.find((link) => link.label === "To do");

  it("shows for a paid account with the number of open items", () => {
    expect(find(3)).toMatchObject({ href: "/todo", icon: "todo", count: 3 });
  });

  it("drops the number when nothing is open", () => {
    expect(find(0)?.count).toBeUndefined();
  });

  it("can be found by search", () => {
    const sections = railSections({ hasAccess: true, hasWebsite: true, websiteSetupDone: false, todoCount: 2 });
    expect(searchRail(sections, "to do").map((target) => target.label)).toContain("To do");
  });
});

describe("the Requests link", () => {
  const find = (requestsCount: number | undefined) =>
    railSections({ ...FULL, requestsCount }).flatMap((section) => section.links).find((link) => link.label === "Requests");

  it("opens the Requests page and shows the number of things waiting on the customer", () => {
    expect(find(2)).toMatchObject({ href: "/requests", icon: "requests", count: 2 });
  });

  it("drops the number when nothing waits, or when it is not known", () => {
    expect(find(0)?.count).toBeUndefined();
    expect(find(undefined)?.count).toBeUndefined();
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
      ({ typeOnly, spec }) => spec.startsWith("@/lib/server/") || (spec === "@brandbasket/db" && !typeOnly),
    );
    expect(banned, "rail.ts is bundled into client components").toEqual([]);
  });

  it("points OyeChats, Social & Ads and Search at pages that exist", () => {
    const services = railSections({ ...FULL, hasSocial: true, hasSearch: true }).find((section) => section.label === "Services");
    for (const link of (services?.links ?? []).filter((entry) => entry.icon !== "website")) {
      expect(existsSync(new URL(`../app/app-host/(protected)${link.href}/page.tsx`, import.meta.url)), link.href).toBe(true);
    }
  });
});
