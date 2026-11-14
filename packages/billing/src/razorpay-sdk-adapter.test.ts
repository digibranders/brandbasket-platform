import { describe, expect, it, vi } from "vitest";
import { wrapRazorpaySdkClient } from "./razorpay-sdk-adapter";

describe("wrapRazorpaySdkClient", () => {
  it("calls the real SDK's positional cancel with the object's cancel_at_cycle_end value", async () => {
    const cancel = vi.fn().mockResolvedValue({ id: "sub_1", status: "cancelled" });
    const fakeRealClient = {
      subscriptions: { create: vi.fn(), cancel },
      payments: { fetch: vi.fn() },
    };
    const wrapped = wrapRazorpaySdkClient(fakeRealClient as never);
    await wrapped.subscriptions.cancel("sub_1", { cancel_at_cycle_end: true });
    expect(cancel).toHaveBeenCalledWith("sub_1", true);
  });

  it("reads a subscription's id and status from the real SDK", async () => {
    const fetch = vi.fn().mockResolvedValue({ id: "sub_1", status: "halted", plan_id: "plan_1", notes: {} });
    const wrapped = wrapRazorpaySdkClient({ subscriptions: { fetch } } as never);
    await expect(wrapped.subscriptions.fetch("sub_1")).resolves.toEqual({ id: "sub_1", status: "halted" });
    expect(fetch).toHaveBeenCalledWith("sub_1");
  });

  it("keeps the paid count and the billing period of a subscription", async () => {
    const fetch = vi.fn().mockResolvedValue({ id: "sub_1", status: "active", paid_count: 1, current_start: 1_700_000_000, current_end: 1_702_592_000, notes: {} });
    const wrapped = wrapRazorpaySdkClient({ subscriptions: { fetch } } as never);
    await expect(wrapped.subscriptions.fetch("sub_1")).resolves.toEqual({ id: "sub_1", status: "active", paid_count: 1, current_start: 1_700_000_000, current_end: 1_702_592_000 });
  });

  it("coerces a string amount from the real SDK into a number", async () => {
    const fetch = vi.fn().mockResolvedValue({ id: "pay_1", amount: "7500", currency: "USD", created_at: 1_700_000_000 });
    const fakeRealClient = {
      subscriptions: { create: vi.fn(), cancel: vi.fn() },
      payments: { fetch },
    };
    const wrapped = wrapRazorpaySdkClient(fakeRealClient as never);
    const result = await wrapped.payments.fetch("pay_1");
    expect(result).toEqual({ id: "pay_1", amount: 7_500, currency: "USD", created_at: 1_700_000_000, method: null });
  });

  it.each(["abc", "", "   ", "0x10", "7.5", "-1", "1e3"])(
    "turns a malformed string amount (%j) into NaN instead of silently coercing it to 0",
    async (malformedAmount) => {
      const fetch = vi.fn().mockResolvedValue({
        id: "pay_1",
        amount: malformedAmount,
        currency: "USD",
        created_at: 1_700_000_000,
      });
      const fakeRealClient = {
        subscriptions: { create: vi.fn(), cancel: vi.fn() },
        payments: { fetch },
      };
      const wrapped = wrapRazorpaySdkClient(fakeRealClient as never);
      const result = await wrapped.payments.fetch("pay_1");
      expect(Number.isNaN(result.amount)).toBe(true);
      expect(Number.isSafeInteger(result.amount)).toBe(false);
    },
  );

  it("passes through a numeric amount from the real SDK unchanged", async () => {
    const fetch = vi.fn().mockResolvedValue({ id: "pay_1", amount: 7_500, currency: "USD", created_at: 1_700_000_000 });
    const fakeRealClient = {
      subscriptions: { create: vi.fn(), cancel: vi.fn() },
      payments: { fetch },
    };
    const wrapped = wrapRazorpaySdkClient(fakeRealClient as never);
    const result = await wrapped.payments.fetch("pay_1");
    expect(result.amount).toBe(7_500);
  });

  it("passes create's input straight through to the real SDK", async () => {
    const create = vi.fn().mockResolvedValue({ id: "sub_new" });
    const fakeRealClient = {
      subscriptions: { create, cancel: vi.fn() },
      payments: { fetch: vi.fn() },
    };
    const wrapped = wrapRazorpaySdkClient(fakeRealClient as never);
    const result = await wrapped.subscriptions.create({
      plan_id: "plan_1",
      total_count: 1_200,
      quantity: 1,
      customer_notify: false,
      notes: { businessId: "biz_1" },
    });
    expect(create).toHaveBeenCalledWith({
      plan_id: "plan_1",
      total_count: 1_200,
      quantity: 1,
      customer_notify: false,
      notes: { businessId: "biz_1" },
    });
    expect(result).toEqual({ id: "sub_new" });
  });

  it("passes a later start date (unix seconds) through to the real SDK", async () => {
    const create = vi.fn().mockResolvedValue({ id: "sub_later" });
    const wrapped = wrapRazorpaySdkClient({ subscriptions: { create } } as never);
    await wrapped.subscriptions.create({
      plan_id: "plan_1",
      total_count: 1_200,
      quantity: 1,
      customer_notify: false,
      notes: { businessId: "biz_1" },
      start_at: 4_102_444_800,
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ start_at: 4_102_444_800 }));
  });

  it("reads the payment method from the real SDK's payment entity", async () => {
    const fetch = vi.fn().mockResolvedValue({
      id: "pay_card",
      amount: 299_900,
      currency: "INR",
      created_at: 1_700_000_000,
      status: "captured",
      method: "card",
      card: { network: "Visa", last4: "4366", type: "credit", issuer: "HDFC" },
    });
    const fakeRealClient = {
      subscriptions: { create: vi.fn(), cancel: vi.fn() },
      payments: { fetch },
    };
    const wrapped = wrapRazorpaySdkClient(fakeRealClient as never);
    const result = await wrapped.payments.fetch("pay_card");
    expect(result.method).toEqual({
      method: "card",
      cardNetwork: "Visa",
      cardLast4: "4366",
      cardType: "credit",
      cardIssuer: "HDFC",
      upiVpa: null,
    });
  });

  it("adapts payments.refund to call real SDK client", async () => {
    const refund = vi.fn().mockResolvedValue({ id: "rfnd_abc", amount: "5000", status: "processed" });
    const wrapped = wrapRazorpaySdkClient({ payments: { refund } } as never);
    const result = await wrapped.payments.refund("pay_xyz", {
      amount: 5000,
      notes: { reason: "Customer request" },
      receipt: "rcpt_1",
    });
    expect(refund).toHaveBeenCalledWith("pay_xyz", {
      amount: 5000,
      notes: { reason: "Customer request" },
      receipt: "rcpt_1",
    });
    expect(result).toEqual({ id: "rfnd_abc", amount: 5000, status: "processed" });
  });
});

