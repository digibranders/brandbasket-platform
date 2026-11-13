// @vitest-environment node
import { findChargeByProviderOrder, recordFailedPayment } from "@brandbasket/db";
import { logBillingEvent } from "@brandbasket/shared/server/billing-log";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendPaymentFailed } from "./payment-emails";
import { recordRazorpayPaymentFailure, type RazorpayPaymentFailed } from "./payment-failure";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, findChargeByProviderOrder: vi.fn(), recordFailedPayment: vi.fn() };
});
vi.mock("@brandbasket/shared/server/billing-log", () => ({ logBillingEvent: vi.fn() }));
vi.mock("./payment-emails", () => ({ sendPaymentFailed: vi.fn(async () => undefined) }));
vi.mock("./db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));

const BUSINESS = "01920000-0000-7000-8000-0000000000b1";

const event: RazorpayPaymentFailed = {
  kind: "payment-failed",
  paymentId: "pay_failed_1",
  amountCents: 299_900,
  currency: "INR",
  failedAt: new Date("2026-11-28T04:30:00.000Z"),
  orderId: null,
  businessId: null,
  failureReason: "Payment was declined by the bank",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findChargeByProviderOrder).mockResolvedValue(null);
  vi.mocked(recordFailedPayment).mockResolvedValue("recorded");
});

describe("recordRazorpayPaymentFailure", () => {
  it("records a failed extra against the charge's business", async () => {
    vi.mocked(findChargeByProviderOrder).mockResolvedValue({ id: "charge-1", businessId: BUSINESS } as never);

    await recordRazorpayPaymentFailure({ ...event, orderId: "order_1" });

    expect(findChargeByProviderOrder).toHaveBeenCalledWith({ name: "staff-db" }, "razorpay", "order_1");
    expect(recordFailedPayment).toHaveBeenCalledWith(
      { name: "staff-db" },
      {
        businessId: BUSINESS,
        provider: "razorpay",
        providerPaymentId: "pay_failed_1",
        kind: "charge",
        amountCents: 299_900,
        currency: "INR",
        failureReason: "Payment was declined by the bank",
        failedAt: event.failedAt,
      },
    );
  });

  it("records a failure the notes tie to a business as a plan payment", async () => {
    await recordRazorpayPaymentFailure({ ...event, businessId: BUSINESS });

    expect(recordFailedPayment).toHaveBeenCalledWith({ name: "staff-db" }, expect.objectContaining({ businessId: BUSINESS, kind: "renewal" }));
  });

  it("emails the customer once about a plan payment that failed for the first time", async () => {
    await recordRazorpayPaymentFailure({ ...event, businessId: BUSINESS });

    expect(sendPaymentFailed).toHaveBeenCalledTimes(1);
    expect(sendPaymentFailed).toHaveBeenCalledWith({ businessId: BUSINESS, amountCents: 299_900, currency: "INR", chargeDescription: null });
  });

  it("names a failed extra by what it was for", async () => {
    vi.mocked(findChargeByProviderOrder).mockResolvedValue({ id: "charge-1", businessId: BUSINESS, description: "Extra change hours" } as never);

    await recordRazorpayPaymentFailure({ ...event, orderId: "order_1" });

    expect(sendPaymentFailed).toHaveBeenCalledWith(expect.objectContaining({ chargeDescription: "Extra change hours" }));
  });

  it("sends nothing for a delivery that was recorded before", async () => {
    vi.mocked(recordFailedPayment).mockResolvedValue("already-recorded");

    await recordRazorpayPaymentFailure({ ...event, businessId: BUSINESS });

    expect(sendPaymentFailed).not.toHaveBeenCalled();
  });

  it("sends nothing for a failure it cannot tie to a business", async () => {
    await recordRazorpayPaymentFailure(event);

    expect(sendPaymentFailed).not.toHaveBeenCalled();
  });

  it("logs a failure it cannot tie to a business", async () => {
    await recordRazorpayPaymentFailure(event);

    expect(recordFailedPayment).not.toHaveBeenCalled();
    expect(logBillingEvent).toHaveBeenCalledWith("warn", "confirmation-refused", expect.objectContaining({ reason: "unmatched-payment-failure", providerPaymentId: "pay_failed_1" }));
  });
});
