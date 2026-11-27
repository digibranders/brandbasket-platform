import { describe, expect, it, vi } from "vitest";
import { couponProblem, parsePaymentLinkForm, type ParsedPaymentLinkForm } from "./payment-link-form";

vi.mock("server-only", () => ({}));

const COUPON = "0194b0a0-0000-7000-8000-000000000001";
/** The fields a paid deal sends: the finalised price, no discount, and a 10,000 advance. */
const PAID = { dealType: "paid", buildPrice: "35000", discountKind: "none", advanceKind: "amount", advanceValue: "10000" } as const;

function form(overrides: Record<string, string | string[]> = {}): FormData {
  const values: Record<string, string | string[]> = {
    countryCode: "IN",
    service: ["managed-website"],
    websiteKind: "b2b",
    billingInterval: "month",
    dealType: "free",
    ...overrides,
  };
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  return data;
}

function refusal(overrides: Record<string, string | string[]>): { field: string | null; message: string } {
  const result: ParsedPaymentLinkForm = parsePaymentLinkForm(form(overrides));
  if (result.ok) throw new Error("expected a refusal");
  return { field: result.field, message: result.message };
}

function draft(overrides: Record<string, string | string[]> = {}) {
  const result = parsePaymentLinkForm(form(overrides));
  if (!result.ok) throw new Error(`expected a draft, got ${result.message}`);
  return result.draft;
}

describe("parsePaymentLinkForm", () => {
  it("reads a free deal in rupees with no build fields and the list recurring prices", () => {
    expect(draft()).toMatchObject({
      countryCode: "IN",
      currency: "INR",
      services: ["managed-website"],
      billingInterval: "month",
      websiteKind: "b2b",
      dealType: "free",
      setupFeeListCents: null,
      setupFeeDiscountCents: null,
      setupFeeNote: null,
      advanceCents: null,
      websitePriceCents: null,
      socialPriceCents: null,
      adsPriceCents: null,
      monitoringPriceCents: null,
      couponId: null,
    });
  });

  it("needs a free or a paid deal", () => {
    expect(refusal({ dealType: "" })).toMatchObject({ field: "dealType" });
    expect(refusal({ dealType: "gift" })).toMatchObject({ field: "dealType" });
  });

  it("drops what a free deal does not carry, even when the form sent it", () => {
    expect(draft({ discountKind: "amount", discountValue: "500", buildPrice: "100", advanceValue: "5", setupFeeNote: "x" })).toMatchObject({ setupFeeListCents: null, setupFeeDiscountCents: null, setupFeeNote: null, advanceCents: null });
  });

  it("bills any country but India in dollars", () => {
    expect(draft({ countryCode: "US", websiteKind: "ecommerce" })).toMatchObject({ currency: "USD", websiteKind: "ecommerce" });
  });

  it("refuses an unknown country", () => {
    expect(refusal({ countryCode: "ZZ" })).toMatchObject({ field: "countryCode" });
    expect(refusal({ countryCode: "" })).toMatchObject({ field: "countryCode" });
  });

  it("needs a service on sale, and refuses a paused one", () => {
    expect(refusal({ service: [] })).toMatchObject({ field: "service" });
    expect(refusal({ service: ["managed-website", "paid-ads"] })).toMatchObject({ field: "service", message: "One of those services is not on sale." });
    expect(refusal({ service: ["managed-website", "nonsense"] })).toMatchObject({ field: "service" });
  });

  it("needs a plan beside monitoring", () => {
    expect(refusal({ service: ["expert-monitoring"] })).toMatchObject({ field: "service", message: "Dedicated Expert Monitoring needs at least one plan beside it." });
    expect(draft({ service: ["social-media", "expert-monitoring"] }).services).toEqual(["social-media", "expert-monitoring"]);
  });

  it("needs a website kind with the website, and carries no kind without it", () => {
    expect(refusal({ websiteKind: "" })).toMatchObject({ field: "websiteKind" });
    expect(refusal({ websiteKind: "shop" })).toMatchObject({ field: "websiteKind" });
    expect(draft({ service: ["social-media"], websiteKind: "ecommerce" })).toMatchObject({ websiteKind: null });
  });

  it("refuses an interval that is neither monthly nor yearly", () => {
    expect(refusal({ billingInterval: "week" })).toMatchObject({ field: "billingInterval" });
  });

  describe("paid deal", () => {
    it("keeps the typed build price, whatever the catalogue says, and the advance as an amount", () => {
      expect(draft({ ...PAID, buildPrice: "42,500" })).toMatchObject({
        dealType: "paid",
        setupFeeListCents: 4_250_000,
        setupFeeDiscountCents: 0,
        setupFeeNote: null,
        advanceCents: 1_000_000,
      });
    });

    it("reads a percentage advance of the net price, rounded down to a whole rupee", () => {
      expect(draft({ ...PAID, buildPrice: "33333", advanceKind: "percent", advanceValue: "30" }).advanceCents).toBe(999_900);
      expect(draft({ ...PAID, discountKind: "amount", discountValue: "5000", setupFeeNote: "Agreed", advanceKind: "percent", advanceValue: "50" }).advanceCents).toBe(1_500_000);
    });

    it("needs the website", () => {
      expect(refusal({ ...PAID, service: ["social-media"] })).toMatchObject({ field: "service" });
    });

    it("holds the advance from 1 to the net price", () => {
      expect(draft({ ...PAID, advanceValue: "35000" }).advanceCents).toBe(3_500_000);
      expect(draft({ ...PAID, advanceValue: "1" }).advanceCents).toBe(100);
      for (const advanceValue of ["0", "35001", "lots", ""]) expect(refusal({ ...PAID, advanceValue })).toMatchObject({ field: "advanceValue" });
      expect(refusal({ ...PAID, advanceKind: "percent", advanceValue: "0" })).toMatchObject({ field: "advanceValue" });
      expect(refusal({ ...PAID, advanceKind: "percent", advanceValue: "101" })).toMatchObject({ field: "advanceValue" });
      expect(refusal({ ...PAID, advanceKind: "" })).toMatchObject({ field: "advanceKind" });
    });

    it("refuses a build price that cannot be read or is out of bounds", () => {
      for (const buildPrice of ["", "free", "0", "0.50", "20000001"]) expect(refusal({ ...PAID, buildPrice })).toMatchObject({ field: "buildPrice" });
    });

    it("turns an amount, a percentage or a final price into the discount of the typed price, with its note", () => {
      expect(draft({ ...PAID, discountKind: "amount", discountValue: "10000", setupFeeNote: "Agreed on call" })).toMatchObject({ setupFeeListCents: 3_500_000, setupFeeDiscountCents: 1_000_000, setupFeeNote: "Agreed on call" });
      expect(draft({ ...PAID, buildPrice: "65000", discountKind: "percent", discountValue: "20", setupFeeNote: "Launch offer" })).toMatchObject({ setupFeeDiscountCents: 1_300_000 });
      expect(draft({ ...PAID, discountKind: "final", discountValue: "20000", setupFeeNote: "Agreed on call" })).toMatchObject({ setupFeeDiscountCents: 1_500_000 });
    });

    it("refuses a waived build, which is a free deal", () => {
      expect(refusal({ ...PAID, discountKind: "final", discountValue: "0", setupFeeNote: "Promised" })).toMatchObject({ field: "discountValue", message: expect.stringContaining("free deal") });
      expect(refusal({ ...PAID, discountKind: "percent", discountValue: "100", setupFeeNote: "Promised" })).toMatchObject({ field: "discountValue" });
    });

    it("refuses a discount that cannot be read or is past the price", () => {
      expect(refusal({ ...PAID, discountKind: "amount", discountValue: "lots", setupFeeNote: "x" })).toMatchObject({ field: "discountValue" });
      expect(refusal({ ...PAID, discountKind: "amount", discountValue: "35001", setupFeeNote: "x" })).toMatchObject({ field: "discountValue" });
      expect(refusal({ ...PAID, discountKind: "percent", discountValue: "101", setupFeeNote: "x" })).toMatchObject({ field: "discountValue" });
      expect(refusal({ ...PAID, discountKind: "final", discountValue: "35001", setupFeeNote: "x" })).toMatchObject({ field: "discountValue" });
      expect(refusal({ ...PAID, discountKind: "" })).toMatchObject({ field: "discountKind" });
    });

    it("requires a note once the discount is above zero, and drops it when there is no discount", () => {
      expect(refusal({ ...PAID, discountKind: "amount", discountValue: "500" })).toMatchObject({ field: "setupFeeNote" });
      expect(refusal({ ...PAID, discountKind: "amount", discountValue: "500", setupFeeNote: "   " })).toMatchObject({ field: "setupFeeNote" });
      expect(draft({ ...PAID, discountKind: "amount", discountValue: "0", setupFeeNote: "ignored" })).toMatchObject({ setupFeeDiscountCents: 0, setupFeeNote: null });
    });

    it("holds the note to printable ASCII, 1 to 200 characters", () => {
      const discounted = { ...PAID, discountKind: "amount", discountValue: "500" } as const;
      expect(refusal({ ...discounted, setupFeeNote: "छूट" })).toMatchObject({ field: "setupFeeNote" });
      expect(refusal({ ...discounted, setupFeeNote: "a".repeat(201) })).toMatchObject({ field: "setupFeeNote" });
      expect(draft({ ...discounted, setupFeeNote: "a".repeat(200) }).setupFeeNote).toHaveLength(200);
      // A typographic apostrophe is made plain, as on every other invoice text.
      expect(draft({ ...discounted, setupFeeNote: "Rao’s offer" }).setupFeeNote).toBe("Rao's offer");
    });

    it("types the build price in dollars for a dollar deal", () => {
      expect(draft({ ...PAID, countryCode: "US", buildPrice: "450", advanceValue: "100" })).toMatchObject({ currency: "USD", setupFeeListCents: 45_000, advanceCents: 10_000 });
    });
  });

  describe("custom recurring prices", () => {
    it("are null when blank, and whole rupees as minor units when typed", () => {
      expect(draft({ service: ["managed-website", "social-media"], websitePrice: "1,999", socialPrice: "" })).toMatchObject({ websitePriceCents: 199_900, socialPriceCents: null, adsPriceCents: null, monitoringPriceCents: null });
      expect(draft({ service: ["social-media", "expert-monitoring"], socialPrice: "2499", monitoringPrice: "3000" })).toMatchObject({ socialPriceCents: 249_900, monitoringPriceCents: 300_000 });
    });

    it("are whole dollars as cents for a dollar deal", () => {
      expect(draft({ countryCode: "US", websitePrice: "49" }).websitePriceCents).toBe(4_900);
    });

    it("go with a paid deal too", () => {
      expect(draft({ ...PAID, websitePrice: "2000" })).toMatchObject({ dealType: "paid", websitePriceCents: 200_000 });
    });

    it("refuse zero, a fraction or text, on the price's own field", () => {
      for (const websitePrice of ["0", "12.5", "-1", "free"]) expect(refusal({ websitePrice })).toMatchObject({ field: "websitePrice" });
    });

    it("refuse a price for a service that is not on the link", () => {
      expect(refusal({ socialPrice: "999" })).toMatchObject({ field: "socialPrice", message: expect.stringContaining("not on this link") });
    });

    it("refuse a coupon beside any price, on the price", () => {
      expect(refusal({ couponId: COUPON, websitePrice: "1999" })).toMatchObject({ field: "websitePrice", message: expect.stringContaining("not both") });
      expect(refusal({ service: ["managed-website", "social-media"], couponId: COUPON, socialPrice: "999" })).toMatchObject({ field: "socialPrice" });
      expect(draft({ couponId: COUPON, websitePrice: "" }).couponId).toBe(COUPON);
    });
  });

  it("refuses a coupon on a yearly paid deal, and says why", () => {
    expect(refusal({ ...PAID, billingInterval: "year", couponId: COUPON })).toMatchObject({ field: "couponId", message: expect.stringContaining("yearly link that has a build fee") });
    // A free deal has no build fee, and a monthly paid deal takes the coupon.
    expect(draft({ billingInterval: "year", couponId: COUPON }).couponId).toBe(COUPON);
    expect(draft({ ...PAID, billingInterval: "month", couponId: COUPON }).couponId).toBe(COUPON);
    expect(draft({ billingInterval: "year", couponId: COUPON, service: ["social-media"] }).couponId).toBe(COUPON);
  });

  it("refuses a coupon id that is not an id", () => {
    expect(refusal({ couponId: "LAUNCH" })).toMatchObject({ field: "couponId" });
  });

  describe("customer details", () => {
    it("are optional", () => {
      expect(draft().customer).toEqual({
        contactName: null,
        businessName: null,
        email: null,
        phoneCountry: null,
        phone: null,
        stateCode: null,
        gstin: null,
        legalName: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        postalCode: null,
      });
    });

    it("are kept clean", () => {
      expect(draft({ contactName: "  Asha   Rao ", businessName: "Rao’s Dental", email: " ASHA@Example.com ", phone: "98765 43210", stateCode: "mh", city: "Pune", postalCode: "411 001", addressLine1: "12 MG Road" }).customer).toMatchObject({
        contactName: "Asha Rao",
        businessName: "Rao's Dental",
        email: "asha@example.com",
        phone: "98765 43210",
        phoneCountry: "IN",
        stateCode: "mh",
        city: "Pune",
        postalCode: "411001",
        addressLine1: "12 MG Road",
      });
    });

    it("refuse a bad email, phone, state, pincode and an unprintable rupee business name", () => {
      expect(refusal({ email: "not-an-email" })).toMatchObject({ field: "email" });
      expect(refusal({ phone: "12" })).toMatchObject({ field: "phone" });
      expect(refusal({ stateCode: "xx" })).toMatchObject({ field: "stateCode" });
      expect(refusal({ postalCode: "12" })).toMatchObject({ field: "postalCode" });
      expect(refusal({ businessName: "राव डेंटल" })).toMatchObject({ field: "businessName" });
      expect(refusal({ city: "पुणे" })).toMatchObject({ field: "city" });
    });

    it("accept a dollar customer's business name in any script, and ask for no state", () => {
      expect(draft({ countryCode: "US", businessName: "राव डेंटल", stateCode: "mh" }).customer).toMatchObject({ businessName: "राव डेंटल", stateCode: null });
    });

    it("check a GSTIN, take the state from it and ask for the registered name", () => {
      const gstin = "27AAPFU0939F1ZV";
      expect(draft({ gstin, legalName: "Rao Dental LLP", stateCode: "ka" }).customer).toMatchObject({ gstin, stateCode: "mh", legalName: "Rao Dental LLP" });
      expect(refusal({ gstin: "27AAPFU0939F1ZX", legalName: "Rao Dental LLP" })).toMatchObject({ field: "gstin" });
      expect(refusal({ gstin })).toMatchObject({ field: "legalName" });
    });
  });
});

describe("parsePaymentLinkForm editing a deal with its advance paid (plan 66, step 6)", () => {
  const edit = (overrides: Record<string, string | string[]> = {}) => parsePaymentLinkForm(form({ dealType: "paid", buildPrice: "35000", discountKind: "none", ...overrides }), { fixedAdvanceCents: 1_000_000 });

  it("keeps the advance already received and ignores any advance fields posted", () => {
    const result = edit({ advanceKind: "percent", advanceValue: "99" });
    if (!result.ok) throw new Error(result.message);
    expect(result.draft.advanceCents).toBe(1_000_000);
    expect(result.draft.setupFeeListCents).toBe(3_500_000);
  });

  it("needs no advance fields at all", () => {
    expect(edit().ok).toBe(true);
  });

  it("allows the net price to equal the advance, and refuses one below it with its own message", () => {
    expect(edit({ buildPrice: "10000" }).ok).toBe(true);
    const below = edit({ buildPrice: "20000", discountKind: "amount", discountValue: "12000", setupFeeNote: "Agreed" });
    expect(below).toMatchObject({ ok: false, field: "buildPrice", message: expect.stringContaining("The balance cannot be negative") });
  });
});

describe("couponProblem", () => {
  const live = { affiliateId: null, active: true, currency: "INR", expiresAt: null } as const;
  const now = new Date("2026-11-27T12:00:00Z");
  it("accepts a live coupon in the link's currency", () => {
    expect(couponProblem(live, "INR", now)).toBeNull();
    expect(couponProblem({ ...live, expiresAt: new Date("2026-12-01T00:00:00Z") }, "INR", now)).toBeNull();
  });
  it("refuses an affiliate's code, a coupon that is off, in another currency or expired", () => {
    expect(couponProblem({ ...live, affiliateId: "a" }, "INR", now)).toMatch(/affiliate/);
    expect(couponProblem({ ...live, active: false }, "INR", now)).toMatch(/turned off/);
    expect(couponProblem(live, "USD", now)).toMatch(/INR/);
    expect(couponProblem({ ...live, expiresAt: new Date("2026-11-27T12:00:00Z") }, "INR", now)).toMatch(/expired/);
  });
});
