import { createFakeBillingProvider, type BillingProvider } from "@fynix/billing";
import { findProviderDiscountPlan, saveProviderDiscountPlan, type Database, type Plan } from "@fynix/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "./db";
import { ensureDiscountPlan, UnevenPlanDiscountError } from "./discount-plans";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@fynix/db", async () => {
  const actual = await vi.importActual<typeof import("@fynix/db")>("@fynix/db");
  return { ...actual, findProviderDiscountPlan: vi.fn(), saveProviderDiscountPlan: vi.fn() };
});

const PLAN = {
  id: "plan-inr",
  code: "care-inr-2026-09",
  currency: "INR",
  initialAmountCents: 299_900,
  recurringAmountCents: 299_900,
  taxRateBasisPoints: 1_800,
} as Plan;

let provider: BillingProvider;
let createPlan: ReturnType<typeof vi.fn<BillingProvider["createPlan"]>>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStaffDb).mockReturnValue({ name: "staff" } as unknown as Database);
  createPlan = vi.fn<BillingProvider["createPlan"]>().mockResolvedValue({ providerPlanId: "plan_new" });
  provider = { ...createFakeBillingProvider({ secret: "a-test-secret-that-is-long-enough-000" }), name: "razorpay", createPlan };
  vi.mocked(saveProviderDiscountPlan).mockImplementation(async (_db, key) => key.providerPlanId);
});

describe("ensureDiscountPlan", () => {
  it("needs no plan when nothing is taken off", async () => {
    await expect(ensureDiscountPlan(provider, PLAN, 0)).resolves.toBeUndefined();
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("reuses the plan already made for this discount", async () => {
    vi.mocked(findProviderDiscountPlan).mockResolvedValue("plan_existing");
    await expect(ensureDiscountPlan(provider, PLAN, 50_000)).resolves.toBe("plan_existing");
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("makes a plan at the price less the discount, and remembers it", async () => {
    vi.mocked(findProviderDiscountPlan).mockResolvedValue(null);
    await expect(ensureDiscountPlan(provider, PLAN, 50_000)).resolves.toBe("plan_new");
    expect(createPlan).toHaveBeenCalledWith({
      currency: "INR",
      netMonthlyCents: 249_900,
      taxRateBasisPoints: 1_800,
      code: "care-inr-2026-09-less-50000",
    });
    expect(saveProviderDiscountPlan).toHaveBeenCalledWith(expect.anything(), {
      planId: "plan-inr",
      discountAmountCents: 50_000,
      provider: "razorpay",
      providerPlanId: "plan_new",
    });
  });

  it("refuses a plan whose first payment differs from its monthly price", async () => {
    await expect(ensureDiscountPlan(provider, { ...PLAN, initialAmountCents: 599_900 } as Plan, 50_000)).rejects.toThrow(
      UnevenPlanDiscountError,
    );
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("needs no plan for a provider that has none of its own", async () => {
    vi.mocked(findProviderDiscountPlan).mockResolvedValue(null);
    createPlan.mockResolvedValue({ providerPlanId: null });
    await expect(ensureDiscountPlan(provider, PLAN, 50_000)).resolves.toBeUndefined();
    expect(saveProviderDiscountPlan).not.toHaveBeenCalled();
  });
});
