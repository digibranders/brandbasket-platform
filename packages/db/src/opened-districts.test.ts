import { describe, expect, it } from "vitest";
import { elsewhereCitySlug, hasOpenedDistrict, isElsewhereCitySlug, isOpenedDistrict } from "./opened-districts";

describe("opened districts", () => {
  it("only Thane, Maharashtra is opened", () => {
    expect(isOpenedDistrict("mh", "thane")).toBe(true);
    expect(isOpenedDistrict("mh", "mumbai")).toBe(false);
    expect(isOpenedDistrict("wb", "kolkata")).toBe(false);
    expect(hasOpenedDistrict("mh")).toBe(true);
    expect(hasOpenedDistrict("wb")).toBe(false);
  });

  it("an elsewhere city part is <state>-<district>, which no Thane town is", () => {
    expect(elsewhereCitySlug("wb", "north-24-parganas")).toBe("wb-north-24-parganas");
    expect(isElsewhereCitySlug("wb-north-24-parganas")).toBe(true);
    expect(isElsewhereCitySlug("mh-pune")).toBe(true);
    for (const town of ["thane", "navi-mumbai", "kalyan-dombivli", "mira-bhayander", "ulhasnagar"]) {
      expect(isElsewhereCitySlug(town)).toBe(false);
    }
    // Two letters that are not a state's code.
    expect(isElsewhereCitySlug("zz-somewhere")).toBe(false);
    expect(isElsewhereCitySlug("wb-")).toBe(false);
  });
});
