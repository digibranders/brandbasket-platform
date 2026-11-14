import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordUpfrontFromRazorpay } from "@/platform/lib/server/razorpay-webhook-handler";
import { recordFirstPaymentIfHeld } from "./first-payment-lookup";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("@/platform/lib/server/razorpay-webhook-handler", () => ({ recordUpfrontFromRazorpay: vi.fn() }));

const OFFER = { provider: "razorpay", providerSubscriptionId: "sub_1", firstPaymentCents: 300_000 } as const;

beforeEach(() => vi.clearAllMocks());

describe("recordFirstPaymentIfHeld", () => {
  it("records the payment Razorpay holds and says so", async () => {
    vi.mocked(recordUpfrontFromRazorpay).mockResolvedValue(true);
    expect(await recordFirstPaymentIfHeld(OFFER)).toBe(true);
    expect(recordUpfrontFromRazorpay).toHaveBeenCalledWith("sub_1");
  });

  it("says no when Razorpay holds nothing yet", async () => {
    vi.mocked(recordUpfrontFromRazorpay).mockResolvedValue(false);
    expect(await recordFirstPaymentIfHeld(OFFER)).toBe(false);
  });

  it("asks nothing about a checkout with no upfront payment or another provider", async () => {
    expect(await recordFirstPaymentIfHeld({ ...OFFER, firstPaymentCents: null })).toBe(false);
    expect(await recordFirstPaymentIfHeld({ ...OFFER, provider: "fake" })).toBe(false);
    expect(recordUpfrontFromRazorpay).not.toHaveBeenCalled();
  });

  it("keeps the page waiting, without throwing, when Razorpay cannot be asked", async () => {
    vi.mocked(recordUpfrontFromRazorpay).mockRejectedValue(new Error("down"));
    expect(await recordFirstPaymentIfHeld(OFFER)).toBe(false);
  });
});
