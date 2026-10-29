import { describe, expect, it } from "vitest";
import { PLAN_TABS } from "@/lib/plan/tabs";
import { currentSectionTab, sectionTabPaths, type SectionTab } from "@/lib/section-tabs";

const TABS: readonly SectionTab[] = [
  { href: "/a", label: "Overview", exact: true },
  { href: "/a/b", label: "B" },
  { href: "/c", label: "C", alsoOwns: ["/d"] },
];

describe("currentSectionTab", () => {
  it("marks an exact tab only on its own path", () => {
    expect(currentSectionTab(TABS, "/a")?.label).toBe("Overview");
    expect(currentSectionTab(TABS, "/a/other")).toBeNull();
  });

  it("marks a tab on its path, the pages under it and what it also owns", () => {
    expect(currentSectionTab(TABS, "/a/b/x")?.label).toBe("B");
    expect(currentSectionTab(TABS, "/c")?.label).toBe("C");
    expect(currentSectionTab(TABS, "/d/new")?.label).toBe("C");
  });

  it("does not match a path that only starts with the same letters", () => {
    expect(currentSectionTab(TABS, "/cc")).toBeNull();
  });
});

describe("sectionTabPaths", () => {
  it("lists each tab's path and what it also owns", () => {
    expect(sectionTabPaths(TABS)).toEqual(["/a", "/a/b", "/c", "/d"]);
  });
});

describe("the Plan & billing tabs", () => {
  it("are Your services on /services and Billing on /billing", () => {
    expect(currentSectionTab(PLAN_TABS, "/services")?.label).toBe("Your services");
    expect(currentSectionTab(PLAN_TABS, "/billing")?.label).toBe("Billing");
    expect(currentSectionTab(PLAN_TABS, "/settings")).toBeNull();
  });
});
