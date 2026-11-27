import { businessHasHadService, findBillingState, findOpenPaymentLinkForBusiness, isPackageOfferForfeited, type BillingState, type Database, type Plan } from "@brandbasket/db";
import type { ReactivationBasket } from "@brandbasket/shared/lib/billing/bundle";
import { loadReactivationBasket } from "@brandbasket/shared/server/reactivation-basket";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBillingDetailsView } from "./billing-details";
import { getStaffDb } from "./db";
import { loadMembershipCheckout } from "./membership-checkout";
import { getMembershipPlan } from "./membership";
import { findLapsedAppliedCode, resolveAppliedDiscount } from "./referrals";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ businessHasHadService: vi.fn(), findBillingState: vi.fn(), findOpenPaymentLinkForBusiness: vi.fn(), isPackageOfferForfeited: vi.fn() }));
vi.mock("./billing", () => ({ getBillingProvider: () => ({ name: "razorpay" }) }));
vi.mock("@brandbasket/shared/server/reactivation-basket", () => ({ loadReactivationBasket: vi.fn() }));
vi.mock("./billing-details", () => ({ loadBillingDetailsView: vi.fn() }));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./membership", () => ({ getMembershipPlan: vi.fn() }));
vi.mock("./referrals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./referrals")>()),
  findLapsedAppliedCode: vi.fn(),
  resolveAppliedDiscount: vi.fn(),
}));

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const NOW = new Date("2026-10-21T12:00:00.000Z");
const PLAN = { id: "plan-inr", currency: "INR", initialAmountCents: 0, recurringAmountCents: 0, taxRateBasisPoints: 1800 } as Plan;
const customer = {
  tenant: { userId: "user-a", businessId: BUSINESS_ID, businessName: "Riverside Plumbing", role: "owner" },
  billing: {},
} as never;
const staffDb = { name: "staff-db" } as unknown as Database;

function stateWith(hasEverPaid: boolean): BillingState {
  return { currency: "INR", tier: "managed", upgradePaid: false, subscription: null, hasEverPaid, paymentUnderReview: false, plan: PLAN, addOns: [] };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStaffDb).mockReturnValue(staffDb);
  vi.mocked(getMembershipPlan).mockResolvedValue(PLAN);
  vi.mocked(isPackageOfferForfeited).mockResolvedValue(false);
  vi.mocked(resolveAppliedDiscount).mockResolvedValue(null);
  vi.mocked(findLapsedAppliedCode).mockResolvedValue(null);
  vi.mocked(loadBillingDetailsView).mockResolvedValue(null);
  vi.mocked(businessHasHadService).mockResolvedValue(false);
  vi.mocked(findOpenPaymentLinkForBusiness).mockResolvedValue(null);
});

describe("loadMembershipCheckout", () => {
  it("is the basket the address names for a business that has not paid", async () => {
    vi.mocked(findBillingState).mockResolvedValue(stateWith(false));

    const view = await loadMembershipCheckout(customer, "managed", ["social-media", "paid-ads"], NOW);

    expect(view.services).toEqual(["social-media", "paid-ads"]);
    expect(loadReactivationBasket).not.toHaveBeenCalled();
  });

  it("is the basket the business lapsed with, at its offer, for one that has paid before: the same one checkout reopens", async () => {
    vi.mocked(findBillingState).mockResolvedValue(stateWith(true));
    const lapsed: ReactivationBasket = { services: ["managed-website", "social-media"], forfeited: true, adCreditCents: 0, cancelled: true, billingInterval: "month" };
    vi.mocked(loadReactivationBasket).mockResolvedValue(lapsed);

    const view = await loadMembershipCheckout(customer, "managed", ["paid-ads"], NOW);

    expect(loadReactivationBasket).toHaveBeenCalledWith(staffDb, BUSINESS_ID);
    expect(view).toMatchObject({ services: ["managed-website", "social-media"], forfeited: true, hasEverPaid: true, offer: { kind: "none" } });
    // Reactivation takes no code, so none is looked for against the basket.
    expect(resolveAppliedDiscount).not.toHaveBeenCalled();
    expect(findLapsedAppliedCode).not.toHaveBeenCalled();
  });

  it("tells the page what the first-month offer is judged on: the provider and each plan the business has had", async () => {
    vi.mocked(findBillingState).mockResolvedValue(stateWith(false));
    vi.mocked(businessHasHadService).mockImplementation(async (_db, _business, addOn) => addOn === "paid-ads");

    const view = await loadMembershipCheckout(customer, "managed", ["social-media", "paid-ads"], NOW);

    // The website too: a build fee is owed on a first purchase of it only (plan 65).
    expect(view.firstMonth).toEqual({ provider: "razorpay", hadService: { "social-media": false, "paid-ads": true, "managed-website": false } });
    expect(businessHasHadService).toHaveBeenCalledWith(staffDb, BUSINESS_ID, "social-media");
  });

  describe("the website build fee (plan 65)", () => {
    const WEBSITE = ["managed-website"] as const;

    it("owes the list fee to a sign-up that has never had the website, for the kind it chose", async () => {
      vi.mocked(findBillingState).mockResolvedValue(stateWith(false));

      const view = await loadMembershipCheckout(customer, "managed", WEBSITE, NOW, "month", { chosenKind: "ecommerce", chargeListFee: true });

      expect(view.deal).toEqual({ kind: "ecommerce", fee: { listCents: 6_500_000, discountCents: 0, netCents: 6_500_000 }, note: null });
      expect(view).toMatchObject({ interval: "month", locked: false });
    });

    it("owes no fee to a website client invited by staff, to a business that has had the website, or for a basket with no website", async () => {
      vi.mocked(findBillingState).mockResolvedValue(stateWith(false));
      expect((await loadMembershipCheckout(customer, "managed", WEBSITE, NOW, "month", { chosenKind: "b2b", chargeListFee: false })).deal.fee).toBeNull();

      vi.mocked(businessHasHadService).mockImplementation(async (_db, _business, addOn) => addOn === "managed-website");
      expect((await loadMembershipCheckout(customer, "managed", WEBSITE, NOW, "month", { chosenKind: "b2b", chargeListFee: true })).deal.fee).toBeNull();

      vi.mocked(businessHasHadService).mockResolvedValue(false);
      expect((await loadMembershipCheckout(customer, "managed", ["social-media"], NOW, "month", { chosenKind: "b2b", chargeListFee: true })).deal.fee).toBeNull();
    });

    it("lets a payment link decide the services, the interval, the kind, the discount and the note, and locks the page", async () => {
      vi.mocked(findBillingState).mockResolvedValue(stateWith(false));
      vi.mocked(findOpenPaymentLinkForBusiness).mockResolvedValue({
        currency: "INR",
        services: ["managed-website", "social-media"],
        billingInterval: "year",
        websiteKind: "ecommerce",
        dealType: "paid",
        setupFeeListCents: 6_500_000,
        setupFeeDiscountCents: 1_500_000,
        setupFeeNote: "As agreed on call",
        websitePriceCents: null,
        socialPriceCents: null,
        adsPriceCents: null,
        monitoringPriceCents: null,
      } as never);

      // The address names a B2B website, monthly, alone: the link's deal wins.
      const view = await loadMembershipCheckout(customer, "managed", WEBSITE, NOW, "month", { chosenKind: "b2b", chargeListFee: true });

      expect(view).toMatchObject({
        services: ["managed-website", "social-media"],
        interval: "year",
        locked: true,
        deal: { kind: "ecommerce", fee: { listCents: 6_500_000, discountCents: 1_500_000, netCents: 5_000_000 }, note: "As agreed on call" },
      });
    });

    it("owes a free link no build fee, and carries its custom prices", async () => {
      vi.mocked(findBillingState).mockResolvedValue(stateWith(false));
      vi.mocked(findOpenPaymentLinkForBusiness).mockResolvedValue({
        currency: "INR",
        services: ["managed-website", "social-media"],
        billingInterval: "month",
        websiteKind: "b2b",
        dealType: "free",
        setupFeeListCents: null,
        setupFeeDiscountCents: null,
        setupFeeNote: null,
        websitePriceCents: 199_900,
        socialPriceCents: null,
        adsPriceCents: null,
        monitoringPriceCents: null,
      } as never);

      const view = await loadMembershipCheckout(customer, "managed", WEBSITE, NOW, "month", { chosenKind: "b2b", chargeListFee: true });

      expect(view).toMatchObject({ locked: true, deal: { fee: null }, customPrices: { "managed-website": 199_900 }, linkBuildListCents: null });
    });

    it("ignores a link made in another currency than the business's", async () => {
      vi.mocked(findBillingState).mockResolvedValue(stateWith(false));
      vi.mocked(findOpenPaymentLinkForBusiness).mockResolvedValue({ currency: "USD", services: ["social-media"], billingInterval: "year", websiteKind: "b2b" } as never);

      const view = await loadMembershipCheckout(customer, "managed", WEBSITE, NOW);

      expect(view).toMatchObject({ services: ["managed-website"], interval: "month", locked: false });
    });

    it("never offers a link or a fee to a business that has paid before", async () => {
      vi.mocked(findBillingState).mockResolvedValue(stateWith(true));
      vi.mocked(loadReactivationBasket).mockResolvedValue({ services: ["managed-website"], forfeited: false, adCreditCents: 0, cancelled: false, billingInterval: "month" });

      const view = await loadMembershipCheckout(customer, "managed", WEBSITE, NOW, "month", { chosenKind: "b2b", chargeListFee: true });

      expect(findOpenPaymentLinkForBusiness).not.toHaveBeenCalled();
      expect(view).toMatchObject({ deal: { fee: null }, locked: false });
    });
  });

  it("gives a business coming back from a lapse no first-month offer, as the checkout charges it", async () => {
    vi.mocked(findBillingState).mockResolvedValue(stateWith(true));
    vi.mocked(loadReactivationBasket).mockResolvedValue({ services: ["social-media"], forfeited: false, adCreditCents: 0, cancelled: false, billingInterval: "month" });

    expect((await loadMembershipCheckout(customer, "managed", ["social-media"], NOW)).firstMonth).toBeNull();
    expect(businessHasHadService).not.toHaveBeenCalled();
  });

  it("looks for a code against a single service for a business that has not paid", async () => {
    vi.mocked(findBillingState).mockResolvedValue(stateWith(false));

    await loadMembershipCheckout(customer, "managed", ["managed-website"], NOW);

    expect(resolveAppliedDiscount).toHaveBeenCalledWith(BUSINESS_ID, { currency: "INR", netCents: 299_900 }, NOW);
  });

  it("looks for a code against the two services at list for a package", async () => {
    vi.mocked(findBillingState).mockResolvedValue(stateWith(false));

    await loadMembershipCheckout(customer, "managed", ["managed-website", "social-media"], NOW);

    expect(resolveAppliedDiscount).toHaveBeenCalledWith(BUSINESS_ID, { currency: "INR", netCents: 599_800 }, NOW);
  });
});
