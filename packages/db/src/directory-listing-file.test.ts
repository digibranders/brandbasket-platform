import { describe, expect, it } from "vitest";
import {
  DirectoryFileError,
  dropUnlistedPhones,
  parseListingsFile,
  parsePhonesFile,
  toListingInputs,
} from "./directory-listing-file";

const ROW = [
  "Shiv Drushti dental clinic", "dentists", "thane", "anand-nagar", "27 GBR, Ghodbunder Rd, Anand Nagar 400607",
  19.27003, 72.96437, "", "survey", "z8p6tbs", "thane", "shiv-drushti-dental-clinic",
];
const OSM_ROW = [
  "Smile Dental", "dentists", "thane", "naupada", "Naupada, Thane 400602",
  19.19, 72.97, "https://smile.example/", "osm", "k7m2q9a", "thane", "smile-dental",
];

describe("parseListingsFile", () => {
  it("reads the 12-tuples the dataset build writes", () => {
    const rows = parseListingsFile(JSON.stringify([ROW, OSM_ROW]));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      placeId: "z8p6tbs", name: "Shiv Drushti dental clinic", categorySlug: "dentists", citySlug: "thane",
      areaSlug: "anand-nagar", address: "27 GBR, Ghodbunder Rd, Anand Nagar 400607", lat: 19.27003, lon: 72.96437,
      website: "", source: "survey",
    });
  });

  it("refuses a malformed row, naming it", () => {
    expect(() => parseListingsFile(JSON.stringify([[...ROW.slice(0, 8), "google", ...ROW.slice(9)]]))).toThrow(
      /row 0.*source/,
    );
    expect(() => parseListingsFile(JSON.stringify([[...ROW.slice(0, 9), "not-an-id", ...ROW.slice(10)]]))).toThrow(
      DirectoryFileError,
    );
    expect(() => parseListingsFile(JSON.stringify({}))).toThrow(/array/);
  });

  it("refuses an empty file: a build that wrote nothing must not read as 'everything is gone'", () => {
    expect(() => parseListingsFile("[]")).toThrow(/no rows/);
  });

  it("refuses one place id on two rows", () => {
    expect(() => parseListingsFile(JSON.stringify([ROW, ROW]))).toThrow(/z8p6tbs.*twice/);
  });
});

describe("parsePhonesFile", () => {
  it("reads website and call numbers", () => {
    const phones = parsePhonesFile(
      JSON.stringify({
        z8p6tbs: ["+919850004227", "call", "2026-10-05", true],
        k7m2q9a: ["+912225325444", "https://smile.example/contact", "2026-10-01", false],
      }),
    );
    expect(phones.get("z8p6tbs")).toEqual({ e164: "+919850004227", foundOn: "call", checkedOn: "2026-10-05", whatsapp: true });
    expect(phones.get("k7m2q9a")?.foundOn).toBe("https://smile.example/contact");
  });

  it("refuses a bad entry", () => {
    expect(() => parsePhonesFile(JSON.stringify({ z8p6tbs: ["9850004227", "call", "2026-10-05", true] }))).toThrow(/z8p6tbs/);
    expect(() => parsePhonesFile(JSON.stringify({ z8p6tbs: ["+919850004227", "javascript:x", "2026-10-05", true] }))).toThrow(
      /z8p6tbs/,
    );
  });
});

describe("toListingInputs", () => {
  it("gives each listing its phone, or none", () => {
    const rows = parseListingsFile(JSON.stringify([ROW, OSM_ROW]));
    const phones = parsePhonesFile(JSON.stringify({ z8p6tbs: ["+919850004227", "call", "2026-10-05", true] }));
    const inputs = toListingInputs(rows, phones);
    expect(inputs[0]?.phone).toEqual({ e164: "+919850004227", foundOn: "call", checkedOn: "2026-10-05", whatsapp: true });
    expect(inputs[1]?.phone).toBeNull();
  });

  it("refuses a phone for a business the listings file does not have", () => {
    const rows = parseListingsFile(JSON.stringify([OSM_ROW]));
    const phones = parsePhonesFile(JSON.stringify({ z8p6tbs: ["+919850004227", "call", "2026-10-05", true] }));
    expect(() => toListingInputs(rows, phones)).toThrow(/z8p6tbs/);
  });
});

describe("dropUnlistedPhones", () => {
  it("keeps phones for listed businesses and names the ones it drops", () => {
    const rows = parseListingsFile(JSON.stringify([OSM_ROW]));
    const phones = parsePhonesFile(
      JSON.stringify({
        z8p6tbs: ["+919850004227", "call", "2026-10-05", true],
        k7m2q9a: ["+912225325444", "https://smile.example/contact", "2026-10-01", false],
      }),
    );
    const { listed, dropped } = dropUnlistedPhones(rows, phones);
    expect([...listed.keys()]).toEqual(["k7m2q9a"]);
    expect(dropped).toEqual(["z8p6tbs"]);
    expect(toListingInputs(rows, listed)[0]?.phone?.e164).toBe("+912225325444");
  });
});
