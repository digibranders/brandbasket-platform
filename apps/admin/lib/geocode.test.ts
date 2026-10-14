import { describe, expect, it } from "vitest";
import { parseGeocode } from "./geocode";

describe("parseGeocode", () => {
  it("reads a result in India, rounded to five places", () => {
    expect(parseGeocode({ lat: "19.2183071", lon: "72.9780993" })).toEqual({ lat: 19.21831, lon: 72.9781 });
  });

  it("refuses a missing result, text that is not a number and a point outside India", () => {
    expect(parseGeocode(undefined)).toBeNull();
    expect(parseGeocode({ lat: "x", lon: "72.9" })).toBeNull();
    expect(parseGeocode({ lat: "51.5", lon: "-0.12" })).toBeNull();
  });
});
