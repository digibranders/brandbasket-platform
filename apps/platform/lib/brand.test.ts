import { describe, expect, it } from "vitest";
import { BRAND, BRANDBASKET_DEFAULT_CHOICE, isDirectoryOnlyPath, logoOf, offersChoice, sellsFreeListing, supportEmailOf } from "./brand";

describe("the brand", () => {
  it("sells Managed Website only: no free listing", () => {
    expect(BRAND.joinChoices).toEqual(["managed"]);
    expect(sellsFreeListing(BRAND)).toBe(false);
    expect(offersChoice(BRAND, "listing_only")).toBe(false);
    expect(offersChoice(BRAND, "managed")).toBe(true);
    expect(BRAND.name).toBe("Brandbasket");
    expect(BRAND.shortName).toBe("Brandbasket");
  });

  it("opens a sign-up on a plan it sells", () => {
    expect(BRANDBASKET_DEFAULT_CHOICE).toBe("managed");
    expect(offersChoice(BRAND, BRANDBASKET_DEFAULT_CHOICE)).toBe(true);
  });

  it("writes to hello@brandbasket.in and draws the Brandbasket logo", () => {
    expect(supportEmailOf(BRAND)).toBe("hello@brandbasket.in");
    expect(logoOf(BRAND)).toMatchObject({ name: "Brandbasket", siteUrl: "https://brandbasket.in", email: "hello@brandbasket.in", white: "/brand/brandbasket-logo-white.svg" });
  });
});

describe("isDirectoryOnlyPath", () => {
  it("is true for the pages that exist only for the directory listing, and anything under them", () => {
    for (const path of ["/business", "/deals", "/listing", "/advertise", "/reviews", "/leads", "/business/preview", "/deals/new"]) {
      expect(isDirectoryOnlyPath(path), path).toBe(true);
    }
  });

  it("is false for every other dashboard page, including ones whose name starts the same way", () => {
    for (const path of ["/", "/billing", "/upgrade", "/onboarding/business", "/listing-pictures/abc", "/leadsheet", "/support", "/content"]) {
      expect(isDirectoryOnlyPath(path), path).toBe(false);
    }
  });
});
