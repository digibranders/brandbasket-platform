import { describe, expect, it } from "vitest";
import { geoNameProblem, geoSlugify, geoSlugProblem, readKeywordList, readPinList } from "./geo-catalog-rules";

describe("geoSlugify", () => {
  it("makes an address from a name", () => {
    expect(geoSlugify("Dombivli East")).toBe("dombivli-east");
    expect(geoSlugify("  Kalwa & Mumbra! ")).toBe("kalwa-and-mumbra");
    expect(geoSlugify("Café Road")).toBe("cafe-road");
  });

  it("is empty when nothing usable is left", () => {
    expect(geoSlugify("!!!")).toBe("");
  });
});

describe("geoSlugProblem", () => {
  it("accepts a plain slug", () => {
    expect(geoSlugProblem("vashi")).toBeNull();
    expect(geoSlugProblem("sector-17")).toBeNull();
  });

  it("refuses an empty, malformed, long or reserved slug", () => {
    expect(geoSlugProblem("")).toMatch(/Enter/);
    expect(geoSlugProblem("Vashi")).toMatch(/lower-case/);
    expect(geoSlugProblem("a--b")).toMatch(/lower-case/);
    expect(geoSlugProblem("a".repeat(61))).toMatch(/at most 60/);
    expect(geoSlugProblem("business")).toMatch(/already used/);
  });
});

describe("geoNameProblem", () => {
  it("needs a name of 1 to 80 characters", () => {
    expect(geoNameProblem("  ")).toMatch(/Enter/);
    expect(geoNameProblem("x".repeat(81))).toMatch(/at most 80/);
    expect(geoNameProblem("Vashi")).toBeNull();
  });
});

describe("readPinList", () => {
  it("splits, sorts and drops repeats", () => {
    expect(readPinList("400602, 400601\n400602; 400603")).toEqual({ pincodes: ["400601", "400602", "400603"], invalid: [] });
  });

  it("reports what is not a PIN code", () => {
    expect(readPinList("400601 12345 040001 abc")).toEqual({ pincodes: ["400601"], invalid: ["12345", "040001", "abc"] });
  });

  it("reads an empty list", () => {
    expect(readPinList("  ")).toEqual({ pincodes: [], invalid: [] });
  });
});

describe("readKeywordList", () => {
  it("trims, lower-cases and drops repeats", () => {
    expect(readKeywordList("JEE, neet\n jee ,")).toEqual(["jee", "neet"]);
  });
});
