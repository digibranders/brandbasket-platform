import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({
  findProviderBundlePlan: vi.fn().mockResolvedValue(null),
  findProviderDiscountPlan: vi.fn(),
  saveProviderBundlePlan: vi.fn().mockResolvedValue("plan_saved"),
  saveProviderDiscountPlan: vi.fn(),
}));

import type { BillingProvider } from "@brandbasket/billing";
import type { Plan } from "@brandbasket/db";
import { ensureDiscountPlanFor } from "./discount-plans";

const staffDb = { name: "staff-db" } as never;

function planIn(currency: "INR" | "USD"): Plan {
  return { id: "plan-1", code: "managed", currency, initialAmountCents: 0, recurringAmountCents: 0, taxRateBasisPoints: currency === "INR" ? 1_800 : 0 } as Plan;
}

describe("ensureDiscountPlanFor", () => {
  it.each([
    ["INR", "Brandbasket services (INR)"],
    ["USD", "Brandbasket services (USD)"],
  ] as const)("names the %s provider plan for a subscription with services as %s, which the customer sees at checkout", async (currency, itemName) => {
    const createPlan = vi.fn().mockResolvedValue({ providerPlanId: "plan_made" });

    await ensureDiscountPlanFor(staffDb, { name: "razorpay", createPlan } as unknown as BillingProvider, planIn(currency), 0, 1_039_800);

    expect(createPlan).toHaveBeenCalledWith(expect.objectContaining({ currency, itemName }));
  });
});
