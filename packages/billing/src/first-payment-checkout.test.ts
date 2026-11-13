import { describe, expect, it, vi } from "vitest";
import { createFakeBillingProvider } from "./fake-provider";
import { createRazorpayProvider, RAZORPAY_PAY_PATH } from "./razorpay-provider";

const BUSINESS = "11111111-1111-7111-8111-111111111111";
const plan = { id: "plan-1", code: "managed-inr", currency: "INR", providerPlanId: "plan_full", initialAmountCents: 0, initialTermMonths: 1, recurringAmountCents: 0 } as never;
const MONTH_ON = () => new Date(Date.now() + 30 * 86_400_000);

function razorpayWith(create: ReturnType<typeof vi.fn>) {
  return createRazorpayProvider({
    keySecret: "a-test-key-secret-at-least-this-long",
    client: { subscriptions: { create } } as never,
    resolveBusinessId: async () => null,
    resolveChargeOrder: async () => null,
  });
}

describe("Razorpay: a first-month offer in the basket", () => {
  it("opens the subscription to start a month on and takes the first payment as an upfront add-on", async () => {
    const create = vi.fn().mockResolvedValue({ id: "sub_offer" });
    const startAt = MONTH_ON();
    const started = await razorpayWith(create).startCheckout({
      businessId: BUSINESS,
      businessName: "Bakery",
      email: "o@b.test",
      plan,
      providerPlanId: "plan_5998",
      bundledAddOnNetCents: 599_800,
      firstPayment: { amountCents: 300_000, startAt },
    });
    expect(started).toEqual({ providerSubscriptionId: "sub_offer", checkoutUrl: RAZORPAY_PAY_PATH });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_id: "plan_5998",
        start_at: Math.floor(startAt.getTime() / 1000),
        addons: [{ item: { name: "Brandbasket first month", amount: 300_000, currency: "INR" } }],
      }),
    );
  });

  it("opens an ordinary checkout with no start date and no add-on", async () => {
    const create = vi.fn().mockResolvedValue({ id: "sub_plain" });
    await razorpayWith(create).startCheckout({ businessId: BUSINESS, businessName: "B", email: "o@b.test", plan });
    const sent = create.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent.start_at).toBeUndefined();
    expect(sent.addons).toBeUndefined();
  });

  it("refuses a first payment of nothing, a first charge in the past, and one combined with a kept plan", async () => {
    const provider = razorpayWith(vi.fn());
    const base = { businessId: BUSINESS, businessName: "B", email: "o@b.test", plan };
    await expect(provider.startCheckout({ ...base, firstPayment: { amountCents: 0, startAt: MONTH_ON() } })).rejects.toThrow(RangeError);
    await expect(provider.startCheckout({ ...base, firstPayment: { amountCents: 100, startAt: new Date(Date.now() - 1000) } })).rejects.toThrow(RangeError);
    await expect(provider.startCheckout({ ...base, startAt: MONTH_ON(), firstPayment: { amountCents: 100, startAt: MONTH_ON() } })).rejects.toThrow("kept plan");
  });
});

describe("the fake provider: a first-month offer in the basket", () => {
  const fake = createFakeBillingProvider({ secret: "a-test-secret-that-is-at-least-32-chars-long" });

  it("asks for the first payment, not the recurring amount", async () => {
    const started = await fake.startCheckout({ businessId: BUSINESS, businessName: "B", email: "o@b.test", plan, bundledAddOnNetCents: 599_800, firstPayment: { amountCents: 300_000, startAt: MONTH_ON() } });
    const token = new URL(started.checkoutUrl, "https://app.test").searchParams.get("token") ?? "";
    expect((await fake.confirmCheckout({ token })).amountCents).toBe(300_000);
  });

  it("refuses a first payment that is not a positive whole amount", async () => {
    await expect(fake.startCheckout({ businessId: BUSINESS, businessName: "B", email: "o@b.test", plan, firstPayment: { amountCents: 0, startAt: MONTH_ON() } })).rejects.toThrow(RangeError);
  });
});

describe("Razorpay: reading a subscription's first-month payment back", () => {
  const invoice = (overrides: Record<string, unknown> = {}) => ({ status: "paid", payment_id: "pay_up", line_items: [{ type: "addon" }], ...overrides });
  const payment = (overrides: Record<string, unknown> = {}) => ({ id: "pay_up", amount: 100, currency: "INR", created_at: 1_790_000_000, status: "captured", ...overrides });

  function providerWith(invoices: unknown[], fetched: Record<string, unknown> = payment()) {
    const fetch = vi.fn().mockResolvedValue(fetched);
    const all = vi.fn().mockResolvedValue({ items: invoices });
    const provider = createRazorpayProvider({
      keySecret: "a-test-key-secret-at-least-this-long",
      client: { invoices: { all }, payments: { fetch } } as never,
      resolveBusinessId: async () => null,
      resolveChargeOrder: async () => null,
    });
    return { provider, all, fetch };
  }

  it("finds the paid invoice of add-on lines and the captured payment that paid it", async () => {
    const { provider, all, fetch } = providerWith([invoice({ status: "issued", payment_id: null }), invoice()]);
    expect(await provider.findUpfrontPayment("sub_offer")).toEqual({ providerPaymentId: "pay_up", amountCents: 100, currency: "INR", paidAt: new Date(1_790_000_000 * 1000) });
    expect(all).toHaveBeenCalledWith({ subscription_id: "sub_offer" });
    expect(fetch).toHaveBeenCalledWith("pay_up");
  });

  it("is null before anything was paid, and for an invoice of an ordinary charge", async () => {
    expect(await providerWith([]).provider.findUpfrontPayment("sub_offer")).toBeNull();
    expect(await providerWith([invoice({ status: "issued" })]).provider.findUpfrontPayment("sub_offer")).toBeNull();
    const { provider, fetch } = providerWith([invoice({ line_items: [{ type: "plan" }] })]);
    expect(await provider.findUpfrontPayment("sub_offer")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is null for a payment that was not captured, or is in a currency or amount we cannot record", async () => {
    expect(await providerWith([invoice()], payment({ status: "authorized" })).provider.findUpfrontPayment("sub_offer")).toBeNull();
    expect(await providerWith([invoice()], payment({ currency: "EUR" })).provider.findUpfrontPayment("sub_offer")).toBeNull();
    expect(await providerWith([invoice()], payment({ amount: Number.NaN })).provider.findUpfrontPayment("sub_offer")).toBeNull();
  });
});
