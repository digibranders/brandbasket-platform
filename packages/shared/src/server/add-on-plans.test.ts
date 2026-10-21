import { afterEach, describe, expect, it, vi } from "vitest";
import { addOnById, addOnPrice } from "../lib/billing/add-ons";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ findAddOnProviderPlan: vi.fn(), saveAddOnProviderPlan: vi.fn() }));

import type { BillingProvider } from "@brandbasket/billing";
import { findAddOnProviderPlan, saveAddOnProviderPlan } from "@brandbasket/db";
import { ensureAddOnPlan } from "./add-on-plans";

const staffDb = { name: "staff-db" } as never;
const DIGITAL_GROWTH = addOnById("digital-growth");
// Social Media and Ads in a Website + Social package: 20% off its list price, and the 40 paise that round the package down to a whole rupee.
const PACKAGE_PRICE = addOnPrice(DIGITAL_GROWTH, "INR", 200_020);
const KEY = { addOn: "digital-growth", netAmountCents: 799_880, taxRateBasisPoints: 1_800, currency: "INR", provider: "razorpay" } as const;

function providerWith(createPlan: BillingProvider["createPlan"]): BillingProvider {
  return { name: "razorpay", createPlan } as unknown as BillingProvider;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ensureAddOnPlan", () => {
  it("uses the plan already stored for this add-on and amount, without calling the provider", async () => {
    vi.mocked(findAddOnProviderPlan).mockResolvedValue("plan_stored");
    const createPlan = vi.fn();

    await expect(ensureAddOnPlan(staffDb, providerWith(createPlan), { addOn: DIGITAL_GROWTH, price: PACKAGE_PRICE })).resolves.toBe("plan_stored");

    expect(findAddOnProviderPlan).toHaveBeenCalledWith(staffDb, KEY);
    expect(createPlan).not.toHaveBeenCalled();
    expect(saveAddOnProviderPlan).not.toHaveBeenCalled();
  });

  it("makes the plan at the provider when there is none, saves it and returns the stored id", async () => {
    vi.mocked(findAddOnProviderPlan).mockResolvedValue(null);
    vi.mocked(saveAddOnProviderPlan).mockResolvedValue("plan_winner");
    const createPlan = vi.fn().mockResolvedValue({ providerPlanId: "plan_mine" });

    await expect(ensureAddOnPlan(staffDb, providerWith(createPlan), { addOn: DIGITAL_GROWTH, price: PACKAGE_PRICE })).resolves.toBe("plan_winner");

    expect(createPlan).toHaveBeenCalledWith({
      currency: "INR",
      netMonthlyCents: 799_880,
      taxRateBasisPoints: 1_800,
      code: "addon-digital-growth-799880",
      itemName: "Brandbasket Social Media and Ads",
    });
    expect(saveAddOnProviderPlan).toHaveBeenCalledWith(staffDb, { ...KEY, providerPlanId: "plan_mine" });
  });

  it("makes a dollar add-on's plan in dollars, with no tax", async () => {
    vi.mocked(findAddOnProviderPlan).mockResolvedValue(null);
    vi.mocked(saveAddOnProviderPlan).mockResolvedValue("plan_usd");
    const createPlan = vi.fn().mockResolvedValue({ providerPlanId: "plan_usd" });

    await expect(ensureAddOnPlan(staffDb, providerWith(createPlan), { addOn: DIGITAL_GROWTH, price: addOnPrice(DIGITAL_GROWTH, "USD") })).resolves.toBe("plan_usd");

    const key = { addOn: "digital-growth", netAmountCents: 7_500, taxRateBasisPoints: 0, currency: "USD", provider: "razorpay" } as const;
    expect(findAddOnProviderPlan).toHaveBeenCalledWith(staffDb, key);
    expect(createPlan).toHaveBeenCalledWith(expect.objectContaining({ currency: "USD", netMonthlyCents: 7_500, taxRateBasisPoints: 0 }));
    expect(saveAddOnProviderPlan).toHaveBeenCalledWith(staffDb, { ...key, providerPlanId: "plan_usd" });
  });

  it("returns null and saves nothing for a provider that needs no plan", async () => {
    vi.mocked(findAddOnProviderPlan).mockResolvedValue(null);
    const createPlan = vi.fn().mockResolvedValue({ providerPlanId: null });

    await expect(ensureAddOnPlan(staffDb, providerWith(createPlan), { addOn: DIGITAL_GROWTH, price: PACKAGE_PRICE })).resolves.toBeNull();

    expect(saveAddOnProviderPlan).not.toHaveBeenCalled();
  });
});
