import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isCurrent, linkIsCurrent, menuChildren, phoneTabs, railSections, searchRail } from "@/lib/rail";
import { WEBSITE_PATH } from "@/lib/website/tabs";

const FULL = { hasAccess: true, hasWebsite: true } as const;

const shape = (input: Parameters<typeof railSections>[0]) =>
  railSections(input).map((section) => [section.label, section.links.map((link) => link.label)]);

const link = (label: string, input: Parameters<typeof railSections>[0] = FULL) =>
  railSections(input).flatMap((section) => section.links).find((candidate) => candidate.label === label);

describe("railSections", () => {
  it("shows Home, the website, Requests, Business and the account from the first day", () => {
    expect(shape(FULL)).toEqual([
      [null, ["Home"]],
      ["Services", ["Website", "Blog"]],
      ["Manage", ["Requests", "Business"]],
      ["Account", ["Plan & billing", "Settings"]],
    ]);
  });

  it("has no To do, OyeChats, Calls, Authors or Categories link of its own", () => {
    const labels = railSections({ ...FULL, hasSocial: true, hasSearch: true }).flatMap((section) => section.links.map((entry) => entry.label));
    for (const gone of ["To do", "OyeChats", "Calls", "Authors", "Categories", "Billing", "Your plan", "Search"]) expect(labels).not.toContain(gone);
  });

  it("adds an Affiliate link to Account, before Settings, only for someone who is also an affiliate", () => {
    expect(shape(FULL)[3]?.[1]).not.toContain("Affiliate");
    expect(shape({ ...FULL, affiliate: true })[3]).toEqual(["Account", ["Plan & billing", "Affiliate", "Settings"]]);
    expect(link("Affiliate", { ...FULL, affiliate: true })).toMatchObject({ href: "/affiliate", icon: "affiliate" });
  });

  it("has no Services section for a plan without the website, but still has Business, which holds every customer's contact details", () => {
    expect(shape({ ...FULL, hasWebsite: false }).map(([label]) => label)).toEqual([null, "Manage", "Account"]);
    expect(link("Business", { ...FULL, hasWebsite: false })).toMatchObject({ href: "/details", icon: "business" });
  });

  it("shows no number on an account that has not paid", () => {
    expect(railSections({ ...FULL, hasAccess: false }).flatMap((section) => section.links).some((entry) => entry.count !== undefined)).toBe(false);
  });
});

describe("the service links", () => {
  const services = (input: Partial<Parameters<typeof railSections>[0]>) => railSections({ ...FULL, ...input }).find((section) => section.label === "Services");

  it("lists Website, the Blog under it, Social & Ads and Local SEO + AEO in that order for a customer with all three", () => {
    expect(services({ hasSocial: true, hasSearch: true })?.links.map((entry) => [entry.label, entry.href, entry.mark])).toEqual([
      ["Website", "/website", "website"],
      ["Blog", "/content/blog", undefined],
      ["Social & Ads", "/social", "social"],
      ["Local SEO + AEO", "/search", "search"],
    ]);
  });

  it("never calls the SEO service Search, which is what the sidebar's search box is", () => {
    const labels = railSections({ ...FULL, hasSearch: true }).flatMap((section) => section.links.map((entry) => entry.label));
    expect(labels).toContain("Local SEO + AEO");
    expect(labels).not.toContain("Search");
  });

  it("has Social & Ads and no Website link for a plan without the website", () => {
    expect(services({ hasWebsite: false, hasSocial: true })?.links.map((entry) => entry.label)).toEqual(["Social & Ads"]);
  });

  it("leaves a service out when it is not bought, or not said", () => {
    expect(services({})?.links.map((entry) => entry.label)).toEqual(["Website", "Blog"]);
    expect(services({ hasWebsite: false })).toBeUndefined();
  });

  it("can be found by search", () => {
    const sections = railSections({ ...FULL, hasSocial: true, hasSearch: true });
    expect(searchRail(sections, "social").map((target) => target.label)).toEqual(["Social & Ads"]);
    expect(searchRail(sections, "seo").map((target) => target.href)).toEqual(["/search"]);
  });

  it("counts a page under them as current", () => {
    expect(isCurrent("/social/anything", "/social")).toBe(true);
    expect(isCurrent("/searching", "/search")).toBe(false);
  });
});

describe("current link", () => {
  it("matches Home exactly and the rest by path", () => {
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/billing", "/")).toBe(false);
    expect(isCurrent("/content/blog/new", "/content/blog")).toBe(true);
    expect(isCurrent("/contents", "/content")).toBe(false);
  });

  it("marks the website current on every page of its tabs, and not on the blog's", () => {
    const website = link("Website");
    for (const path of [WEBSITE_PATH, "/website/pages", "/website/enquiries", "/domain", "/content/blog", "/content/authors"]) {
      // /domain is not a tab: it is reached from the Overview. The blog is its own link.
      expect(website === undefined ? false : linkIsCurrent(website, path), path).toBe(!["/domain", "/content/blog", "/content/authors"].includes(path));
    }
  });

  it("marks the blog current on its posts, the editor, authors and categories, and not on the website's pages", () => {
    const blog = link("Blog");
    for (const path of ["/content/blog", "/content/blog/new", "/content/blog/abc", "/content/authors", "/content/authors/new", "/content/categories", "/content/categories/abc", "/website/pages"]) {
      expect(blog === undefined ? false : linkIsCurrent(blog, path), path).toBe(path !== "/website/pages");
    }
  });

  it("marks Plan & billing current on both of its pages", () => {
    const plan = link("Plan & billing");
    expect(plan === undefined ? false : linkIsCurrent(plan, "/services")).toBe(true);
    expect(plan === undefined ? false : linkIsCurrent(plan, "/billing")).toBe(true);
    expect(plan === undefined ? true : linkIsCurrent(plan, "/settings")).toBe(false);
  });

  it("keeps Requests lit on the new request form and on Calls", () => {
    const requests = link("Requests");
    expect(requests === undefined ? false : linkIsCurrent(requests, "/requests/new")).toBe(true);
    expect(requests === undefined ? false : linkIsCurrent(requests, "/requests/calls")).toBe(true);
  });
});

describe("menuChildren and search", () => {
  it("lists the website's other tabs, and the blog's authors and categories under the blog", () => {
    const website = link("Website");
    const blog = link("Blog");
    expect(website === undefined ? [] : menuChildren(website).map((child) => child.label)).toEqual(["Pages", "Enquiries"]);
    expect(blog === undefined ? [] : menuChildren(blog).map((child) => child.label)).toEqual(["Authors", "Categories"]);
  });

  it("lists Billing under Plan & billing, and Calls under Requests only for a paid account", () => {
    const plan = link("Plan & billing");
    expect(plan === undefined ? [] : menuChildren(plan).map((child) => child.label)).toEqual(["Billing"]);
    expect(link("Requests")?.children).toEqual([{ href: "/requests/calls", label: "Calls" }]);
    expect(link("Requests", { ...FULL, hasAccess: false })?.children).toBeUndefined();
  });

  it("starts with New request and finds pages inside a group", () => {
    const sections = railSections(FULL);
    expect(searchRail(sections, "")[0]).toEqual({ href: "/requests/new", label: "New request" });
    expect(searchRail(sections, "AUTHORS").map((target) => target.label)).toEqual(["Blog: Authors"]);
    expect(searchRail(sections, "enquiries").map((target) => target.href)).toEqual(["/website/enquiries"]);
    expect(searchRail(sections, "calls").map((target) => target.href)).toEqual(["/requests/calls"]);
    expect(searchRail(sections, "billing").map((target) => target.label)).toEqual(["Plan & billing", "Plan & billing: Billing"]);
  });
});

describe("the Requests link", () => {
  const find = (requestsCount: number | undefined) => link("Requests", { ...FULL, requestsCount });

  it("opens the Requests page and shows the number of things waiting on the customer", () => {
    expect(find(2)).toMatchObject({ href: "/requests", icon: "requests", count: 2 });
  });

  it("drops the number when nothing waits, or when it is not known", () => {
    expect(find(0)?.count).toBeUndefined();
    expect(find(undefined)?.count).toBeUndefined();
  });
});

describe("phoneTabs", () => {
  const labels = (input: Parameters<typeof railSections>[0]) => phoneTabs(railSections(input)).map((entry) => entry.label);

  it("is Home, the first service, Requests and Business", () => {
    expect(labels({ ...FULL, hasSocial: true })).toEqual(["Home", "Website", "Requests", "Business"]);
  });

  it("uses Social & Ads as the service tab, and keeps Business, for a plan without the website", () => {
    expect(labels({ ...FULL, hasWebsite: false, hasSocial: true })).toEqual(["Home", "Social & Ads", "Requests", "Business"]);
  });

  it("has no service tab when none is bought", () => {
    expect(labels({ ...FULL, hasWebsite: false })).toEqual(["Home", "Requests", "Business"]);
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

  it("points every link and tab at a page that exists", () => {
    const sections = railSections({ ...FULL, hasSocial: true, hasSearch: true });
    const hrefs = sections.flatMap((section) => section.links).flatMap((entry) => [entry.href, ...menuChildren(entry).map((child) => child.href)]);
    for (const href of hrefs.filter((path) => path !== "/")) {
      const folder = new URL(`../app/app-host/(protected)${href}`, import.meta.url);
      const exists = existsSync(new URL("page.tsx", `${folder.href}/`)) || existsSync(new URL("route.ts", `${folder.href}/`));
      expect(exists, href).toBe(true);
    }
  });
});

describe("the sidebar's current page for assistive technology", () => {
  it("follows the same rule as the highlight, so a link is current on every page of its tabs", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../components/v2/rail.tsx", import.meta.url), "utf8");
    expect(source).toContain('aria-current={current ? "page" : undefined}');
    expect(source).not.toContain("isCurrent(pathname, link.href) ? \"page\"");
  });
});
