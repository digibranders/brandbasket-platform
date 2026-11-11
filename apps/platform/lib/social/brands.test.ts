import { describe, expect, it } from "vitest";
import { BRAND_CEILING, brandIdFor, brandKeyFrom, chooseBrand, isBrandOf, readBrands, type BrandsView } from "./brands";

const B = "0192f3c4-0000-7000-8000-00000000000a";

describe("readBrands", () => {
  it("reads the brands, how many are allowed and how many are used", () => {
    const view = readBrands({ workspaces: [{ externalId: B, name: " Om Sweets ", website: "https://omsweets.in", archived: false }, { externalId: `${B}:abc12345`, name: "Om Snacks", archived: true }], brandsAllowed: 2, brandsUsed: 1 }, "Fallback");
    expect(view?.brands).toEqual([
      { externalId: B, name: "Om Sweets", website: "https://omsweets.in", archived: false },
      { externalId: `${B}:abc12345`, name: "Om Snacks", website: null, archived: true },
    ]);
    expect(view).toMatchObject({ allowed: 2, used: 1 });
  });

  it("never allows more than the ceiling or fewer than one, and counts the live brands when the service does not say", () => {
    expect(readBrands({ workspaces: [], brandsAllowed: 99 }, "x")?.allowed).toBe(BRAND_CEILING);
    expect(readBrands({ workspaces: [], brandsAllowed: 0 }, "x")?.allowed).toBe(1);
    expect(readBrands({ workspaces: [{ externalId: B }, { externalId: `${B}:z`, archived: true }] }, "x")).toMatchObject({ allowed: 1, used: 1 });
  });

  it("names a brand the service did not name after the business, drops what is not a brand, and is null for any other answer", () => {
    expect(readBrands({ workspaces: [{ externalId: B, name: "  " }, { nope: 1 }] }, "Om Sweets")?.brands).toEqual([{ externalId: B, name: "Om Sweets", website: null, archived: false }]);
    expect(readBrands(null, "x")).toBeNull();
    expect(readBrands({ error: "x" }, "x")).toBeNull();
  });
});

describe("chooseBrand", () => {
  const view: BrandsView = {
    brands: [
      { externalId: B, name: "One", website: null, archived: false },
      { externalId: `${B}:two`, name: "Two", website: null, archived: false },
      { externalId: `${B}:old`, name: "Old", website: null, archived: true },
    ],
    allowed: 3,
    used: 2,
  };

  it("takes the chosen brand when it is one of the business's live brands", () => {
    expect(chooseBrand(view, B, `${B}:two`)?.name).toBe("Two");
  });

  it("falls back to the business's own brand for anything else: an archived one, another business's, or none", () => {
    expect(chooseBrand(view, B, `${B}:old`)?.name).toBe("One");
    expect(chooseBrand(view, B, "0192f3c4-9999-7000-8000-00000000000b:two")?.name).toBe("One");
    expect(chooseBrand(view, B, undefined)?.name).toBe("One");
  });

  it("takes the first live brand when the business's own is archived, and none when all are", () => {
    const archivedFirst: BrandsView = { ...view, brands: [{ ...view.brands[0]!, archived: true }, view.brands[1]!] };
    expect(chooseBrand(archivedFirst, B, undefined)?.name).toBe("Two");
    expect(chooseBrand({ ...view, brands: [] }, B, undefined)).toBeNull();
  });
});

describe("brand ids", () => {
  it("makes a key of eight lowercase letters and digits, and an id from the business and the key", () => {
    const key = brandKeyFrom(new Uint8Array([0, 1, 25, 26, 35, 36, 200, 255]));
    expect(key).toMatch(/^[a-z0-9]{8}$/);
    expect(brandIdFor(B, key)).toBe(`${B}:${key}`);
    expect(brandIdFor(B, key).length).toBeLessThanOrEqual(64);
  });

  it("says a brand belongs to a business only for its own id or its id then a colon and a key", () => {
    expect(isBrandOf(B, B)).toBe(true);
    expect(isBrandOf(B, `${B}:abc`)).toBe(true);
    expect(isBrandOf(B, `${B}:`)).toBe(false);
    expect(isBrandOf(B, `${B}x`)).toBe(false);
    expect(isBrandOf(B, "other")).toBe(false);
  });
});
