import { describe, expect, it, vi } from "vitest";
import { couponProblem, parsePaymentLinkForm, type ParsedPaymentLinkForm } from "./payment-link-form";

vi.mock("server-only", () => ({}));

const COUPON = "0194b0a0-0000-7000-8000-000000000001";

function form(overrides: Record<string, string | string[]> = {}): FormData {
  const values: Record<string, string | string[]> = {
    countryCode: "IN",
    service: ["managed-website"],
    websiteKind: "b2b",
    billingInterval: "month",
    discountKind: "none",
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
  it("reads a plain B2B deal in rupees with the list fee and nothing else", () => {
    expect(draft()).toMatchObject({
      countryCode: "IN",
      currency: "INR",
      services: ["managed-website"],
      billingInterval: "month",
      websiteKind: "b2b",
      setupFeeListCents: 3_500_000,
      setupFeeDiscountCents: 0,
      setupFeeNote: null,
      couponId: null,
    });
  });

  it("bills any country but India in dollars, at the dollar fee for the kind", () => {
    expect(draft({ countryCode: "US", websiteKind: "ecommerce" })).toMatchObject({ currency: "USD", setupFeeListCents: 450_000 });
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

  it("needs a website kind with the website, and carries no kind or fee without it", () => {
    expect(refusal({ websiteKind: "" })).toMatchObject({ field: "websiteKind" });
    expect(refusal({ websiteKind: "shop" })).toMatchObject({ field: "websiteKind" });
    expect(draft({ service: ["social-media"], websiteKind: "ecommerce", discountKind: "amount", discountValue: "500" })).toMatchObject({
      websiteKind: null,
      setupFeeListCents: null,
      setupFeeDiscountCents: null,
      setupFeeNote: null,
    });
  });

  it("refuses an interval that is neither monthly nor yearly", () => {
    expect(refusal({ billingInterval: "week" })).toMatchObject({ field: "billingInterval" });
  });

  it("turns an amount, a percentage or a final price into the discount, with its note", () => {
    expect(draft({ discountKind: "amount", discountValue: "10000", setupFeeNote: "Agreed on call" })).toMatchObject({ setupFeeDiscountCents: 1_000_000, setupFeeNote: "Agreed on call" });
    expect(draft({ websiteKind: "ecommerce", discountKind: "percent", discountValue: "20", setupFeeNote: "Launch offer" })).toMatchObject({ setupFeeDiscountCents: 1_300_000 });
    expect(draft({ discountKind: "final", discountValue: "20000", setupFeeNote: "Agreed on call" })).toMatchObject({ setupFeeDiscountCents: 1_500_000 });
  });

  it("allows the whole fee off, with its note", () => {
    expect(draft({ discountKind: "final", discountValue: "0", setupFeeNote: "Promised at sign-up" })).toMatchObject({ setupFeeDiscountCents: 3_500_000 });
    expect(draft({ discountKind: "percent", discountValue: "100", setupFeeNote: "Promised at sign-up" })).toMatchObject({ setupFeeDiscountCents: 3_500_000 });
  });

  it("refuses a discount that cannot be read or is past the fee", () => {
    expect(refusal({ discountKind: "amount", discountValue: "lots", setupFeeNote: "x" })).toMatchObject({ field: "discountValue" });
    expect(refusal({ discountKind: "amount", discountValue: "35001", setupFeeNote: "x" })).toMatchObject({ field: "discountValue" });
    expect(refusal({ discountKind: "percent", discountValue: "101", setupFeeNote: "x" })).toMatchObject({ field: "discountValue" });
    expect(refusal({ discountKind: "final", discountValue: "35001", setupFeeNote: "x" })).toMatchObject({ field: "discountValue" });
  });

  it("requires a note once the discount is above zero, and drops it when there is no discount", () => {
    expect(refusal({ discountKind: "amount", discountValue: "500" })).toMatchObject({ field: "setupFeeNote" });
    expect(refusal({ discountKind: "amount", discountValue: "500", setupFeeNote: "   " })).toMatchObject({ field: "setupFeeNote" });
    expect(draft({ discountKind: "amount", discountValue: "0", setupFeeNote: "ignored" })).toMatchObject({ setupFeeDiscountCents: 0, setupFeeNote: null });
  });

  it("holds the note to printable ASCII, 1 to 200 characters", () => {
    expect(refusal({ discountKind: "amount", discountValue: "500", setupFeeNote: "छूट" })).toMatchObject({ field: "setupFeeNote" });
    expect(refusal({ discountKind: "amount", discountValue: "500", setupFeeNote: "a".repeat(201) })).toMatchObject({ field: "setupFeeNote" });
    expect(draft({ discountKind: "amount", discountValue: "500", setupFeeNote: "a".repeat(200) }).setupFeeNote).toHaveLength(200);
    // A typographic apostrophe is made plain, as on every other invoice text.
    expect(draft({ discountKind: "amount", discountValue: "500", setupFeeNote: "Rao’s offer" }).setupFeeNote).toBe("Rao's offer");
  });

  it("refuses a coupon on a yearly link that has a build fee, and says why", () => {
    expect(refusal({ billingInterval: "year", couponId: COUPON })).toMatchObject({ field: "couponId", message: expect.stringContaining("yearly link that has a build fee") });
    // A fully waived fee leaves nothing to refuse, and a monthly link takes the coupon.
    expect(draft({ billingInterval: "year", couponId: COUPON, discountKind: "percent", discountValue: "100", setupFeeNote: "Waived" }).couponId).toBe(COUPON);
    expect(draft({ billingInterval: "month", couponId: COUPON }).couponId).toBe(COUPON);
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
