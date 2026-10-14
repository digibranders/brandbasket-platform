import { describe, expect, it } from "vitest";
import { placementLine, spotLabel } from "./ad-spot-label";

const HOME = { categorySlug: "all", citySlug: "thane", areaSlug: "all" };

describe("spotLabel", () => {
  it.each([
    [{ placement: "top", spot: 1 }, "Top of the list"],
    [{ placement: "side", spot: 2 }, "Side spot 2"],
    [{ placement: "profile", spot: 1 }, "Business page"],
    [{ placement: "home", spot: 3 }, "Home page, tile 3"],
  ] as const)("names %j", (spot, label) => {
    expect(spotLabel(spot)).toBe(label);
  });
});

describe("placementLine", () => {
  it("names a home page ad by its city and tile", () => {
    expect(placementLine({ ...HOME, placement: "home", spot: 2 })).toBe("Home page · Thane · tile 2");
  });

  it("names every other ad by its market and spot", () => {
    expect(placementLine({ categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada", placement: "side", spot: 2 })).toBe(
      "Dentists in Naupada, Thane · Side spot 2",
    );
    expect(placementLine({ categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada", placement: "profile", spot: 1 })).toBe(
      "Dentists in Naupada, Thane · Business page",
    );
  });

  it("names an ad for all categories, all areas, or both, which is not the home page when both are all", () => {
    expect(placementLine({ categorySlug: "all", citySlug: "thane", areaSlug: "naupada", placement: "side", spot: 1 })).toBe("All categories in Naupada, Thane · Side spot 1");
    expect(placementLine({ categorySlug: "dentists", citySlug: "thane", areaSlug: "all", placement: "side", spot: 2 })).toBe("Dentists in all areas of Thane · Side spot 2");
    expect(placementLine({ ...HOME, placement: "profile", spot: 1 })).toBe("All categories in all areas of Thane · Business page");
  });
});
