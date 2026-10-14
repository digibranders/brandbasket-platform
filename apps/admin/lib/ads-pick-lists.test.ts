import { afterEach, describe, expect, it } from "vitest";
import { applyPlacesCatalog, resetPlacesToBaseline } from "@firstfold/shared/lib/directory/places";
import { adsPickLists } from "./ads-pick-lists";

const CATALOG = {
  districts: [{ stateCode: "mh", slug: "thane", status: "live" }],
  areas: [
    { stateCode: "mh", districtSlug: "thane", slug: "naupada", name: "Naupada", citySlug: "thane", cityName: "Thane", status: "on" },
    { stateCode: "mh", districtSlug: "thane", slug: "kausa", name: "Kausa", citySlug: "mumbra", cityName: "Mumbra", status: "on" },
  ],
  categories: [
    { slug: "dentists", label: "Dentists", hasPage: true, status: "on" },
    { slug: "gyms", label: "Gyms", hasPage: true, status: "on" },
    { slug: "notices", label: "Notices", hasPage: false, status: "on" },
  ],
} as const;

describe("adsPickLists", () => {
  afterEach(resetPlacesToBaseline);

  it("offers only the categories with their own page, A to Z", () => {
    expect(applyPlacesCatalog(CATALOG)).toBe(true);
    expect(adsPickLists().categories).toEqual([
      { slug: "dentists", label: "Dentists" },
      { slug: "gyms", label: "Gyms" },
    ]);
  });

  it("groups areas under their city, both A to Z, and lists every city", () => {
    expect(applyPlacesCatalog(CATALOG)).toBe(true);
    const lists = adsPickLists();
    expect(lists.areasByCity).toEqual([
      { city: "Mumbra", areas: [{ value: "mumbra/kausa", label: "Kausa" }] },
      { city: "Thane", areas: [{ value: "thane/naupada", label: "Naupada" }] },
    ]);
    expect(lists.cities).toEqual([
      { value: "mumbra", label: "Mumbra" },
      { value: "thane", label: "Thane" },
    ]);
    expect(lists.webAddressCities.map((city) => city.slug).sort()).toEqual(["mumbra", "thane"]);
  });

  it("is read fresh on each call, so a category or area added to the catalog shows without a restart", () => {
    const before = adsPickLists();
    expect(before.categories).not.toContainEqual({ slug: "plumbers", label: "Plumbers" });
    expect(before.areasByCity.flatMap((group) => group.areas)).not.toContainEqual({ value: "thane/new-area", label: "New Area" });

    expect(
      applyPlacesCatalog({
        ...CATALOG,
        areas: [...CATALOG.areas, { stateCode: "mh", districtSlug: "thane", slug: "new-area", name: "New Area", citySlug: "thane", cityName: "Thane", status: "on" }],
        categories: [...CATALOG.categories, { slug: "plumbers", label: "Plumbers", hasPage: true, status: "on" }],
      }),
    ).toBe(true);

    const after = adsPickLists();
    expect(after.categories).toContainEqual({ slug: "plumbers", label: "Plumbers" });
    expect(after.areasByCity.flatMap((group) => group.areas)).toContainEqual({ value: "thane/new-area", label: "New Area" });
  });
});
