import { describe, expect, it } from "vitest";
import type { GeoAdminCategory } from "@fynix/db";
import { filterCategories, geographyHref, PAGE_SIZE, paginate, parseGeographyView } from "./geography-view";

describe("parseGeographyView", () => {
  it("defaults to districts and ignores what it does not know", () => {
    expect(parseGeographyView({})).toEqual({ tab: "districts", query: "", district: "", group: "", offOnly: false, page: 1 });
    expect(parseGeographyView({ tab: "nonsense", show: "all" })).toMatchObject({ tab: "districts", offOnly: false });
  });

  it("reads the tab, the search and the off filter", () => {
    expect(parseGeographyView({ tab: "areas", q: " vashi ", district: "d1", show: "off" })).toEqual({
      tab: "areas",
      query: "vashi",
      district: "d1",
      group: "",
      offOnly: true,
      page: 1,
    });
  });

  it("reads the page and the group, and keeps the page a sane number", () => {
    expect(parseGeographyView({ page: "3", group: "coaching-centers" })).toMatchObject({ page: 3, group: "coaching-centers" });
    expect(parseGeographyView({ page: "-4" }).page).toBe(1);
    expect(parseGeographyView({ page: "abc" }).page).toBe(1);
  });
});

describe("geographyHref", () => {
  it("leaves out what is default", () => {
    expect(geographyHref({})).toBe("/geography");
    expect(geographyHref({ tab: "categories", query: "dent", offOnly: true })).toBe("/geography?tab=categories&q=dent&show=off");
  });

  it("carries the group and the page, but not the first page", () => {
    expect(geographyHref({ tab: "categories", group: "coaching-centers", page: 2 })).toBe("/geography?tab=categories&group=coaching-centers&page=2");
    expect(geographyHref({ page: 1 })).toBe("/geography");
  });
});

describe("paginate", () => {
  const items = Array.from({ length: PAGE_SIZE * 2 + 1 }, (_, index) => index);

  it("cuts a list into pages", () => {
    expect(paginate(items, 1)).toMatchObject({ page: 1, pageCount: 3, total: items.length });
    expect(paginate(items, 3).rows).toEqual([PAGE_SIZE * 2]);
  });

  it("keeps a page past the end inside the list, and an empty list at one page", () => {
    expect(paginate(items, 99).page).toBe(3);
    expect(paginate([], 5)).toMatchObject({ rows: [], page: 1, pageCount: 1 });
  });
});

describe("filterCategories", () => {
  const rows: GeoAdminCategory[] = [
    { id: "1", slug: "dentists", label: "Dentists", singular: "Dentist", parentSlug: null, keywords: [], taxonomyId: null, hasPage: true, status: "on", slugLocked: true },
    { id: "2", slug: "jee-coaching", label: "JEE Coaching", singular: "JEE Coaching", parentSlug: "coaching-centers", keywords: [], taxonomyId: null, hasPage: false, status: "off", slugLocked: true },
  ];
  const view = parseGeographyView({});

  it("searches the name, the address and the parent", () => {
    expect(filterCategories(rows, { ...view, query: "coaching" }).map((row) => row.id)).toEqual(["2"]);
    expect(filterCategories(rows, { ...view, query: "DENT" }).map((row) => row.id)).toEqual(["1"]);
  });

  it("shows only what is off or a draft on request", () => {
    expect(filterCategories(rows, { ...view, offOnly: true }).map((row) => row.id)).toEqual(["2"]);
  });

  it("narrows to a group: the parent and what is in it", () => {
    expect(filterCategories(rows, { ...view, group: "coaching-centers" }).map((row) => row.id)).toEqual(["2"]);
    expect(filterCategories(rows, { ...view, group: "dentists" }).map((row) => row.id)).toEqual(["1"]);
  });
});
