import { describe, expect, it } from "vitest";
import {
  AD_CATEGORIES,
  DIRECTORY_AREAS,
  DIRECTORY_CATEGORIES,
  DIRECTORY_CITIES,
  DIRECTORY_STATE,
  areaName,
  categoryLabel,
  directoryCategoryPath,
  cityName,
  isAdCategory,
  isDirectoryArea,
  isDirectoryCategory,
  isDirectoryCity,
  slugifyBusinessName,
} from "./places";

describe("directory places", () => {
  it("loads the Thane lists", () => {
    expect(DIRECTORY_STATE.code).toBe("mh");
    expect(DIRECTORY_CITIES.map((city) => city.slug)).toContain("thane");
    expect(DIRECTORY_CATEGORIES.map((category) => category.slug)).toContain("dentists");
    expect(DIRECTORY_AREAS.length).toBeGreaterThan(100);
  });

  it("checks slugs against the lists", () => {
    expect(isDirectoryCategory("dentists")).toBe(true);
    expect(isDirectoryCategory("mh")).toBe(false);
    expect(isDirectoryCity("thane")).toBe(true);
    expect(isDirectoryCity("mumbai")).toBe(false);
    const area = DIRECTORY_AREAS[0];
    if (area === undefined) throw new Error("no areas");
    expect(isDirectoryArea(area.city, area.slug)).toBe(true);
    expect(isDirectoryArea("not-a-city", area.slug)).toBe(false);
  });

  it("lists every category for a listing, and only the published ones for ads", () => {
    expect(DIRECTORY_CATEGORIES).toHaveLength(327);
    const listable = new Set(DIRECTORY_CATEGORIES.map((category) => category.slug));
    expect(AD_CATEGORIES.every((category) => listable.has(category.slug))).toBe(true);
    // Plumbers can be picked, but no business in it has reached the five a website page needs, so it takes no ads.
    expect(isDirectoryCategory("plumbers")).toBe(true);
    expect(isAdCategory("plumbers")).toBe(false);
    expect(isAdCategory("dentists")).toBe(true);
    expect(categoryLabel("plumbers")).toBe("Plumbers");
  });

  it("builds a category's page in an area, with no city in the address", () => {
    expect(directoryCategoryPath("vashi", "dentists")).toBe("/in/mh/thane/vashi/dentists");
  });

  it("names things for people", () => {
    expect(cityName("navi-mumbai")).toBe("Navi Mumbai");
    expect(categoryLabel("dentists")).toMatch(/dentist/i);
    expect(areaName("thane", "no-such-area")).toBeNull();
  });

  it("turns a business name into the last part of its address", () => {
    expect(slugifyBusinessName("Smile Dental Clinic")).toBe("smile-dental-clinic");
    expect(slugifyBusinessName("  Rao & Sons  ")).toBe("rao-and-sons");
    expect(slugifyBusinessName("Café Mocha!!")).toBe("cafe-mocha");
    expect(slugifyBusinessName("!!!")).toBe("");
    expect(slugifyBusinessName("a".repeat(120))).toHaveLength(80);
  });
});
