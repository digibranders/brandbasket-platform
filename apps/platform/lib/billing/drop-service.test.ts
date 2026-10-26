import { describe, expect, it } from "vitest";
import { dropCopy, dropPreview, PACKAGE_ENDS } from "./drop-service";

const WEBSITE = { addOn: "managed-website", listAmountCents: 299_900, taxRateBasisPoints: 1_800 } as const;
const SOCIAL = { addOn: "digital-growth", listAmountCents: 999_900, taxRateBasisPoints: 1_800 } as const;
const SEO = { addOn: "local-seo-aeo", listAmountCents: 2_499_900, taxRateBasisPoints: 1_800 } as const;

describe("dropPreview", () => {
  it("dropping Local SEO + AEO from all three keeps the other two at list, ₹12,998 a month with GST included, and says the package ends", () => {
    expect(dropPreview({ staying: [WEBSITE, SOCIAL, SEO], dropping: "local-seo-aeo", forfeited: false, currency: "INR" })).toEqual({
      keeps: ["managed-website", "digital-growth"],
      newMonthlyCents: 1_299_800,
      currency: "INR",
      taxRateBasisPoints: 1_800,
      endsPackage: true,
      endsWebsite: false,
    });
  });

  it("prices the website kept alone at its list price, GST included", () => {
    expect(dropPreview({ staying: [WEBSITE, SOCIAL], dropping: "digital-growth", forfeited: false, currency: "INR" })).toMatchObject({
      keeps: ["managed-website"],
      newMonthlyCents: 299_900,
      endsPackage: true,
    });
  });

  it("prices from the list prices on the lines, not the package prices they are billed at now", () => {
    const discounted = [{ ...WEBSITE, offerDiscountAmountCents: 89_970 }, { ...SOCIAL, offerDiscountAmountCents: 299_970 }, SEO];
    expect(dropPreview({ staying: discounted, dropping: "local-seo-aeo", forfeited: false, currency: "INR" })?.newMonthlyCents).toBe(1_299_800);
  });

  it("adds no GST in dollars", () => {
    const usd = (addOn: "managed-website" | "digital-growth", listAmountCents: number) => ({ addOn, listAmountCents, taxRateBasisPoints: 0 });
    expect(dropPreview({ staying: [usd("managed-website", 6_500), usd("digital-growth", 15_000)], dropping: "digital-growth", forfeited: false, currency: "USD" })).toMatchObject({
      keeps: ["managed-website"],
      newMonthlyCents: 6_500,
      currency: "USD",
      taxRateBasisPoints: 0,
    });
  });

  it("has nothing to lose once the offer is already given up", () => {
    expect(dropPreview({ staying: [WEBSITE, SOCIAL, SEO], dropping: "managed-website", forfeited: true, currency: "INR" })).toMatchObject({
      keeps: ["digital-growth", "local-seo-aeo"],
      newMonthlyCents: 3_499_800,
      endsPackage: false,
      endsWebsite: true,
    });
  });

  it("offers no drop for the only service", () => {
    expect(dropPreview({ staying: [SOCIAL], dropping: "digital-growth", forfeited: false, currency: "INR" })).toBeNull();
  });
});

describe("dropCopy", () => {
  it("says what stays, the new monthly payment with GST, and that the package ends, for the case of dropping SEO from all three", () => {
    const preview = dropPreview({ staying: [WEBSITE, SOCIAL, SEO], dropping: "local-seo-aeo", forfeited: false, currency: "INR" });
    if (preview === null) throw new Error("Expected a preview");

    expect(dropCopy(preview, "12 November 2026")).toEqual({
      keeps: "You keep Managed Website and Social Media and Ads.",
      monthly: "From 12 November 2026 you pay ₹12,998 a month, GST included.",
      websiteOffline: null,
      packageEnds: "Your package price and ad credit end for good. Adding a service again later will be at its own price.",
    });
    expect(PACKAGE_ENDS).toBe(dropCopy(preview, "12 November 2026").packageEnds);
  });

  it("names one service kept, says nothing about a package already given up, and adds no GST in dollars", () => {
    const usd = (addOn: "managed-website" | "digital-growth") => ({ addOn, listAmountCents: 6_500, taxRateBasisPoints: 0 });
    const preview = dropPreview({ staying: [usd("managed-website"), usd("digital-growth")], dropping: "digital-growth", forfeited: true, currency: "USD" });
    if (preview === null) throw new Error("Expected a preview");

    expect(dropCopy(preview, "12 November 2026")).toEqual({
      keeps: "You keep Managed Website.",
      monthly: "From 12 November 2026 you pay $65 a month.",
      websiteOffline: null,
      packageEnds: null,
    });
  });

  it("says the website goes offline on the same date as the stay-until line when it is the website being dropped", () => {
    const preview = dropPreview({ staying: [WEBSITE, SOCIAL, SEO], dropping: "managed-website", forfeited: false, currency: "INR" });
    if (preview === null) throw new Error("Expected a preview");

    const copy = dropCopy(preview, "12 November 2026");
    expect(copy.websiteOffline).toBe("Your website goes offline on 12 November 2026.");
    expect(copy.keeps).toBe("You keep Social Media and Ads and Local SEO + AEO.");
    expect(Object.values(copy).join(" ")).not.toMatch(/[\u2013\u2014]/);
  });

  it("is written with no em or en dashes", () => {
    const preview = dropPreview({ staying: [WEBSITE, SOCIAL, SEO], dropping: "local-seo-aeo", forfeited: false, currency: "INR" });
    if (preview === null) throw new Error("Expected a preview");
    expect(Object.values(dropCopy(preview, "12 November 2026")).join(" ")).not.toMatch(/[\u2013\u2014]/);
  });
});
