import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBillingProvider } from "@/features/checkout/server/billing";
import { loadSignupCheckoutBasket } from "./signup-checkout-basket";

vi.mock("@/features/checkout/server/billing", () => ({ getBillingProvider: vi.fn() }));

beforeEach(() => {
  vi.mocked(getBillingProvider).mockReset().mockReturnValue({ name: "razorpay" } as ReturnType<typeof getBillingProvider>);
});

describe("loadSignupCheckoutBasket", () => {
  it("prices a visitor in India in rupees with GST", () => {
    const table = loadSignupCheckoutBasket("IN");
    expect(table).toMatchObject({ currency: "INR", taxRateBasisPoints: 1800 });
    expect(table.services.map((service) => [service.id, service.monthlyCents, service.firstMonthCents])).toEqual([
      ["managed-website", 299_900, 299_900],
      ["social-media", 299_900, 100],
      ["expert-monitoring", 600_000, 600_000],
    ]);
  });

  it("prices every other country in dollars with no GST", () => {
    for (const country of ["AE", "US", "GB"]) expect(loadSignupCheckoutBasket(country)).toMatchObject({ currency: "USD", taxRateBasisPoints: 0 });
  });

  it("gives the first-month offer only through the provider the checkout uses", () => {
    vi.mocked(getBillingProvider).mockReturnValue({ name: "manual" } as ReturnType<typeof getBillingProvider>);
    expect(loadSignupCheckoutBasket("IN").services.some((service) => service.onOffer)).toBe(false);
  });
});
