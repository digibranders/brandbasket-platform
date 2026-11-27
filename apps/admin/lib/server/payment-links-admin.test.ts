import {
  findDealForBusiness,
  extendPaymentLink,
  findBillingState,
  findLead,
  findOpenPaymentLinkForBusiness,
  findPaymentLinkById,
  findReferralCodeById,
  insertPaymentLink,
  revokePaymentLink,
  updateDeal,
  type PaymentLink,
  type ReferralCode,
} from "@brandbasket/db";
import { cancelPendingDealCheckout } from "@brandbasket/shared/server/deal-checkout";
import { hashLinkToken } from "@brandbasket/shared/server/link-token";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentLinkDraft } from "@/lib/payment-link-form";
import { recordStaffAction } from "./activity";
import { createPaymentLinkFor, extendPaymentLinkFor, revokePaymentLinkFor, updateDealFor } from "./payment-links-admin";
import type { GrantedStaff } from "./staff-access";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("./activity", () => ({ recordStaffAction: vi.fn() }));
vi.mock("./billing-provider", () => ({ getBillingProvider: () => ({ name: "fake" }) }));
vi.mock("@brandbasket/shared/server/deal-checkout", () => ({ cancelPendingDealCheckout: vi.fn() }));
vi.mock("@brandbasket/billing", () => ({ resolveBillingProviderName: () => "razorpay" }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    extendPaymentLink: vi.fn(),
    findDealForBusiness: vi.fn(),
    findBillingState: vi.fn(),
    findClientDetail: vi.fn(),
    findLead: vi.fn(),
    findOpenPaymentLinkForBusiness: vi.fn(),
    findPaymentLinkById: vi.fn(),
    findReferralCodeById: vi.fn(),
    insertPaymentLink: vi.fn(),
    listPaymentLinks: vi.fn(),
    listReferralCodes: vi.fn(),
    listStaffRoster: vi.fn(),
    revokePaymentLink: vi.fn(),
    updateDeal: vi.fn(),
  };
});

const NOW = new Date("2026-11-27T10:00:00.000Z");
const STAFF = { user: { id: "staff-1" }, staff: { role: "admin" } } as unknown as GrantedStaff;
const BUSINESS = "0194b0a0-0000-7000-8000-0000000000b1";
const LEAD = "0194b0a0-0000-7000-8000-0000000000a1";
const COUPON_ID = "0194b0a0-0000-7000-8000-0000000000c1";
const LINK_ID = "0194b0a0-0000-7000-8000-0000000000d1";

const CUSTOMER = {
  contactName: "Asha Rao",
  businessName: "Rao Dental",
  email: "asha@example.com",
  phoneCountry: "IN",
  phone: "98765 43210",
  stateCode: "mh",
  gstin: null,
  legalName: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  postalCode: null,
} as const;

const DRAFT: PaymentLinkDraft = {
  countryCode: "IN",
  currency: "INR",
  services: ["managed-website", "social-media"],
  billingInterval: "month",
  websiteKind: "ecommerce",
  dealType: "paid",
  setupFeeListCents: 6_500_000,
  setupFeeDiscountCents: 1_500_000,
  setupFeeNote: "Agreed on call",
  advanceCents: 2_000_000,
  websitePriceCents: null,
  socialPriceCents: null,
  adsPriceCents: null,
  monitoringPriceCents: null,
  couponId: null,
  customer: CUSTOMER,
};

/** A free deal with a custom website price and Social at list. */
const FREE_DRAFT: PaymentLinkDraft = { ...DRAFT, dealType: "free", setupFeeListCents: null, setupFeeDiscountCents: null, setupFeeNote: null, advanceCents: null, websitePriceCents: 199_900 };

const COUPON = { id: COUPON_ID, code: "LAUNCH", currency: "INR", affiliateId: null, discount: { kind: "amount", amountCents: 50_000 }, discountMonths: 3, active: true, expiresAt: null, maxRedemptions: null, createdAt: NOW } as unknown as ReferralCode;

const OPEN_LINK = { id: LINK_ID, businessId: BUSINESS, paidAt: null, revokedAt: null, expiresAt: NOW } as unknown as PaymentLink;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(insertPaymentLink).mockImplementation(async (_db, values) => ({ id: LINK_ID, ...values }) as unknown as PaymentLink);
  vi.mocked(findBillingState).mockResolvedValue({ hasEverPaid: false } as never);
  vi.mocked(findOpenPaymentLinkForBusiness).mockResolvedValue(null);
  vi.mocked(findDealForBusiness).mockResolvedValue(null);
  vi.mocked(findLead).mockResolvedValue({ id: LEAD } as never);
});

describe("createPaymentLinkFor", () => {
  it("stores the hash of a token it returns once, with seven days and the deal as the form had it", async () => {
    const outcome = await createPaymentLinkFor({ form: DRAFT, staff: STAFF, leadId: LEAD, now: NOW });
    if (outcome.kind !== "created") throw new Error(`expected created, got ${outcome.message}`);
    expect(outcome.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = vi.mocked(insertPaymentLink).mock.calls[0]?.[1];
    expect(stored).toMatchObject({
      tokenHash: hashLinkToken(outcome.token),
      leadId: LEAD,
      businessId: null,
      currency: "INR",
      countryCode: "IN",
      services: ["managed-website", "social-media"],
      billingInterval: "month",
      websiteKind: "ecommerce",
      dealType: "paid",
      setupFeeListCents: 6_500_000,
      setupFeeDiscountCents: 1_500_000,
      setupFeeNote: "Agreed on call",
      advanceCents: 2_000_000,
      websitePriceCents: null,
      socialPriceCents: null,
      adsPriceCents: null,
      monitoringPriceCents: null,
      referralCodeId: null,
      createdByStaffId: "staff-1",
      businessName: "Rao Dental",
      phone: "98765 43210",
    });
    expect(stored?.expiresAt).toEqual(new Date("2026-12-04T10:00:00.000Z"));
    expect(JSON.stringify(stored)).not.toContain(outcome.token);
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, expect.objectContaining({ kind: "payment_link.created", data: expect.objectContaining({ linkId: LINK_ID, dealType: "paid", advanceCents: 2_000_000, setupFeeListCents: 6_500_000 }) }));
  });

  it("stores a free deal with no build columns and the custom price it was given", async () => {
    const outcome = await createPaymentLinkFor({ form: FREE_DRAFT, staff: STAFF, now: NOW });
    expect(outcome.kind).toBe("created");
    expect(vi.mocked(insertPaymentLink).mock.calls[0]?.[1]).toMatchObject({
      dealType: "free",
      websiteKind: "ecommerce",
      setupFeeListCents: null,
      setupFeeDiscountCents: null,
      setupFeeNote: null,
      advanceCents: null,
      websitePriceCents: 199_900,
      socialPriceCents: null,
    });
  });

  it("refuses a coupon beside a custom price even if the form let it through", async () => {
    vi.mocked(findReferralCodeById).mockResolvedValue(COUPON);
    const outcome = await createPaymentLinkFor({ form: { ...FREE_DRAFT, couponId: COUPON_ID }, staff: STAFF, now: NOW });
    expect(outcome).toMatchObject({ kind: "refused", message: expect.stringContaining("not both") });
    expect(insertPaymentLink).not.toHaveBeenCalled();
  });

  it("makes a link for an account that never paid", async () => {
    const outcome = await createPaymentLinkFor({ form: DRAFT, staff: STAFF, businessId: BUSINESS, now: NOW });
    expect(outcome.kind).toBe("created");
    expect(vi.mocked(insertPaymentLink).mock.calls[0]?.[1]).toMatchObject({ businessId: BUSINESS });
  });

  it("refuses a business that has ever paid", async () => {
    vi.mocked(findBillingState).mockResolvedValue({ hasEverPaid: true } as never);
    const outcome = await createPaymentLinkFor({ form: DRAFT, staff: STAFF, businessId: BUSINESS, now: NOW });
    expect(outcome).toMatchObject({ kind: "refused", message: expect.stringContaining("has paid before") });
    expect(insertPaymentLink).not.toHaveBeenCalled();
  });

  it("refuses a business that already has an open link, and says to cancel it first", async () => {
    vi.mocked(findOpenPaymentLinkForBusiness).mockResolvedValue(OPEN_LINK);
    const outcome = await createPaymentLinkFor({ form: DRAFT, staff: STAFF, businessId: BUSINESS, now: NOW });
    expect(outcome).toMatchObject({ kind: "refused", message: expect.stringContaining("Cancel it first") });
    expect(insertPaymentLink).not.toHaveBeenCalled();
  });

  it("refuses a business whose deal is being built, whatever else is open (plan 66)", async () => {
    vi.mocked(findDealForBusiness).mockResolvedValue(OPEN_LINK);
    const outcome = await createPaymentLinkFor({ form: DRAFT, staff: STAFF, businessId: BUSINESS, now: NOW });
    expect(outcome).toMatchObject({ kind: "refused", message: expect.stringContaining("deal in progress") });
    expect(insertPaymentLink).not.toHaveBeenCalled();
  });

  it("refuses a business or an enquiry that no longer exists", async () => {
    vi.mocked(findBillingState).mockResolvedValue(null);
    expect(await createPaymentLinkFor({ form: DRAFT, staff: STAFF, businessId: BUSINESS, now: NOW })).toMatchObject({ kind: "refused" });
    vi.mocked(findLead).mockResolvedValue(null);
    expect(await createPaymentLinkFor({ form: DRAFT, staff: STAFF, leadId: LEAD, now: NOW })).toMatchObject({ kind: "refused" });
    expect(insertPaymentLink).not.toHaveBeenCalled();
  });

  it("stores a coupon that is live in the link's currency", async () => {
    vi.mocked(findReferralCodeById).mockResolvedValue(COUPON);
    const outcome = await createPaymentLinkFor({ form: { ...DRAFT, couponId: COUPON_ID }, staff: STAFF, now: NOW });
    expect(outcome.kind).toBe("created");
    expect(vi.mocked(insertPaymentLink).mock.calls[0]?.[1]).toMatchObject({ referralCodeId: COUPON_ID });
  });

  it.each([
    ["an affiliate's code", { affiliateId: "aff-1" }, "affiliate"],
    ["a coupon that is off", { active: false }, "turned off"],
    ["a coupon in the other currency", { currency: "USD" }, "USD"],
    ["an expired coupon", { expiresAt: new Date("2026-11-01T00:00:00Z") }, "expired"],
  ])("refuses %s", async (_name, change, words) => {
    vi.mocked(findReferralCodeById).mockResolvedValue({ ...COUPON, ...change } as ReferralCode);
    const outcome = await createPaymentLinkFor({ form: { ...DRAFT, couponId: COUPON_ID }, staff: STAFF, now: NOW });
    expect(outcome).toMatchObject({ kind: "refused", field: "couponId", message: expect.stringContaining(words) });
    expect(insertPaymentLink).not.toHaveBeenCalled();
  });

  it("refuses a coupon that no longer exists", async () => {
    vi.mocked(findReferralCodeById).mockResolvedValue(null);
    expect(await createPaymentLinkFor({ form: { ...DRAFT, couponId: COUPON_ID }, staff: STAFF, now: NOW })).toMatchObject({ kind: "refused", field: "couponId" });
  });

  it("refuses a coupon on a yearly paid deal even if the form let it through", async () => {
    vi.mocked(findReferralCodeById).mockResolvedValue(COUPON);
    const outcome = await createPaymentLinkFor({ form: { ...DRAFT, billingInterval: "year", couponId: COUPON_ID }, staff: STAFF, now: NOW });
    expect(outcome).toMatchObject({ kind: "refused", message: expect.stringContaining("yearly link that has a build fee") });
    expect(insertPaymentLink).not.toHaveBeenCalled();
  });
});

describe("revokePaymentLinkFor", () => {
  it("cancels an unpaid link and records it", async () => {
    vi.mocked(findPaymentLinkById).mockResolvedValue(OPEN_LINK);
    vi.mocked(revokePaymentLink).mockResolvedValue(true);
    expect(await revokePaymentLinkFor({ linkId: LINK_ID, staff: STAFF, now: NOW })).toBe("done");
    expect(revokePaymentLink).toHaveBeenCalledWith({ name: "staff-db" }, { linkId: LINK_ID, staffUserId: "staff-1", now: NOW });
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, expect.objectContaining({ kind: "payment_link.cancelled", businessId: BUSINESS }));
    // A checkout the customer opened for the balance can no longer be paid.
    expect(cancelPendingDealCheckout).toHaveBeenCalledWith({ name: "staff-db" }, { name: "fake" }, { businessId: BUSINESS, linkId: LINK_ID, now: NOW });
  });
  it("says so when the link is gone or already paid or cancelled, recording nothing", async () => {
    vi.mocked(findPaymentLinkById).mockResolvedValue(null);
    expect(await revokePaymentLinkFor({ linkId: LINK_ID, staff: STAFF, now: NOW })).toBe("not-found");
    vi.mocked(findPaymentLinkById).mockResolvedValue(OPEN_LINK);
    vi.mocked(revokePaymentLink).mockResolvedValue(false);
    expect(await revokePaymentLinkFor({ linkId: LINK_ID, staff: STAFF, now: NOW })).toBe("not-open");
    expect(recordStaffAction).not.toHaveBeenCalled();
  });
});

describe("extendPaymentLinkFor", () => {
  it("gives seven more days from now and records it", async () => {
    vi.mocked(findPaymentLinkById).mockResolvedValue(OPEN_LINK);
    vi.mocked(findOpenPaymentLinkForBusiness).mockResolvedValue(OPEN_LINK);
    vi.mocked(extendPaymentLink).mockResolvedValue(true);
    expect(await extendPaymentLinkFor({ linkId: LINK_ID, staff: STAFF, now: NOW })).toBe("done");
    expect(extendPaymentLink).toHaveBeenCalledWith({ name: "staff-db" }, { linkId: LINK_ID, expiresAt: new Date("2026-12-04T10:00:00.000Z") });
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, expect.objectContaining({ kind: "payment_link.extended" }));
  });
  it("refuses a paid or cancelled link and one that is gone", async () => {
    vi.mocked(findPaymentLinkById).mockResolvedValue(null);
    expect(await extendPaymentLinkFor({ linkId: LINK_ID, staff: STAFF, now: NOW })).toBe("not-found");
    vi.mocked(findPaymentLinkById).mockResolvedValue({ ...OPEN_LINK, businessId: null });
    vi.mocked(extendPaymentLink).mockResolvedValue(false);
    expect(await extendPaymentLinkFor({ linkId: LINK_ID, staff: STAFF, now: NOW })).toBe("not-open");
    expect(recordStaffAction).not.toHaveBeenCalled();
  });
  it("will not bring an old link back beside another open one for the same business", async () => {
    vi.mocked(findPaymentLinkById).mockResolvedValue(OPEN_LINK);
    vi.mocked(findOpenPaymentLinkForBusiness).mockResolvedValue({ ...OPEN_LINK, id: "another" });
    expect(await extendPaymentLinkFor({ linkId: LINK_ID, staff: STAFF, now: NOW })).toBe("business-has-another");
    expect(extendPaymentLink).not.toHaveBeenCalled();
  });
});

describe("updateDealFor (plan 66, step 6)", () => {
  /** A paid deal whose advance is paid and whose website is still being built. */
  const BUILDING = {
    id: LINK_ID,
    businessId: BUSINESS,
    dealType: "paid",
    currency: "INR",
    countryCode: "IN",
    services: ["managed-website", "social-media"],
    billingInterval: "month",
    websiteKind: "ecommerce",
    setupFeeListCents: 6_500_000,
    setupFeeDiscountCents: 1_500_000,
    setupFeeNote: "Agreed on call",
    advanceCents: 2_000_000,
    advancePaidAt: NOW,
    readyAt: null,
    paidAt: null,
    revokedAt: null,
    expiresAt: NOW,
    referralCodeId: null,
    websitePriceCents: null,
    socialPriceCents: null,
    adsPriceCents: null,
    monitoringPriceCents: null,
  } as unknown as PaymentLink;

  const edit = (change: Partial<PaymentLinkDraft>) => updateDealFor({ form: { ...DRAFT, ...change }, linkId: LINK_ID, staff: STAFF, now: NOW });

  beforeEach(() => {
    vi.mocked(findPaymentLinkById).mockResolvedValue(BUILDING);
    vi.mocked(updateDeal).mockResolvedValue(true);
  });

  it("saves a new build price and a custom price, keeps the advance, records what changed and ends an open checkout", async () => {
    const outcome = await edit({ setupFeeListCents: 5_000_000, setupFeeDiscountCents: 0, setupFeeNote: null, socialPriceCents: 199_900 });
    expect(outcome).toMatchObject({ kind: "saved", businessId: BUSINESS });
    const patch = vi.mocked(updateDeal).mock.calls[0]?.[1].patch;
    expect(patch).toMatchObject({ setupFeeListCents: 5_000_000, setupFeeDiscountCents: 0, socialPriceCents: 199_900, services: ["managed-website", "social-media"] });
    expect(patch).not.toHaveProperty("advanceCents");
    expect(cancelPendingDealCheckout).toHaveBeenCalledWith({ name: "staff-db" }, { name: "fake" }, { businessId: BUSINESS, linkId: LINK_ID, now: NOW });
    const entry = vi.mocked(recordStaffAction).mock.calls[0]?.[1];
    expect(entry).toMatchObject({ businessId: BUSINESS, kind: "payment_link.edited" });
    expect(entry?.summary).toContain("build price ₹65,000 to ₹50,000");
    expect(entry?.summary).toContain("Social Media price list to ₹1,999");
    expect(entry?.data).toMatchObject({ before: { setupFeeListCents: 6_500_000 }, after: { setupFeeListCents: 5_000_000 } });
  });

  it("allows the balance to reach 0 (net price equal to the advance)", async () => {
    expect(await edit({ setupFeeListCents: 2_000_000, setupFeeDiscountCents: 0, setupFeeNote: null })).toMatchObject({ kind: "saved" });
  });

  it("refuses a net build price below the advance, with its own message, and saves nothing", async () => {
    const outcome = await edit({ setupFeeListCents: 2_500_000, setupFeeDiscountCents: 600_000 });
    expect(outcome).toMatchObject({ kind: "refused", field: "buildPrice", message: expect.stringContaining("less than the advance already paid") });
    expect(updateDeal).not.toHaveBeenCalled();
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it("cannot change the advance, the currency or drop the website", async () => {
    expect(await edit({ advanceCents: 1_000_000 })).toMatchObject({ kind: "refused", field: "advanceValue" });
    expect(await edit({ currency: "USD" })).toMatchObject({ kind: "refused", field: "countryCode" });
    expect(await edit({ services: ["social-media"], websiteKind: null })).toMatchObject({ kind: "refused", field: "service" });
    expect(updateDeal).not.toHaveBeenCalled();
  });

  it("refuses a coupon beside a custom price, and a coupon on a yearly deal that has a build", async () => {
    vi.mocked(findReferralCodeById).mockResolvedValue(COUPON);
    expect(await edit({ couponId: COUPON_ID, socialPriceCents: 199_900 })).toMatchObject({ kind: "refused", message: expect.stringContaining("not both") });
    expect(await edit({ couponId: COUPON_ID, billingInterval: "year" })).toMatchObject({ kind: "refused", message: expect.stringContaining("yearly link that has a build fee") });
    expect(updateDeal).not.toHaveBeenCalled();
  });

  it.each([
    ["marked ready (undo it first)", { readyAt: NOW }, "Undo ready"],
    ["paid", { paidAt: NOW }, "paid"],
    ["cancelled", { revokedAt: NOW }, "cancelled"],
    ["still waiting for its advance", { advancePaidAt: null }, "not paid yet"],
    ["a free deal", { dealType: "free", advanceCents: null }, "Only a paid deal"],
  ])("refuses a deal that is %s", async (_name, change, words) => {
    vi.mocked(findPaymentLinkById).mockResolvedValue({ ...BUILDING, ...change } as unknown as PaymentLink);
    expect(await edit({})).toMatchObject({ kind: "refused", message: expect.stringContaining(words) });
    expect(updateDeal).not.toHaveBeenCalled();
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it("says so when staff marked it ready between the page and the save", async () => {
    vi.mocked(updateDeal).mockResolvedValue(false);
    expect(await edit({})).toMatchObject({ kind: "refused", message: expect.stringContaining("Undo ready") });
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it("answers not-found for a link that is gone", async () => {
    vi.mocked(findPaymentLinkById).mockResolvedValue(null);
    expect(await edit({})).toEqual({ kind: "not-found" });
  });
});
