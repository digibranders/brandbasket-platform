import { describe, expect, it } from "vitest";
import { BRAND, featureShownTo, FYNIX_DEFAULT_CHOICE, isDirectoryOnlyPath, logoOf, offersChoice, sellsFreeListing, supportEmailOf } from "./brand";
import { LISTING_BRAND } from "./testing/listing-brand";

describe("the brand", () => {
  it("sells Care and Premium only, Care first, and not the free listing", () => {
    expect(BRAND.joinChoices).toEqual(["care", "premium"]);
    expect(sellsFreeListing(BRAND)).toBe(false);
    expect(offersChoice(BRAND, "listing_only")).toBe(false);
    expect(offersChoice(BRAND, "care")).toBe(true);
    expect(offersChoice(BRAND, "premium")).toBe(true);
    expect(BRAND.name).toBe("Fynix Digital");
    expect(BRAND.shortName).toBe("Fynix");
  });

  it("opens accounts with an email address", () => {
    expect(BRAND.signUpWith).toBe("email");
  });

  it("opens a sign-up on a plan it sells", () => {
    expect(offersChoice(BRAND, FYNIX_DEFAULT_CHOICE)).toBe(true);
  });

  it("writes to hello@fynix.digital and draws the Fynix logo", () => {
    expect(supportEmailOf(BRAND)).toBe("hello@fynix.digital");
    expect(logoOf(BRAND)).toMatchObject({ name: "Fynix Digital", siteUrl: "https://fynix.digital", email: "hello@fynix.digital", white: "/brand/fynix-logo-white.svg" });
  });

  it("leaves out the plan-table rows about the directory listing, which it does not sell", () => {
    for (const id of ["listing", "images", "videos", "competitor-ads", "listing-management", "featured", "ranking"]) {
      expect(featureShownTo(id, BRAND), id).toBe(false);
      expect(featureShownTo(id, LISTING_BRAND), id).toBe(true);
    }
    expect(featureShownTo("website", BRAND)).toBe(true);
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
