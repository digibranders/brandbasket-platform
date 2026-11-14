import { describe, expect, it, vi } from "vitest";
import { getBillingProvider } from "../../checkout/server/billing";
import { getPaymentMethodUpdateUrlFor } from "./billing";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("../../checkout/server/billing", () => ({ getBillingProvider: vi.fn() }));

describe("getPaymentMethodUpdateUrlFor", () => {
  it("returns update URL for subscription from billing provider", async () => {
    const mockProvider = {
      getPaymentMethodUpdateUrl: vi.fn().mockResolvedValue("https://rzp.io/i/sub_12345"),
    };
    vi.mocked(getBillingProvider).mockReturnValue(mockProvider as never);

    const customer = {
      billing: {
        subscription: {
          providerSubscriptionId: "sub_12345",
        },
      },
    } as never;

    const url = await getPaymentMethodUpdateUrlFor(customer);
    expect(url).toBe("https://rzp.io/i/sub_12345");
    expect(mockProvider.getPaymentMethodUpdateUrl).toHaveBeenCalledWith("sub_12345");
  });

  it("throws when subscription is missing", async () => {
    const customer = {
      billing: {
        subscription: null,
      },
    } as never;

    await expect(getPaymentMethodUpdateUrlFor(customer)).rejects.toThrow("No active subscription");
  });
});
