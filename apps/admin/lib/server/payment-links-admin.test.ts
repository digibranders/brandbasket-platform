import {
  extendPaymentLink,
  findBillingState,
  findLead,
  findOpenPaymentLinkForBusiness,
  findPaymentLinkById,
  findReferralCodeById,
  insertPaymentLink,
  revokePaymentLink,
  type PaymentLink,
  type ReferralCode,
} from "@brandbasket/db";
import { hashLinkToken } from "@brandbasket/shared/server/link-token";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentLinkDraft } from "@/lib/payment-link-form";
import { recordStaffAction } from "./activity";
import { createPaymentLinkFor, extendPaymentLinkFor, revokePaymentLinkFor } from "./payment-links-admin";
import type { GrantedStaff } from "./staff-access";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("./activity", () => ({ recordStaffAction: vi.fn() }));
vi.mock("@brandbasket/billing", () => ({ resolveBillingProviderName: () => "razorpay" }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    extendPaymentLink: vi.fn(),
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
  setupFeeListCents: 6_500_000,
  setupFeeDiscountCents: 1_500_000,
  setupFeeNote: "Agreed on call",
  couponId: null,
  customer: CUSTOMER,
};

const COUPON = { id: COUPON_ID, code: "LAUNCH", currency: "INR", affiliateId: null, discount: { kind: "amount", amountCents: 50_000 }, discountMonths: 3, active: true, expiresAt: null, maxRedemptions: null, createdAt: NOW } as unknown as ReferralCode;

const OPEN_LINK = { id: LINK_ID, businessId: BUSINESS, paidAt: null, revokedAt: null, expiresAt: NOW } as unknown as PaymentLink;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(insertPaymentLink).mockImplementation(async (_db, values) => ({ id: LINK_ID, ...values }) as unknown as PaymentLink);
  vi.mocked(findBillingState).mockResolvedValue({ hasEverPaid: false } as never);
  vi.mocked(findOpenPaymentLinkForBusiness).mockResolvedValue(null);
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
      setupFeeListCents: 6_500_000,
      setupFeeDiscountCents: 1_500_000,
      setupFeeNote: "Agreed on call",
      referralCodeId: null,
      createdByStaffId: "staff-1",
      businessName: "Rao Dental",
      phone: "98765 43210",
    });
    expect(stored?.expiresAt).toEqual(new Date("2026-12-04T10:00:00.000Z"));
    expect(JSON.stringify(stored)).not.toContain(outcome.token);
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, expect.objectContaining({ kind: "payment_link.created", data: { linkId: LINK_ID, setupFeeListCents: 6_500_000, setupFeeDiscountCents: 1_500_000 } }));
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

  it("refuses a coupon on a yearly link that has a build fee even if the form let it through", async () => {
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
