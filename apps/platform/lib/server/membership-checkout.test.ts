import { findBillingState, isPackageOfferForfeited, type BillingState, type Database, type Plan } from "@brandbasket/db";
import type { ReactivationBasket } from "@brandbasket/shared/lib/billing/bundle";
import { loadReactivationBasket } from "@brandbasket/shared/server/reactivation-basket";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBillingDetailsView } from "./billing-details";
import { getStaffDb } from "./db";
import { loadMembershipCheckout } from "./membership-checkout";
import { getMembershipPlan } from "./membership";
import { findCodeRefusedOnPackage, findLapsedAppliedCode, resolveAppliedDiscount } from "./referrals";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ findBillingState: vi.fn(), isPackageOfferForfeited: vi.fn() }));
vi.mock("@brandbasket/shared/server/reactivation-basket", () => ({ loadReactivationBasket: vi.fn() }));
vi.mock("./billing-details", () => ({ loadBillingDetailsView: vi.fn() }));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./membership", () => ({ getMembershipPlan: vi.fn() }));
vi.mock("./referrals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./referrals")>()),
  findCodeRefusedOnPackage: vi.fn(),
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
  vi.mocked(findCodeRefusedOnPackage).mockResolvedValue(null);
  vi.mocked(loadBillingDetailsView).mockResolvedValue(null);
});

describe("loadMembershipCheckout", () => {
  it("is the basket the address names for a business that has not paid", async () => {
    vi.mocked(findBillingState).mockResolvedValue(stateWith(false));

    const view = await loadMembershipCheckout(customer, "managed", ["digital-growth", "local-seo-aeo"], NOW);

    expect(view.services).toEqual(["digital-growth", "local-seo-aeo"]);
    expect(loadReactivationBasket).not.toHaveBeenCalled();
  });

  it("is the basket the business lapsed with, at its offer, for one that has paid before: the same one checkout reopens", async () => {
    vi.mocked(findBillingState).mockResolvedValue(stateWith(true));
    const lapsed: ReactivationBasket = { services: ["managed-website", "digital-growth"], forfeited: true, adCreditCents: 0, cancelled: true };
    vi.mocked(loadReactivationBasket).mockResolvedValue(lapsed);

    const view = await loadMembershipCheckout(customer, "managed", ["local-seo-aeo"], NOW);

    expect(loadReactivationBasket).toHaveBeenCalledWith(staffDb, BUSINESS_ID);
    expect(view).toMatchObject({ services: ["managed-website", "digital-growth"], forfeited: true, hasEverPaid: true, offer: { kind: "none" } });
    // Reactivation takes no code, so none is looked for against the basket.
    expect(resolveAppliedDiscount).not.toHaveBeenCalled();
    expect(findLapsedAppliedCode).not.toHaveBeenCalled();
  });

  it("looks for a code against a single service for a business that has not paid", async () => {
    vi.mocked(findBillingState).mockResolvedValue(stateWith(false));

    await loadMembershipCheckout(customer, "managed", ["managed-website"], NOW);

    expect(resolveAppliedDiscount).toHaveBeenCalledWith(BUSINESS_ID, { currency: "INR", listCents: 299_900 }, NOW);
  });
});
