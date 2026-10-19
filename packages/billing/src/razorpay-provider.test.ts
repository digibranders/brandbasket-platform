import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CheckoutVerificationError } from "./provider";
import { createRazorpayProvider } from "./razorpay-provider";

const KEY_SECRET = "a-test-key-secret-at-least-this-long";

function signPaymentVerification(paymentId: string, subscriptionId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${paymentId}|${subscriptionId}`, "utf8").digest("hex");
}

function fakeClient(
  overrides: Partial<
    Record<"create" | "cancel" | "update" | "fetchSubscription" | "fetchPayment" | "createOrder" | "createPlan", ReturnType<typeof vi.fn>>
  > = {},
) {
  return {
    subscriptions: {
      create: overrides.create ?? vi.fn(),
      cancel: overrides.cancel ?? vi.fn(),
      update: overrides.update ?? vi.fn(),
      fetch: overrides.fetchSubscription ?? vi.fn(),
    },
    payments: {
      fetch: overrides.fetchPayment ?? vi.fn(),
    },
    orders: {
      create: overrides.createOrder ?? vi.fn(),
    },
    plans: {
      create: overrides.createPlan ?? vi.fn(),
    },
  };
}

describe("createRazorpayProvider", () => {
  it("has the name razorpay", () => {
    const provider = createRazorpayProvider({
      resolveChargeOrder: async () => null,
      keySecret: KEY_SECRET,
      client: fakeClient() as never,
      resolveBusinessId: async () => null,
    });
    expect(provider.name).toBe("razorpay");
  });

  describe("startCheckout", () => {
    it("creates a subscription on the plan's provider plan id and returns the local pay page as the checkout url", async () => {
      const create = vi.fn().mockResolvedValue({ id: "sub_new123" });
      const provider = createRazorpayProvider({
        resolveChargeOrder: async () => null,
        keySecret: KEY_SECRET,
        client: fakeClient({ create }) as never,
        resolveBusinessId: async () => null,
      });
      const result = await provider.startCheckout({
        businessId: "11111111-1111-7111-8111-111111111111",
        businessName: "Acme",
        email: "owner@acme.test",
        plan: {
          id: "plan-row-id",
          code: "care-usd",
          name: "Brandbasket care plan",
          currency: "USD",
          tier: "premium",
          initialAmountCents: 7_500,
          initialTermMonths: 1,
          recurringAmountCents: 7_500,
          includedPublishesPerMonth: 3,
          extraPublishAmountCents: 300,
          includedChangeHours: 1,
          extraHourAmountCents: 1_500,
          includedBlogPosts: 100,
          blogPostBlockSize: 100,
          extraBlogPostsAmountCents: 500,
          providerPlanId: "plan_razorpay123",
          taxRateBasisPoints: 0,
        },
      });
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ plan_id: "plan_razorpay123", customer_notify: false, quantity: 1 }),
      );
      // The cycle count is the UPI mandate's length, and UPI refuses a mandate longer than 30 years (360 monthly cycles).
      const cycles = (create.mock.calls[0]?.[0] as { total_count: number }).total_count;
      expect(cycles).toBeGreaterThan(0);
      expect(cycles).toBeLessThanOrEqual(360);
      // A discount is a discounted plan, never an Offer, so there is no offer key at all: an explicit
      // `offer_id: undefined` would be serialised by the SDK and rejected by Razorpay.
      expect(create.mock.calls[0]?.[0]).not.toHaveProperty("offer_id");
      expect(result).toEqual({ providerSubscriptionId: "sub_new123", checkoutUrl: "/billing/pay" });
    });

    it("reuses an existing provider subscription id without creating a new one", async () => {
      const create = vi.fn();
      const provider = createRazorpayProvider({
        resolveChargeOrder: async () => null,
        keySecret: KEY_SECRET,
        client: fakeClient({ create }) as never,
        resolveBusinessId: async () => null,
      });
      const result = await provider.startCheckout({
        businessId: "11111111-1111-7111-8111-111111111111",
        businessName: "Acme",
        email: "owner@acme.test",
        plan: { providerPlanId: "plan_razorpay123" } as never,
        existingProviderSubscriptionId: "sub_existing",
      });
      expect(create).not.toHaveBeenCalled();
      expect(result).toEqual({ providerSubscriptionId: "sub_existing", checkoutUrl: "/billing/pay" });
    });

    it("opens the subscription on the discounted plan a code runs on", async () => {
      const create = vi.fn().mockResolvedValue({ id: "sub_new123" });
      const provider = createRazorpayProvider({
        resolveChargeOrder: async () => null,
        keySecret: KEY_SECRET,
        client: fakeClient({ create }) as never,
        resolveBusinessId: async () => null,
      });
      await provider.startCheckout({
        businessId: "11111111-1111-7111-8111-111111111111",
        businessName: "Acme",
        email: "owner@acme.test",
        plan: { providerPlanId: "plan_razorpay123", code: "care-usd" } as never,
        providerPlanId: "plan_discounted456",
        discountAmountCents: 1_125,
      });
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ plan_id: "plan_discounted456" }));
      expect(create.mock.calls[0]?.[0]).not.toHaveProperty("offer_id");
    });

    it("throws when the plan has no provider plan id", async () => {
      const provider = createRazorpayProvider({
        resolveChargeOrder: async () => null,
        keySecret: KEY_SECRET,
        client: fakeClient() as never,
        resolveBusinessId: async () => null,
      });
      await expect(
        provider.startCheckout({
          businessId: "11111111-1111-7111-8111-111111111111",
          businessName: "Acme",
          email: "owner@acme.test",
          plan: { providerPlanId: null } as never,
        }),
      ).rejects.toThrow(/no Razorpay plan id/);
    });
  });

  describe("confirmCheckout", () => {
    it("verifies the signature, fetches the payment, and resolves the business id", async () => {
      const signature = signPaymentVerification("pay_1", "sub_1", KEY_SECRET);
      const fetchPayment = vi.fn().mockResolvedValue({ id: "pay_1", amount: 7_500, currency: "USD", created_at: 1_700_000_000 });
      const provider = createRazorpayProvider({
        resolveChargeOrder: async () => null,
        keySecret: KEY_SECRET,
        client: fakeClient({ fetchPayment }) as never,
        resolveBusinessId: async (id) => (id === "sub_1" ? "biz_1" : null),
      });
      const result = await provider.confirmCheckout({
        razorpay_payment_id: "pay_1",
        razorpay_subscription_id: "sub_1",
        razorpay_signature: signature,
      });
      expect(result).toEqual({
        providerSubscriptionId: "sub_1",
        providerPaymentId: "pay_1",
        businessId: "biz_1",
        amountCents: 7_500,
        currency: "USD",
        paidAt: new Date(1_700_000_000 * 1000),
      });
    });

    it("rejects a bad signature without calling the API", async () => {
      const fetchPayment = vi.fn();
      const provider = createRazorpayProvider({
        resolveChargeOrder: async () => null,
        keySecret: KEY_SECRET,
        client: fakeClient({ fetchPayment }) as never,
        resolveBusinessId: async () => "biz_1",
      });
      await expect(
        provider.confirmCheckout({ razorpay_payment_id: "pay_1", razorpay_subscription_id: "sub_1", razorpay_signature: "wrong" }),
      ).rejects.toThrow(CheckoutVerificationError);
      expect(fetchPayment).not.toHaveBeenCalled();
    });

    // Node's `Buffer.from(str, "hex")` never throws for a string input — an invalid hex string just decodes to a
    // shorter (or empty) buffer, silently. So the `try { Buffer.from(signature, "hex") } catch { ... }` in
    // razorpay-provider.ts can never actually reach its catch clause (the identical pattern in
    // razorpay-webhook.ts's `verifyRazorpayWebhookSignature` has the same property). What actually rejects a
    // non-hex signature is the length check right after it: the decoded buffer is empty (or truncated), so it
    // never matches the 32-byte HMAC-SHA256 digest length. This test exercises that real rejection path, not the
    // unreachable catch.
    it("rejects a non-hex signature without calling the API", async () => {
      const fetchPayment = vi.fn();
      const provider = createRazorpayProvider({
        resolveChargeOrder: async () => null,
        keySecret: KEY_SECRET,
        client: fakeClient({ fetchPayment }) as never,
        resolveBusinessId: async () => "biz_1",
      });
      await expect(
        provider.confirmCheckout({
          razorpay_payment_id: "pay_1",
          razorpay_subscription_id: "sub_1",
          razorpay_signature: "not-hex!",
        }),
      ).rejects.toThrow(CheckoutVerificationError);
      expect(fetchPayment).not.toHaveBeenCalled();
    });

    it("rejects a currency the app does not bill in", async () => {
      const signature = signPaymentVerification("pay_1", "sub_1", KEY_SECRET);
      const fetchPayment = vi.fn().mockResolvedValue({ id: "pay_1", amount: 7_500, currency: "GBP", created_at: 1_700_000_000 });
      const provider = createRazorpayProvider({
        resolveChargeOrder: async () => null,
        keySecret: KEY_SECRET,
        client: fakeClient({ fetchPayment }) as never,
        resolveBusinessId: async (id) => (id === "sub_1" ? "biz_1" : null),
      });
      await expect(
        provider.confirmCheckout({
          razorpay_payment_id: "pay_1",
          razorpay_subscription_id: "sub_1",
          razorpay_signature: signature,
        }),
      ).rejects.toThrow(CheckoutVerificationError);
    });

    it("rejects a subscription id it cannot resolve to a business", async () => {
      const signature = signPaymentVerification("pay_1", "sub_unknown", KEY_SECRET);
      const provider = createRazorpayProvider({
        resolveChargeOrder: async () => null,
        keySecret: KEY_SECRET,
        client: fakeClient({ fetchPayment: vi.fn().mockResolvedValue({ id: "pay_1", amount: 1, currency: "USD", created_at: 0 }) }) as never,
        resolveBusinessId: async () => null,
      });
      await expect(
        provider.confirmCheckout({ razorpay_payment_id: "pay_1", razorpay_subscription_id: "sub_unknown", razorpay_signature: signature }),
      ).rejects.toThrow(CheckoutVerificationError);
    });

    it("rejects a malformed payload", async () => {
      const provider = createRazorpayProvider({
        resolveChargeOrder: async () => null,
        keySecret: KEY_SECRET,
        client: fakeClient() as never,
        resolveBusinessId: async () => "biz_1",
      });
      await expect(provider.confirmCheckout({})).rejects.toThrow(CheckoutVerificationError);
      await expect(provider.confirmCheckout("not an object")).rejects.toThrow(CheckoutVerificationError);
    });
  });

  function providerCancelling(cancel: ReturnType<typeof vi.fn>, fetchSubscription: ReturnType<typeof vi.fn>) {
    return createRazorpayProvider({
      resolveChargeOrder: async () => null,
      keySecret: KEY_SECRET,
      client: fakeClient({ cancel, fetchSubscription }) as never,
      resolveBusinessId: async () => null,
    });
  }

  describe("cancelSubscription", () => {
    it("cancels immediately (not at cycle end)", async () => {
      const cancel = vi.fn().mockResolvedValue({});
      const provider = createRazorpayProvider({
        resolveChargeOrder: async () => null,
        keySecret: KEY_SECRET,
        client: fakeClient({ cancel }) as never,
        resolveBusinessId: async () => null,
      });
      await provider.cancelSubscription("sub_1");
      expect(cancel).toHaveBeenCalledWith("sub_1", { cancel_at_cycle_end: false });
    });

    it.each(["cancelled", "completed", "expired"])("resolves when Razorpay refused because the subscription is already %s", async (status) => {
      const cancel = vi.fn().mockRejectedValue(new Error("refused"));
      const fetchSubscription = vi.fn().mockResolvedValue({ id: "sub_1", status });
      await expect(providerCancelling(cancel, fetchSubscription).cancelSubscription("sub_1")).resolves.toBeUndefined();
      expect(fetchSubscription).toHaveBeenCalledWith("sub_1");
    });

    it("rethrows the original error when the subscription is still running", async () => {
      const original = new Error("refused for another reason");
      const cancel = vi.fn().mockRejectedValue(original);
      const fetchSubscription = vi.fn().mockResolvedValue({ id: "sub_1", status: "active" });
      await expect(providerCancelling(cancel, fetchSubscription).cancelSubscription("sub_1")).rejects.toBe(original);
    });

    it("rethrows the original error when the status cannot be fetched", async () => {
      const original = new Error("refused");
      const cancel = vi.fn().mockRejectedValue(original);
      const fetchSubscription = vi.fn().mockRejectedValue(new Error("network down"));
      await expect(providerCancelling(cancel, fetchSubscription).cancelSubscription("sub_1")).rejects.toBe(original);
    });

    it("rethrows the original error when Razorpay answers for another subscription", async () => {
      const original = new Error("refused");
      const cancel = vi.fn().mockRejectedValue(original);
      const fetchSubscription = vi.fn().mockResolvedValue({ id: "sub_2", status: "cancelled" });
      await expect(providerCancelling(cancel, fetchSubscription).cancelSubscription("sub_1")).rejects.toBe(original);
    });

    it("does not fetch when the cancel succeeds", async () => {
      const fetchSubscription = vi.fn();
      await providerCancelling(vi.fn().mockResolvedValue({}), fetchSubscription).cancelSubscription("sub_1");
      expect(fetchSubscription).not.toHaveBeenCalled();
    });

    it("does not read the error message to decide: an error that says nothing of cancelling still resolves for a cancelled subscription", async () => {
      const cancel = vi.fn().mockRejectedValue({ statusCode: 400, error: { description: "anything at all" } });
      const fetchSubscription = vi.fn().mockResolvedValue({ id: "sub_1", status: "cancelled" });
      await expect(providerCancelling(cancel, fetchSubscription).cancelSubscription("sub_1")).resolves.toBeUndefined();
    });
  });

  describe("cancelSubscriptionAtPeriodEnd", () => {
    it("cancels at cycle end, so the paid period runs out", async () => {
      const cancel = vi.fn().mockResolvedValue({});
      const provider = createRazorpayProvider({
        resolveChargeOrder: async () => null,
        keySecret: KEY_SECRET,
        client: fakeClient({ cancel }) as never,
        resolveBusinessId: async () => null,
      });
      await provider.cancelSubscriptionAtPeriodEnd("sub_1");
      expect(cancel).toHaveBeenCalledWith("sub_1", { cancel_at_cycle_end: true });
    });

    it.each(["cancelled", "completed", "expired"])("resolves when Razorpay refused because the subscription is already %s", async (status) => {
      const cancel = vi.fn().mockRejectedValue(new Error("refused"));
      const fetchSubscription = vi.fn().mockResolvedValue({ id: "sub_1", status });
      await expect(providerCancelling(cancel, fetchSubscription).cancelSubscriptionAtPeriodEnd("sub_1")).resolves.toBeUndefined();
    });

    it("rethrows the original error when the subscription is still running", async () => {
      const original = new Error("refused");
      const cancel = vi.fn().mockRejectedValue(original);
      const fetchSubscription = vi.fn().mockResolvedValue({ id: "sub_1", status: "active" });
      await expect(providerCancelling(cancel, fetchSubscription).cancelSubscriptionAtPeriodEnd("sub_1")).rejects.toBe(original);
    });

    it("rethrows the original error when the status cannot be fetched", async () => {
      const original = new Error("refused");
      const cancel = vi.fn().mockRejectedValue(original);
      const fetchSubscription = vi.fn().mockRejectedValue(new Error("network down"));
      await expect(providerCancelling(cancel, fetchSubscription).cancelSubscriptionAtPeriodEnd("sub_1")).rejects.toBe(original);
    });

    // The SDK's subscription entity has `has_scheduled_changes`, but Razorpay also sets it for a plan change booked for
    // the cycle end, which this app does. It cannot tell "will end" from "will switch plan", so it is never trusted.
    it("rethrows the original error for an active subscription with scheduled changes, which may be a plan change", async () => {
      const original = new Error("refused");
      const cancel = vi.fn().mockRejectedValue(original);
      const fetchSubscription = vi
        .fn()
        .mockResolvedValue({ id: "sub_1", status: "active", has_scheduled_changes: true, change_scheduled_at: 1_900_000_000 });
      await expect(providerCancelling(cancel, fetchSubscription).cancelSubscriptionAtPeriodEnd("sub_1")).rejects.toBe(original);
    });
  });

  describe("changeSubscriptionPlanAtPeriodEnd", () => {
    it("moves the subscription to the new plan from the next cycle, never now", async () => {
      const update = vi.fn().mockResolvedValue({});
      const provider = createRazorpayProvider({
        resolveChargeOrder: async () => null,
        keySecret: KEY_SECRET,
        client: fakeClient({ update }) as never,
        resolveBusinessId: async () => null,
      });
      await provider.changeSubscriptionPlanAtPeriodEnd("sub_1", "plan_discounted");
      expect(update).toHaveBeenCalledWith("sub_1", { plan_id: "plan_discounted", schedule_change_at: "cycle_end" });
    });
  });

  describe("fetchSubscriptionStatus", () => {
    function providerFetching(fetchSubscription: ReturnType<typeof vi.fn>) {
      return createRazorpayProvider({
        resolveChargeOrder: async () => null,
        keySecret: KEY_SECRET,
        client: fakeClient({ fetchSubscription }) as never,
        resolveBusinessId: async () => null,
      });
    }

    it("returns the status Razorpay holds for the subscription now", async () => {
      const fetchSubscription = vi.fn().mockResolvedValue({ id: "sub_1", status: "active" });
      await expect(providerFetching(fetchSubscription).fetchSubscriptionStatus("sub_1")).resolves.toBe("active");
      expect(fetchSubscription).toHaveBeenCalledWith("sub_1");
    });

    it("refuses an answer for another subscription, or one with no status", async () => {
      await expect(
        providerFetching(vi.fn().mockResolvedValue({ id: "sub_2", status: "active" })).fetchSubscriptionStatus("sub_1"),
      ).rejects.toThrow("Razorpay answered");
      await expect(
        providerFetching(vi.fn().mockResolvedValue({ id: "sub_1", status: "" })).fetchSubscriptionStatus("sub_1"),
      ).rejects.toThrow("Razorpay answered");
    });
  });
});

describe("charge payments", () => {
  const CHARGE = {
    businessId: "11111111-1111-7111-8111-111111111111",
    businessName: "Acme",
    email: "owner@acme.test",
    chargeId: "22222222-2222-7222-8222-222222222222",
    description: "Extra change hours · 2 h",
    amountCents: 336_300,
    currency: "INR" as const,
  };

  function signOrder(orderId: string, paymentId: string): string {
    return createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`, "utf8").digest("hex");
  }

  it("opens a Razorpay order for exactly the charge, tagged with the charge and business", async () => {
    const createOrder = vi.fn().mockResolvedValue({ id: "order_abc" });
    const provider = createRazorpayProvider({
      keySecret: KEY_SECRET,
      client: fakeClient({ createOrder }) as never,
      resolveBusinessId: async () => null,
      resolveChargeOrder: async () => null,
    });

    await expect(provider.startChargePayment(CHARGE)).resolves.toEqual({ providerOrderId: "order_abc", redirectTo: null });
    expect(createOrder).toHaveBeenCalledWith({
      amount: 336_300,
      currency: "INR",
      receipt: CHARGE.chargeId,
      notes: { businessId: CHARGE.businessId, chargeId: CHARGE.chargeId },
    });
  });

  it("confirms a correctly signed order payment for a charge we know", async () => {
    const fetchPayment = vi.fn().mockResolvedValue({ id: "pay_1", amount: 336_300, currency: "INR", created_at: 1_790_000_000 });
    const provider = createRazorpayProvider({
      keySecret: KEY_SECRET,
      client: fakeClient({ fetchPayment }) as never,
      resolveBusinessId: async () => null,
      resolveChargeOrder: async (id) => (id === "order_abc" ? { businessId: CHARGE.businessId, chargeId: CHARGE.chargeId } : null),
    });

    await expect(
      provider.confirmChargePayment({
        razorpay_order_id: "order_abc",
        razorpay_payment_id: "pay_1",
        razorpay_signature: signOrder("order_abc", "pay_1"),
      }),
    ).resolves.toEqual({
      providerOrderId: "order_abc",
      providerPaymentId: "pay_1",
      businessId: CHARGE.businessId,
      chargeId: CHARGE.chargeId,
      amountCents: 336_300,
      currency: "INR",
      paidAt: new Date(1_790_000_000 * 1000),
    });
  });

  it("refuses a bad signature, and an order we never opened", async () => {
    const provider = createRazorpayProvider({
      keySecret: KEY_SECRET,
      client: fakeClient() as never,
      resolveBusinessId: async () => null,
      resolveChargeOrder: async () => null,
    });

    await expect(
      provider.confirmChargePayment({ razorpay_order_id: "order_abc", razorpay_payment_id: "pay_1", razorpay_signature: "00" }),
    ).rejects.toThrow(CheckoutVerificationError);
    await expect(
      provider.confirmChargePayment({
        razorpay_order_id: "order_zzz",
        razorpay_payment_id: "pay_1",
        razorpay_signature: signOrder("order_zzz", "pay_1"),
      }),
    ).rejects.toThrow(/not one we have recorded/);
  });
});

describe("createPlan", () => {
  it("creates a monthly Razorpay plan at the price with its GST on top", async () => {
    const createPlan = vi.fn().mockResolvedValue({ id: "plan_new" });
    const provider = createRazorpayProvider({
      keySecret: KEY_SECRET,
      client: fakeClient({ createPlan }) as never,
      resolveBusinessId: async () => null,
      resolveChargeOrder: async () => null,
    });

    await expect(
      provider.createPlan({ currency: "INR", netMonthlyCents: 349_900, taxRateBasisPoints: 1800, code: "care-inr-20261002-093000" }),
    ).resolves.toEqual({ providerPlanId: "plan_new" });
    expect(createPlan).toHaveBeenCalledWith({
      period: "monthly",
      interval: 1,
      item: { name: "Subscription plan (INR)", amount: 412_882, currency: "INR" },
      notes: { brandbasketPlanCode: "care-inr-20261002-093000" },
    });
  });

  it("uses the given item name instead of the main plan's", async () => {
    const createPlan = vi.fn().mockResolvedValue({ id: "plan_addon" });
    const provider = createRazorpayProvider({
      keySecret: KEY_SECRET,
      client: fakeClient({ createPlan }) as never,
      resolveBusinessId: async () => null,
      resolveChargeOrder: async () => null,
    });

    await provider.createPlan({
      currency: "INR",
      netMonthlyCents: 500_000,
      taxRateBasisPoints: 1800,
      code: "add-on-social-media-590000",
      itemName: "Social media",
    });
    expect(createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ item: { name: "Social media", amount: 590_000, currency: "INR" } }),
    );
  });
});

describe("add-on subscriptions", () => {
  const BUSINESS_ID = "11111111-1111-7111-8111-111111111111";
  const ADD_ON_SUBSCRIPTION_ID = "33333333-3333-7333-8333-333333333333";
  const INPUT = {
    businessId: BUSINESS_ID,
    addOnSubscriptionId: ADD_ON_SUBSCRIPTION_ID,
    providerPlanId: "plan_addon",
    amountCents: 590_000,
    currency: "INR" as const,
    startAt: null,
  };

  function razorpayWith(create: ReturnType<typeof vi.fn>) {
    return createRazorpayProvider({
      keySecret: KEY_SECRET,
      client: fakeClient({ create }) as never,
      resolveBusinessId: async () => null,
      resolveChargeOrder: async () => null,
    });
  }

  it("opens a subscription on the add-on's plan, tagged with the business and the add-on, starting at once", async () => {
    const create = vi.fn().mockResolvedValue({ id: "sub_addon1" });

    await expect(razorpayWith(create).startAddOnSubscription(INPUT)).resolves.toEqual({
      providerSubscriptionId: "sub_addon1",
      checkoutUrl: null,
    });
    expect(create).toHaveBeenCalledWith({
      plan_id: "plan_addon",
      total_count: 120,
      quantity: 1,
      customer_notify: false,
      notes: { businessId: BUSINESS_ID, addOnSubscriptionId: ADD_ON_SUBSCRIPTION_ID },
    });
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("start_at");
  });

  it("sends a later start date as whole unix seconds", async () => {
    const create = vi.fn().mockResolvedValue({ id: "sub_addon2" });
    const startAt = new Date("2099-01-15T10:30:00.750Z");

    await razorpayWith(create).startAddOnSubscription({ ...INPUT, startAt });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ start_at: Math.floor(startAt.getTime() / 1000) }));
    expect(Number.isInteger((create.mock.calls[0]?.[0] as { start_at: number }).start_at)).toBe(true);
  });

  it("refuses a missing plan id and a start date that has passed or is not a date, without calling Razorpay", async () => {
    const create = vi.fn();
    const provider = razorpayWith(create);

    await expect(provider.startAddOnSubscription({ ...INPUT, providerPlanId: null })).rejects.toThrow(/Razorpay plan/);
    await expect(provider.startAddOnSubscription({ ...INPUT, startAt: new Date("2000-01-01T00:00:00Z") })).rejects.toThrow(
      /in the future/,
    );
    await expect(provider.startAddOnSubscription({ ...INPUT, startAt: new Date(Number.NaN) })).rejects.toThrow(
      /valid date/,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("leaves confirming an add-on to the webhook", async () => {
    const provider = razorpayWith(vi.fn());
    await expect(provider.confirmAddOnPayment({})).rejects.toThrow(CheckoutVerificationError);
    await expect(provider.confirmAddOnPayment({})).rejects.toThrow(/confirmed by Razorpay's webhook/);
  });
});
