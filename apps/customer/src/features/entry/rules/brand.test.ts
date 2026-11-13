import { describe, expect, it } from "vitest";
import { BRAND, BRANDBASKET_DEFAULT_CHOICE, LEGAL_LINKS, offersChoice } from "./brand";

describe("the brand", () => {
  it("sells Managed Website only: no free listing", () => {
    expect(BRAND.joinChoices).toEqual(["managed"]);
    expect(offersChoice("listing_only")).toBe(false);
    expect(offersChoice("managed")).toBe(true);
    expect(offersChoice(BRANDBASKET_DEFAULT_CHOICE)).toBe(true);
  });

  it("links the Terms and Privacy Notice on the website, and writes to support", () => {
    expect(LEGAL_LINKS).toEqual({ terms: "https://brandbasket.in/terms", privacy: "https://brandbasket.in/privacy" });
    expect(BRAND.contactEmail).toBe("support@brandbasket.in");
  });
});
