import { afterEach, describe, expect, it, vi } from "vitest";
import { addOnById, addOnPrice } from "../lib/billing/add-ons";

vi.mock("server-only", () => ({}));
vi.mock("@fynix/db", () => ({ findAddOnProviderPlan: vi.fn(), saveAddOnProviderPlan: vi.fn() }));

import type { BillingProvider } from "@fynix/billing";
import { findAddOnProviderPlan, saveAddOnProviderPlan } from "@fynix/db";
import { ensureAddOnPlan } from "./add-on-plans";

const staffDb = { name: "staff-db" } as never;
const SOCIAL_MEDIA = addOnById("social-media");
const MEMBER_PRICE = addOnPrice(SOCIAL_MEDIA, true);
const KEY = { addOn: "social-media", netAmountCents: 179_910, taxRateBasisPoints: 1_800, currency: "INR", provider: "razorpay" } as const;

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

    await expect(ensureAddOnPlan(staffDb, providerWith(createPlan), { addOn: SOCIAL_MEDIA, price: MEMBER_PRICE })).resolves.toBe("plan_stored");

    expect(findAddOnProviderPlan).toHaveBeenCalledWith(staffDb, KEY);
    expect(createPlan).not.toHaveBeenCalled();
    expect(saveAddOnProviderPlan).not.toHaveBeenCalled();
  });

  it("makes the plan at the provider when there is none, saves it and returns the stored id", async () => {
    vi.mocked(findAddOnProviderPlan).mockResolvedValue(null);
    vi.mocked(saveAddOnProviderPlan).mockResolvedValue("plan_winner");
    const createPlan = vi.fn().mockResolvedValue({ providerPlanId: "plan_mine" });

    await expect(ensureAddOnPlan(staffDb, providerWith(createPlan), { addOn: SOCIAL_MEDIA, price: MEMBER_PRICE })).resolves.toBe("plan_winner");

    expect(createPlan).toHaveBeenCalledWith({
      currency: "INR",
      netMonthlyCents: 179_910,
      taxRateBasisPoints: 1_800,
      code: "addon-social-media-179910",
      itemName: "Fynix Social media",
    });
    expect(saveAddOnProviderPlan).toHaveBeenCalledWith(staffDb, { ...KEY, providerPlanId: "plan_mine" });
  });

  it("returns null and saves nothing for a provider that needs no plan", async () => {
    vi.mocked(findAddOnProviderPlan).mockResolvedValue(null);
    const createPlan = vi.fn().mockResolvedValue({ providerPlanId: null });

    await expect(ensureAddOnPlan(staffDb, providerWith(createPlan), { addOn: SOCIAL_MEDIA, price: MEMBER_PRICE })).resolves.toBeNull();

    expect(saveAddOnProviderPlan).not.toHaveBeenCalled();
  });
});
