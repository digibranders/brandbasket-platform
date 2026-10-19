import { afterEach, describe, expect, it } from "vitest";
import { applyPlacesCatalog, resetPlacesToBaseline } from "@brandbasket/shared/lib/directory/places";
import {
  cityOfArea,
  districtAreaOptions,
  listedAtAddress,
  listingFormOptions,
  listingRefusalField,
  parseBusinessListingForm,
} from "./business-listing-form";
import { OWNER_FORM_FIELDS_MESSAGE } from "./owner-form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("districtAreaOptions", () => {
  it("lists every area of the district with its town, A to Z", () => {
    const options = districtAreaOptions("thane");
    expect(options.length).toBeGreaterThan(100);
    expect(options).toContainEqual({ value: "naupada", label: "Naupada · Thane" });
    const labels = options.map((option) => option.label);
    expect([...labels].sort((a, b) => a.localeCompare(b))).toEqual(labels);
  });

  it("lists nothing for no district or one we do not list in", () => {
    expect(districtAreaOptions(null)).toEqual([]);
    expect(districtAreaOptions("pune")).toEqual([]);
  });
});

describe("listingFormOptions", () => {
  afterEach(resetPlacesToBaseline);

  it("offers the areas of every district and every category, A to Z", () => {
    const { areasByDistrict, categories } = listingFormOptions();
    expect(areasByDistrict.thane).toEqual(districtAreaOptions("thane"));
    expect(categories).toContainEqual({ value: "dentists", label: "Dentists" });
    const labels = categories.map((option) => option.label);
    expect([...labels].sort((a, b) => a.localeCompare(b))).toEqual(labels);
  });

  it("is read fresh each time, so an area and a category added to the catalog are offered at once", () => {
    const before = listingFormOptions();
    expect(before.areasByDistrict.thane).not.toContainEqual({ value: "new-area", label: "New Area · Thane" });

    const applied = applyPlacesCatalog({
      districts: [{ stateCode: "mh", slug: "thane", status: "live" }],
      areas: [
        { stateCode: "mh", districtSlug: "thane", slug: "naupada", name: "Naupada", citySlug: "thane", cityName: "Thane", status: "on" },
        { stateCode: "mh", districtSlug: "thane", slug: "new-area", name: "New Area", citySlug: "thane", cityName: "Thane", status: "on" },
      ],
      categories: [
        { slug: "dentists", label: "Dentists", hasPage: true, status: "on" },
        { slug: "new-category", label: "New Category", hasPage: false, status: "on" },
      ],
    });
    expect(applied).toBe(true);

    const after = listingFormOptions();
    expect(after.areasByDistrict.thane).toContainEqual({ value: "new-area", label: "New Area · Thane" });
    expect(after.categories).toContainEqual({ value: "new-category", label: "New Category" });
  });
});

describe("cityOfArea", () => {
  it("finds the area's town", () => {
    expect(cityOfArea("naupada")).toBe("thane");
    expect(cityOfArea("nowhere")).toBeNull();
  });
});

describe("listedAtAddress", () => {
  it("builds /in/mh/<district>/<area>/<category> with placeholders for what is not picked", () => {
    expect(listedAtAddress({ districtSlug: "thane", areaSlug: null, categorySlug: null }).map((part) => [part.text, part.chosen])).toEqual([
      ["in", true],
      ["mh", true],
      ["thane", true],
      ["area", false],
      ["category", false],
    ]);
    expect(listedAtAddress({ districtSlug: "thane", areaSlug: "naupada", categorySlug: "dentists" }).map((part) => part.text)).toEqual([
      "in",
      "mh",
      "thane",
      "naupada",
      "dentists",
    ]);
  });
});

describe("parseBusinessListingForm", () => {
  it("returns the area with its town and no PIN", () => {
    expect(parseBusinessListingForm(form({ district: "thane", area: "naupada", category: "dentists" }))).toEqual({
      success: true,
      data: { pincode: null, place: { kind: "area", citySlug: "thane", areaSlug: "naupada" }, categorySlug: "dentists" },
    });
  });

  it("names the pick that is missing or unknown", () => {
    expect(parseBusinessListingForm(form({ district: "pune", area: "naupada", category: "dentists" }))).toMatchObject({ field: "district" });
    expect(parseBusinessListingForm(form({ district: "thane", area: "nowhere", category: "dentists" }))).toMatchObject({ field: "area" });
    expect(parseBusinessListingForm(form({ district: "thane", area: "naupada", category: "" }))).toMatchObject({ field: "category" });
  });

  it("refuses a form that sends a PIN code or any other field it does not show", () => {
    expect(parseBusinessListingForm(form({ district: "thane", area: "naupada", category: "dentists", pincode: "400602" }))).toEqual({
      success: false,
      field: null,
      message: OWNER_FORM_FIELDS_MESSAGE,
    });
  });
});

describe("listingRefusalField", () => {
  it("puts a pick outside its place on the area", () => {
    expect(listingRefusalField("place")).toBe("area");
  });

  it("puts any other refusal on the form as a whole", () => {
    expect(listingRefusalField("pin")).toBeNull();
    expect(listingRefusalField("no-details")).toBeNull();
    expect(listingRefusalField("locked")).toBeNull();
    expect(listingRefusalField("refused")).toBeNull();
  });
});
