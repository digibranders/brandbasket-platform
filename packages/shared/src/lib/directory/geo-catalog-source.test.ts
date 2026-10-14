import { afterEach, describe, expect, it } from "vitest";
import { geoCatalogSource } from "./geo-catalog-source";
import {
  AD_CATEGORIES,
  applyPlacesCatalog,
  categoryLabel,
  DIRECTORY_AREAS,
  DIRECTORY_CATEGORIES,
  DIRECTORY_CITIES,
  isDirectoryArea,
  isDirectoryCategory,
  resetPlacesToBaseline,
  type PlacesCatalog,
} from "./places";

afterEach(() => {
  resetPlacesToBaseline();
});

const CATALOG: PlacesCatalog = {
  districts: [{ stateCode: "mh", slug: "thane", status: "live" }],
  areas: [
    { stateCode: "mh", districtSlug: "thane", slug: "vashi", name: "Vashi", citySlug: "navi-mumbai", cityName: "Navi Mumbai", status: "on" },
    { stateCode: "mh", districtSlug: "thane", slug: "kopar", name: "Kopar", citySlug: "dombivli", cityName: "Dombivli", status: "off" },
    { stateCode: "mh", districtSlug: "thane", slug: "new-spot", name: "New Spot", citySlug: "new-town", cityName: "New Town", status: "on" },
    { stateCode: "mh", districtSlug: "pune", slug: "baner", name: "Baner", citySlug: "pune", cityName: "Pune", status: "on" },
  ],
  categories: [
    { slug: "dentists", label: "Dentists", hasPage: true, status: "on" },
    { slug: "tailors", label: "Tailors", hasPage: false, status: "on" },
    { slug: "restaurants", label: "Restaurants", hasPage: true, status: "off" },
  ],
};

describe("geoCatalogSource", () => {
  it("is the files unless the database is asked for", () => {
    expect(geoCatalogSource({})).toBe("file");
    expect(geoCatalogSource({ GEO_CATALOG_SOURCE: "db" })).toBe("db");
    expect(geoCatalogSource({ GEO_CATALOG_SOURCE: "DB" })).toBe("file");
  });
});

describe("applyPlacesCatalog", () => {
  it("replaces the lists in place with the primary district's areas and the categories that are on", () => {
    const areas = DIRECTORY_AREAS;
    expect(applyPlacesCatalog(CATALOG)).toBe(true);
    expect(DIRECTORY_AREAS).toBe(areas);
    expect(DIRECTORY_AREAS.map((area) => area.slug)).toEqual(["new-spot", "vashi"]);
    expect(isDirectoryArea("new-town", "new-spot")).toBe(true);
    expect(isDirectoryArea("dombivli", "kopar")).toBe(false);
    expect(DIRECTORY_CITIES.map((city) => city.slug)).toEqual(["navi-mumbai", "new-town"]);
    expect(DIRECTORY_CATEGORIES.map((category) => category.slug)).toEqual(["dentists", "tailors"]);
    expect(AD_CATEGORIES.map((category) => category.slug)).toEqual(["dentists"]);
    expect(isDirectoryCategory("restaurants")).toBe(false);
  });

  it("still names a category that was switched off, so existing listings read", () => {
    applyPlacesCatalog(CATALOG);
    expect(categoryLabel("restaurants")).toBe("Restaurants");
  });

  it("is refused, leaving the lists alone, when no area or no category is on", () => {
    const before = DIRECTORY_AREAS.length;
    expect(applyPlacesCatalog({ ...CATALOG, areas: [] })).toBe(false);
    expect(applyPlacesCatalog({ ...CATALOG, categories: [] })).toBe(false);
    expect(DIRECTORY_AREAS.length).toBe(before);
    expect(isDirectoryCategory("dentists")).toBe(true);
  });
});
