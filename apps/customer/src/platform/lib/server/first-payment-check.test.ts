// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ listUnpaidOfferCheckouts: vi.fn() }));
vi.mock("./db", () => ({ getStaffDb: () => ({ staff: true }) }));
vi.mock("./billing", () => ({ getBillingProvider: vi.fn() }));
vi.mock("./razorpay-webhook-handler", () => ({ recordUpfrontFromRazorpay: vi.fn() }));

import { listUnpaidOfferCheckouts } from "@brandbasket/db";
import { getBillingProvider } from "./billing";
import { checkFirstPayments, firstPaymentCheckToken } from "./first-payment-check";
import { recordUpfrontFromRazorpay } from "./razorpay-webhook-handler";

const NOW = new Date("2026-11-13T08:00:00.000Z");
const checkout = (n: number) => ({ subscriptionId: `sub-${n}`, businessId: `biz-${n}`, providerSubscriptionId: `sub_rzp_${n}` });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(getBillingProvider).mockReturnValue({ name: "razorpay" } as never);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("checkFirstPayments", () => {
  it("asks Razorpay about every offer checkout still waiting, ten minutes after it opened, and counts what it found", async () => {
    vi.mocked(listUnpaidOfferCheckouts).mockResolvedValue([checkout(1), checkout(2), checkout(3)]);
    vi.mocked(recordUpfrontFromRazorpay).mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    expect(await checkFirstPayments(NOW)).toEqual({ checked: 3, found: 2, failed: 0 });
    expect(listUnpaidOfferCheckouts).toHaveBeenCalledWith({ staff: true }, { provider: "razorpay", now: NOW, settleMs: 600_000, limit: 100 });
    expect(recordUpfrontFromRazorpay).toHaveBeenNthCalledWith(2, "sub_rzp_2");
  });

  it("carries on past a checkout Razorpay could not be asked about, and reports it", async () => {
    vi.mocked(listUnpaidOfferCheckouts).mockResolvedValue([checkout(1), checkout(2)]);
    vi.mocked(recordUpfrontFromRazorpay).mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(true);

    expect(await checkFirstPayments(NOW)).toEqual({ checked: 2, found: 1, failed: 1 });
    expect(console.error).toHaveBeenCalled();
  });

  it("does nothing with any provider but Razorpay", async () => {
    vi.mocked(getBillingProvider).mockReturnValue({ name: "fake" } as never);
    expect(await checkFirstPayments(NOW)).toEqual({ checked: 0, found: 0, failed: 0 });
    expect(listUnpaidOfferCheckouts).not.toHaveBeenCalled();
  });

  it("reads its secret from PAYMENT_RECONCILE_TOKEN and refuses one that is missing or short", () => {
    expect(firstPaymentCheckToken()).toBeNull();
    vi.stubEnv("PAYMENT_RECONCILE_TOKEN", "short");
    expect(firstPaymentCheckToken()).toBeNull();
    vi.stubEnv("PAYMENT_RECONCILE_TOKEN", "k".repeat(40));
    expect(firstPaymentCheckToken()).toBe("k".repeat(40));
  });
});
