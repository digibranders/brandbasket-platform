// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ listUnpaidCheckouts: vi.fn() }));
vi.mock("./db", () => ({ getStaffDb: () => ({ staff: true }) }));
vi.mock("./billing", () => ({ getBillingProvider: vi.fn() }));
vi.mock("./razorpay-webhook-handler", () => ({ recordChargeFromRazorpay: vi.fn(), recordUpfrontFromRazorpay: vi.fn() }));

import { listUnpaidCheckouts } from "@brandbasket/db";
import { getBillingProvider } from "./billing";
import { checkFirstPayments, firstPaymentCheckToken } from "./first-payment-check";
import { recordChargeFromRazorpay, recordUpfrontFromRazorpay } from "./razorpay-webhook-handler";

const NOW = new Date("2026-11-13T08:00:00.000Z");
const checkout = (n: number, firstPaymentCents: number | null = null) => ({
  subscriptionId: `sub-${n}`,
  businessId: `biz-${n}`,
  providerSubscriptionId: `sub_rzp_${n}`,
  firstPaymentCents,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(getBillingProvider).mockReturnValue({ name: "razorpay" } as never);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("checkFirstPayments", () => {
  it("asks Razorpay about every unpaid checkout still waiting after ten minutes, and counts what it found", async () => {
    vi.mocked(listUnpaidCheckouts).mockResolvedValue([checkout(1, null), checkout(2, 100), checkout(3, null)]);
    vi.mocked(recordChargeFromRazorpay).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    vi.mocked(recordUpfrontFromRazorpay).mockResolvedValueOnce(false);

    expect(await checkFirstPayments(NOW)).toEqual({ checked: 3, found: 2, failed: 0 });
    expect(listUnpaidCheckouts).toHaveBeenCalledWith({ staff: true }, { provider: "razorpay", now: NOW, settleMs: 600_000, limit: 100 });
    expect(recordChargeFromRazorpay).toHaveBeenCalledWith("sub_rzp_1");
    expect(recordUpfrontFromRazorpay).toHaveBeenCalledWith("sub_rzp_2");
    expect(recordChargeFromRazorpay).toHaveBeenCalledWith("sub_rzp_3");
  });

  it("carries on past an ordinary checkout Razorpay could not be asked about, and reports it", async () => {
    vi.mocked(listUnpaidCheckouts).mockResolvedValue([checkout(1, null), checkout(2, null)]);
    vi.mocked(recordChargeFromRazorpay).mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(true);

    expect(await checkFirstPayments(NOW)).toEqual({ checked: 2, found: 1, failed: 1 });
    expect(console.error).toHaveBeenCalled();
  });

  it("does nothing with any provider but Razorpay", async () => {
    vi.mocked(getBillingProvider).mockReturnValue({ name: "fake" } as never);
    expect(await checkFirstPayments(NOW)).toEqual({ checked: 0, found: 0, failed: 0 });
    expect(listUnpaidCheckouts).not.toHaveBeenCalled();
  });

  it("reads its secret from PAYMENT_RECONCILE_TOKEN and refuses one that is missing or short", () => {
    expect(firstPaymentCheckToken()).toBeNull();
    vi.stubEnv("PAYMENT_RECONCILE_TOKEN", "short");
    expect(firstPaymentCheckToken()).toBeNull();
    vi.stubEnv("PAYMENT_RECONCILE_TOKEN", "k".repeat(40));
    expect(firstPaymentCheckToken()).toBe("k".repeat(40));
  });
});
