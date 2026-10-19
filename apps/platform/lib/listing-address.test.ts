import { describe, expect, it } from "vitest";
import { DIRECTORY_AREAS, DIRECTORY_CATEGORIES, DIRECTORY_CITIES } from "@brandbasket/shared/lib/directory/places";
import { areaOptions, categoryOptions, cityOptions, filterOptions, listingChangeRequestHref } from "./listing-address";

describe("listingChangeRequestHref", () => {
  it("opens an email to us that already names the listing and asks what to change", () => {
    const href = listingChangeRequestHref("support@example.com", "Smile Dental", "brandbasket.in/in/mh/business/smile-dental/9f94ykmdjp");
    const url = new URL(href);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("support@example.com");
    expect(url.searchParams.get("subject")).toBe("Change my listing: Smile Dental");
    expect(url.searchParams.get("body")).toBe(
      "Please change my listing (brandbasket.in/in/mh/business/smile-dental/9f94ykmdjp).\n\nWhat to change (name, category, city, area, address or phone):\n",
    );
    // Spaces must be %20 in a mailto link: mail apps show a + as a plus sign.
    expect(href).not.toContain("+");
  });
});

describe("the pick lists", () => {
  it("offers every category, A to Z", () => {
    const options = categoryOptions();
    expect(options).toHaveLength(DIRECTORY_CATEGORIES.length);
    expect(options.map((option) => option.label)).toEqual([...options.map((option) => option.label)].sort((a, b) => a.localeCompare(b)));
    expect(options).toContainEqual({ value: "dentists", label: "Dentists" });
  });

  it("offers every city in the directory's own order", () => {
    expect(cityOptions().map((option) => option.value)).toEqual(DIRECTORY_CITIES.map((city) => city.slug));
  });

  it("offers only the chosen city's areas, A to Z", () => {
    const options = areaOptions("thane");
    const expected = DIRECTORY_AREAS.filter((area) => area.city === "thane");
    expect(options).toHaveLength(expected.length);
    expect(options).toContainEqual({ value: "naupada", label: "Naupada" });
    expect(options.map((option) => option.label)).toEqual([...options.map((option) => option.label)].sort((a, b) => a.localeCompare(b)));
  });

  it("offers no areas before a city is chosen", () => {
    expect(areaOptions(null)).toEqual([]);
  });
});

describe("filterOptions", () => {
  const options = [
    { value: "dentists", label: "Dentists" },
    { value: "dance-classes", label: "Dance classes" },
    { value: "pet-shops", label: "Pet shops" },
  ];

  it("returns everything for an empty search", () => {
    expect(filterOptions(options, "  ")).toEqual(options);
  });

  it("matches any word's start, whatever the case", () => {
    expect(filterOptions(options, "CLA")).toEqual([options[1]]);
    expect(filterOptions(options, "d")).toEqual([options[0], options[1]]);
  });

  it("matches every typed word", () => {
    expect(filterOptions(options, "pet sh")).toEqual([options[2]]);
    expect(filterOptions(options, "pet dance")).toEqual([]);
  });
});
