import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    attachProviderPlan: vi.fn(),
    findActivePlan: vi.fn(),
    largestLiveReferralDiscount: vi.fn(),
    replaceMonthlyPrice: vi.fn(),
    updateExtraPrices: vi.fn(),
  };
});
vi.mock("./db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("./billing-provider", () => ({ getBillingProvider: vi.fn() }));

import { attachProviderPlan, findActivePlan, largestLiveReferralDiscount, replaceMonthlyPrice, updateExtraPrices } from "@brandbasket/db";
import { getBillingProvider } from "./billing-provider";
import { providerPlanItemName, savePriceSheet } from "./pricing-admin";

const NOW = new Date("2026-10-02T09:30:00.000Z");
const INR_PLAN = {
  currency: "INR",
  tier: "managed" as const,
  recurringAmountCents: 299_900,
  taxRateBasisPoints: 1800,
  extraHourAmountCents: 142_500,
  extraPublishAmountCents: 30_000,
  extraBlogPostsAmountCents: 47_500,
};
const SHEET = {
  currency: "INR" as const,
  tier: "managed" as const,
  monthlyCents: 299_900,
  extraHourCents: 142_500,
  extraPublishCents: 30_000,
  extraBlogPostsCents: 47_500,
};

const createPlan = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findActivePlan).mockResolvedValue(INR_PLAN as never);
  vi.mocked(largestLiveReferralDiscount).mockResolvedValue(50_000);
  vi.mocked(updateExtraPrices).mockResolvedValue([]);
  createPlan.mockResolvedValue({ providerPlanId: "plan_new" });
  vi.mocked(getBillingProvider).mockReturnValue({ createPlan } as never);
});

describe("savePriceSheet", () => {
  it("reprices the plan the sheet is for: its price is read, and its new version coded, as Managed Website", async () => {
    vi.mocked(findActivePlan).mockResolvedValue({ ...INR_PLAN, tier: "managed" } as never);
    await savePriceSheet({ sheet: { ...SHEET, tier: "managed", monthlyCents: 199_900 }, staffUserId: "staff-1" }, NOW);

    expect(findActivePlan).toHaveBeenCalledWith({ name: "staff-db" }, "INR", "managed");
    expect(createPlan).toHaveBeenCalledWith(expect.objectContaining({ code: "managed-inr-20261002-093000", netMonthlyCents: 199_900 }));
    expect(replaceMonthlyPrice).toHaveBeenCalledWith({ name: "staff-db" }, expect.objectContaining({ tier: "managed", netMonthlyCents: 199_900 }));
  });

  it("creates the provider plan at the taxed price before putting the new version on sale", async () => {
    const outcome = await savePriceSheet({ sheet: { ...SHEET, monthlyCents: 349_900 }, staffUserId: "staff-1" }, NOW);

    expect(outcome).toEqual({ kind: "updated", monthlyChanged: true, extrasChanged: 0 });
    expect(createPlan).toHaveBeenCalledWith({
      currency: "INR",
      netMonthlyCents: 349_900,
      taxRateBasisPoints: 1800,
      code: "managed-inr-20261002-093000",
      itemName: "Brandbasket Managed Website plan (INR)",
    });
    expect(replaceMonthlyPrice).toHaveBeenCalledWith(expect.anything(), {
      currency: "INR",
      tier: "managed",
      netMonthlyCents: 349_900,
      providerPlanId: "plan_new",
      staffId: "staff-1",
      now: NOW,
    });
    expect(vi.mocked(createPlan).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(replaceMonthlyPrice).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("changes nothing when the provider refuses the new plan", async () => {
    createPlan.mockRejectedValue(new Error("Razorpay said no"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const outcome = await savePriceSheet({ sheet: { ...SHEET, monthlyCents: 349_900, extraHourCents: 1 }, staffUserId: "staff-1" }, NOW);

    expect(outcome).toEqual({ kind: "provider-failed" });
    expect(replaceMonthlyPrice).not.toHaveBeenCalled();
    expect(updateExtraPrices).not.toHaveBeenCalled();
  });

  it("refuses a monthly price a live referral code would wipe out, before touching the provider", async () => {
    const outcome = await savePriceSheet({ sheet: { ...SHEET, monthlyCents: 50_000 }, staffUserId: "staff-1" }, NOW);

    expect(outcome).toEqual({ kind: "below-referral", largestDiscountCents: 50_000 });
    expect(createPlan).not.toHaveBeenCalled();
    expect(updateExtraPrices).not.toHaveBeenCalled();
  });

  it("only edits the extras when the monthly price is the same", async () => {
    vi.mocked(updateExtraPrices).mockResolvedValue(["extra_hour"]);

    const outcome = await savePriceSheet({ sheet: { ...SHEET, extraHourCents: 150_000 }, staffUserId: "staff-1" }, NOW);

    expect(outcome).toEqual({ kind: "updated", monthlyChanged: false, extrasChanged: 1 });
    expect(createPlan).not.toHaveBeenCalled();
    expect(updateExtraPrices).toHaveBeenCalledWith(expect.anything(), {
      currency: "INR",
      prices: { extraHourAmountCents: 150_000, extraPublishAmountCents: 30_000, extraBlogPostsAmountCents: 47_500 },
      staffId: "staff-1",
    });
  });

  it("says so when nothing changed", async () => {
    await expect(savePriceSheet({ sheet: SHEET, staffUserId: "staff-1" }, NOW)).resolves.toEqual({ kind: "unchanged" });
  });
});

describe("savePriceSheet on a price a migration put on sale", () => {
  // Care's and Premium's ₹6,999 start with no provider plan: saving the same price is how they get one.
  const WITHOUT_PROVIDER_PLAN = { ...INR_PLAN, id: "plan-1", code: "managed-inr-2026-10", providerPlanId: null };

  beforeEach(() => {
    vi.mocked(findActivePlan).mockResolvedValue(WITHOUT_PROVIDER_PLAN as never);
    vi.mocked(attachProviderPlan).mockResolvedValue(true);
  });

  it("creates the provider plan for the plan as it stands and attaches it, without putting a new version on sale", async () => {
    const outcome = await savePriceSheet({ sheet: SHEET, staffUserId: "staff-1" }, NOW);

    expect(createPlan).toHaveBeenCalledWith({ currency: "INR", netMonthlyCents: 299_900, taxRateBasisPoints: 1800, code: "managed-inr-2026-10", itemName: "Brandbasket Managed Website plan (INR)" });
    expect(attachProviderPlan).toHaveBeenCalledWith({ name: "staff-db" }, { planId: "plan-1", providerPlanId: "plan_new" });
    expect(replaceMonthlyPrice).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "updated", monthlyChanged: true, extrasChanged: 0 });
  });

  it("leaves a plan that already has a provider plan alone", async () => {
    vi.mocked(findActivePlan).mockResolvedValue({ ...WITHOUT_PROVIDER_PLAN, providerPlanId: "plan_existing" } as never);

    expect(await savePriceSheet({ sheet: SHEET, staffUserId: "staff-1" }, NOW)).toEqual({ kind: "unchanged" });
    expect(createPlan).not.toHaveBeenCalled();
    expect(attachProviderPlan).not.toHaveBeenCalled();
  });

  it("changes nothing under the fake provider, which has no provider plans to make", async () => {
    createPlan.mockResolvedValue({ providerPlanId: null });

    expect(await savePriceSheet({ sheet: SHEET, staffUserId: "staff-1" }, NOW)).toEqual({ kind: "unchanged" });
    expect(attachProviderPlan).not.toHaveBeenCalled();
  });

  it("stops, changing nothing, when the provider refuses to make the plan", async () => {
    createPlan.mockRejectedValue(new Error("Razorpay said no"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await savePriceSheet({ sheet: SHEET, staffUserId: "staff-1" }, NOW)).toEqual({ kind: "provider-failed" });
    expect(attachProviderPlan).not.toHaveBeenCalled();
    expect(updateExtraPrices).not.toHaveBeenCalled();
  });
});

describe("providerPlanItemName", () => {
  it("names the plan the way the payment provider's checkout shows it", () => {
    expect(providerPlanItemName("managed", "INR")).toBe("Brandbasket Managed Website plan (INR)");
    expect(providerPlanItemName("managed", "USD")).toBe("Brandbasket Managed Website plan (USD)");
  });
});
