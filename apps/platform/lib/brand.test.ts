import { describe, expect, it } from "vitest";
import { BRAND, BRANDBASKET_DEFAULT_CHOICE, logoOf, offersChoice, sellsFreeListing, supportEmailOf } from "./brand";

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

  it("writes to support@brandbasket.in and draws the Brandbasket logo", () => {
    expect(supportEmailOf(BRAND)).toBe("support@brandbasket.in");
    expect(logoOf(BRAND)).toMatchObject({ name: "Brandbasket", siteUrl: "https://brandbasket.in", email: "support@brandbasket.in", white: "/brand/brandbasket-logo-white.svg" });
  });
});
