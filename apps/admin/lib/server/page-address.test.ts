import { findPlaceByUrlCode, listLegacyKeysByPlace, type DirectoryPlace } from "@firstfold/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listingKeyForAddress, placeIdForAddress, placeOfBusinessAddress, resolveListingAddress } from "./page-address";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn(() => ({})) }));
vi.mock("@firstfold/db", async () => {
  const actual = await vi.importActual<typeof import("@firstfold/db")>("@firstfold/db");
  return { ...actual, findPlaceByUrlCode: vi.fn(), listLegacyKeysByPlace: vi.fn() };
});

const PLACE: DirectoryPlace = {
  id: "k7m2q9a",
  origin: "open_data",
  stateCode: "mh",
  citySlug: "thane",
  urlSlug: "smile-dental",
  urlLockedAt: null,
};
const ADDRESS = "https://firstfold.io/in/mh/business/smile-dental/9f94ykmdjp?ref=x";

describe("business addresses staff paste", () => {
  beforeEach(() => {
    vi.mocked(findPlaceByUrlCode).mockReset().mockResolvedValue(PLACE);
    vi.mocked(listLegacyKeysByPlace).mockReset().mockResolvedValue(new Map([["k7m2q9a", ["dentists/thane/naupada/smile-dental"]]]));
  });

  it("reads today's address, full or as a path, as its name and code", async () => {
    expect(await placeOfBusinessAddress(ADDRESS)).toBe(PLACE);
    expect(vi.mocked(findPlaceByUrlCode)).toHaveBeenLastCalledWith({}, { urlSlug: "smile-dental", code: "9f94ykmdjp" });
    expect(await placeOfBusinessAddress("/in/mh/business/smile-dental/9f94ykmdjp")).toBe(PLACE);
  });

  it("gives the forms the business's listing key or id", async () => {
    expect(await listingKeyForAddress(ADDRESS)).toBe("dentists/thane/naupada/smile-dental");
    expect(await placeIdForAddress(ADDRESS)).toBe("k7m2q9a");
  });

  it("passes anything else through as typed, without asking the database", async () => {
    for (const typed of ["dentists/thane/naupada/smile-dental", "https://firstfold.io/in/dentists/mh/thane/naupada/smile-dental", "k7m2q9a", ""]) {
      expect(await listingKeyForAddress(typed)).toBe(typed);
      expect(await placeIdForAddress(typed)).toBe(typed);
    }
    expect(vi.mocked(findPlaceByUrlCode)).not.toHaveBeenCalled();
  });

  it("passes an address through when it names no business, or one with no listing key", async () => {
    vi.mocked(findPlaceByUrlCode).mockResolvedValueOnce(null);
    expect(await placeIdForAddress(ADDRESS)).toBe(ADDRESS);
    vi.mocked(listLegacyKeysByPlace).mockResolvedValueOnce(new Map());
    expect(await listingKeyForAddress(ADDRESS)).toBe(ADDRESS);
  });

  it("tells a business with no listing key apart from an address that names no business", async () => {
    expect(await resolveListingAddress(ADDRESS)).toEqual({ listing: "dentists/thane/naupada/smile-dental", keyless: false });
    vi.mocked(listLegacyKeysByPlace).mockResolvedValueOnce(new Map());
    expect(await resolveListingAddress(ADDRESS)).toEqual({ listing: ADDRESS, keyless: true });
    vi.mocked(findPlaceByUrlCode).mockResolvedValueOnce(null);
    expect(await resolveListingAddress(ADDRESS)).toEqual({ listing: ADDRESS, keyless: false });
    expect(await resolveListingAddress("dentists/thane/naupada/smile-dental")).toEqual({ listing: "dentists/thane/naupada/smile-dental", keyless: false });
  });
});
