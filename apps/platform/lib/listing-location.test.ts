import { describe, expect, it } from "vitest";
import {
  elsewhereCitySlug,
  isOpenedDistrict,
  keptLocality,
  normalisePincode,
  pinCodeProblem,
  pinLookupOf,
  pinPlaceName,
  publicPinLookup,
} from "./listing-location";

const KOLKATA_PIN = {
  pincode: "700091",
  stateCode: "wb",
  districtSlug: "north-24-parganas",
  districtName: "North 24 Parganas",
  localities: [{ slug: "salt-lake-sector-v", name: "Salt Lake Sector V" }],
};

describe("listing location", () => {
  it("only Thane, Maharashtra is opened", () => {
    expect(isOpenedDistrict("mh", "thane")).toBe(true);
    expect(isOpenedDistrict("mh", "mumbai")).toBe(false);
    expect(isOpenedDistrict("wb", "kolkata")).toBe(false);
  });

  it("an elsewhere business's key city is <state>-<district>", () => {
    expect(elsewhereCitySlug("wb", "north-24-parganas")).toBe("wb-north-24-parganas");
  });

  it("tells the form which question comes next", () => {
    expect(pinLookupOf(KOLKATA_PIN)).toEqual({
      kind: "elsewhere",
      pincode: "700091",
      stateCode: "wb",
      stateName: "West Bengal",
      districtName: "North 24 Parganas",
      localities: [{ value: "salt-lake-sector-v", label: "Salt Lake Sector V" }],
    });
    expect(
      pinLookupOf({ ...KOLKATA_PIN, pincode: "400601", stateCode: "mh", districtSlug: "thane", districtName: "Thane" }),
    ).toEqual({ kind: "opened", pincode: "400601", stateCode: "mh", districtSlug: "thane", districtName: "Thane" });
  });

  it("publicPinLookup answers not-found for null", () => {
    expect(publicPinLookup(null)).toEqual({ kind: "not-found" });
  });

  it("normalisePincode takes six digits, spaces dropped, and nothing else", () => {
    expect(normalisePincode("400602")).toBe("400602");
    expect(normalisePincode(" 400 602 ")).toBe("400602");
    expect(normalisePincode("040060")).toBeNull();
    expect(normalisePincode("4006")).toBeNull();
    expect(normalisePincode("4006021")).toBeNull();
    expect(normalisePincode("40060a")).toBeNull();
  });
});

describe("pinPlaceName", () => {
  it("names the PIN's district and state, for either kind", () => {
    expect(pinPlaceName(pinLookupOf(KOLKATA_PIN))).toBe("North 24 Parganas, West Bengal");
    expect(pinPlaceName({ kind: "opened", pincode: "400602", stateCode: "mh", districtSlug: "thane", districtName: "Thane" })).toBe(
      "Thane, Maharashtra",
    );
  });

  it("has nothing to name for a PIN that was not found", () => {
    expect(pinPlaceName({ kind: "not-found" })).toBeNull();
  });
});

describe("keptLocality", () => {
  const two = [
    { value: "salt-lake-sector-v", label: "Salt Lake Sector V" },
    { value: "bidhannagar", label: "Bidhannagar" },
  ];

  it("keeps a locality the new PIN still has", () => {
    expect(keptLocality(two, "bidhannagar")).toEqual({ value: "bidhannagar", label: "Bidhannagar" });
  });

  it("drops one the new PIN does not have, unless there is only one to pick", () => {
    expect(keptLocality(two, "dalhousie")).toBeNull();
    expect(keptLocality(two, null)).toBeNull();
    expect(keptLocality([{ value: "dalhousie", label: "Dalhousie" }], null)).toEqual({ value: "dalhousie", label: "Dalhousie" });
    expect(keptLocality([], null)).toBeNull();
  });
});

describe("pinCodeProblem", () => {
  it("has none for a PIN code, spaces allowed", () => {
    expect(pinCodeProblem("400602")).toBeNull();
    expect(pinCodeProblem("400 602")).toBeNull();
  });

  it("says what is wrong with anything else", () => {
    expect(pinCodeProblem("4006")).toBe("Enter your 6-digit PIN code.");
    expect(pinCodeProblem("")).toBe("Enter your 6-digit PIN code.");
    expect(pinCodeProblem("40060a")).toBe("Enter your 6-digit PIN code.");
    expect(pinCodeProblem("040060")).toBe("PIN codes don't start with 0.");
  });
});
