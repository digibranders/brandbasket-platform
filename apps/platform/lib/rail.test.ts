import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEALS_PATH } from "@/lib/deals";
import { REVIEWS_PATH } from "@/lib/owner-replies";
import { isCurrent, linkIsCurrent, railSections, searchRail } from "@/lib/rail";

const FULL = { quiet: false, hasWebsite: true, websiteSetupDone: false, listingClaim: false } as const;

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
      [null, ["Overview", "Requests"]],
      ["Services", ["Website"]],
      ["Account", ["Business profile", "Your plan", "Billing", "Settings"]],
    ]);
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
    const directory = railSections({ quiet: false, hasWebsite: true, websiteSetupDone: false, listingClaim: true }).find((section) => section.label === "Directory");
    expect(directory?.links.map((link) => link.href)).toEqual([REVIEWS_PATH, DEALS_PATH]);
  });
});
