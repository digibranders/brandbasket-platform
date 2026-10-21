import type { Plan } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import {
  createFakeBillingProvider,
  FAKE_ADD_ON_CONFIRM_PATH,
  FAKE_CHARGE_CONFIRM_PATH,
  FAKE_CONFIRM_PATH,
  FAKE_PAYMENT_METHOD,
} from "./fake-provider";
import { CheckoutVerificationError, type StartCheckoutInput } from "./provider";

const SECRET = "a-test-secret-that-is-long-enough-000";
const OTHER_SECRET = "another-secret-that-is-long-enough-111";
const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const OTHER_BUSINESS_ID = "0192f3c4-2222-7000-8000-000000000002";
const PAID_AT = new Date("2026-09-16T12:00:00.000Z");

const USD_PLAN: Plan = {
  id: "0192f3c4-3333-7000-8000-000000000003",
  code: "managed-usd-2026-10",
  name: "Managed Website",
  currency: "USD",
  tier: "managed",
  initialAmountCents: 22500,
  initialTermMonths: 3,
  recurringAmountCents: 7500,
  includedPublishesPerMonth: 3,
  extraPublishAmountCents: 300,
  includedChangeHours: 1,
  extraHourAmountCents: 1500,
  includedBlogPosts: 100,
  blogPostBlockSize: 100,
  extraBlogPostsAmountCents: 500,
  providerPlanId: null,
  taxRateBasisPoints: 0,
};

const CHECKOUT: StartCheckoutInput = {
  businessId: BUSINESS_ID,
  businessName: "Riverside Plumbing",
  email: "ana@example.com",
  plan: USD_PLAN,
};

const ISSUED_AT_SECONDS = PAID_AT.getTime() / 1000;
const EXPIRES_AT_SECONDS = ISSUED_AT_SECONDS + 60 * 60;

function provider(secret = SECRET, now: () => Date = () => PAID_AT) {
  return createFakeBillingProvider({ secret, now });
}

function tokenFrom(checkoutUrl: string): string {
  const url = new URL(checkoutUrl, "http://app.localhost");
  expect(url.pathname).toBe(FAKE_CONFIRM_PATH);
  const token = url.searchParams.get("token");
  if (token === null) throw new Error("checkout URL carries no token");
  return token;
}

function rewritePayload(token: string, rewrite: (message: string) => string): string {
  const [version, payload, signature] = token.split(".");
  if (version === undefined || payload === undefined || signature === undefined) throw new Error("bad token shape");
  const message = Buffer.from(payload, "base64url").toString("utf8");
  return `${version}.${Buffer.from(rewrite(message), "utf8").toString("base64url")}.${signature}`;
}

async function expectRejected(promise: Promise<unknown>, token: string): Promise<void> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(CheckoutVerificationError);
  // The token is the credential; it must never end up in an error message and from there in a log.
  expect((error as Error).message).not.toContain(token);
}

describe("createFakeBillingProvider", () => {
  it("round-trips a checkout into the payment it confirms", async () => {
    const fake = provider();
    const started = await fake.startCheckout(CHECKOUT);

    expect(started.providerSubscriptionId).toMatch(/^fake_sub_[0-9a-f]{24}$/);
    const confirmed = await fake.confirmCheckout({ token: tokenFrom(started.checkoutUrl) });

    expect(confirmed).toEqual({
      providerSubscriptionId: started.providerSubscriptionId,
      providerPaymentId: `fake_pay_${started.providerSubscriptionId.slice("fake_sub_".length)}`,
      businessId: BUSINESS_ID,
      amountCents: 22500,
      currency: "USD",
      paidAt: PAID_AT,
      method: FAKE_PAYMENT_METHOD,
    });
  });

  it("mints a new subscription id for each checkout", async () => {
    const fake = provider();
    const first = await fake.startCheckout(CHECKOUT);
    const second = await fake.startCheckout(CHECKOUT);
    expect(first.providerSubscriptionId).not.toBe(second.providerSubscriptionId);
  });

  it("returns to an existing unpaid subscription instead of opening another", async () => {
    const fake = provider();
    const first = await fake.startCheckout(CHECKOUT);
    const again = await fake.startCheckout({ ...CHECKOUT, existingProviderSubscriptionId: first.providerSubscriptionId });

    expect(again.providerSubscriptionId).toBe(first.providerSubscriptionId);
    // Same subscription, same payment id: confirming either link records one payment.
    const fromFirst = await fake.confirmCheckout({ token: tokenFrom(first.checkoutUrl) });
    const fromAgain = await fake.confirmCheckout({ token: tokenFrom(again.checkoutUrl) });
    expect(fromAgain.providerPaymentId).toBe(fromFirst.providerPaymentId);
  });

  it("charges the plan's own amount and currency", async () => {
    const inrPlan: Plan = { ...USD_PLAN, code: "care-inr", currency: "INR", initialAmountCents: 350000, initialTermMonths: 1 };
    const fake = provider();
    const started = await fake.startCheckout({ ...CHECKOUT, plan: inrPlan });
    expect(await fake.confirmCheckout({ token: tokenFrom(started.checkoutUrl) })).toMatchObject({
      amountCents: 350000,
      currency: "INR",
    });
  });

  it("charges a basket of services on the plan that costs nothing: the lines' nets with the plan's tax on top", async () => {
    // All three services in rupees at the package price, ₹26,597 a month before 18% GST (docs/plans/16-platform-pricing-offers.md).
    const services: Plan = { ...USD_PLAN, code: "services-inr-2026-10", currency: "INR", initialAmountCents: 0, recurringAmountCents: 0, taxRateBasisPoints: 1_800 };
    const fake = provider();
    const started = await fake.startCheckout({ ...CHECKOUT, plan: services, bundledAddOnNetCents: 2_659_700 });
    expect(await fake.confirmCheckout({ token: tokenFrom(started.checkoutUrl) })).toMatchObject({ amountCents: 3_138_446, currency: "INR" });
  });

  it("rejects a token whose amount was edited", async () => {
    const fake = provider();
    const token = tokenFrom((await fake.startCheckout(CHECKOUT)).checkoutUrl);
    const tampered = rewritePayload(token, (message) => message.replace("|22500|", "|1|"));

    expect(tampered).not.toBe(token);
    await expectRejected(fake.confirmCheckout({ token: tampered }), tampered);
  });

  it("rejects a token moved onto another business", async () => {
    const fake = provider();
    const token = tokenFrom((await fake.startCheckout(CHECKOUT)).checkoutUrl);
    const tampered = rewritePayload(token, (message) => message.replace(BUSINESS_ID, OTHER_BUSINESS_ID));

    await expectRejected(fake.confirmCheckout({ token: tampered }), tampered);
  });

  it("rejects a token whose currency was edited", async () => {
    const fake = provider();
    const token = tokenFrom((await fake.startCheckout(CHECKOUT)).checkoutUrl);
    const tampered = rewritePayload(token, (message) => message.replace("|USD", "|INR"));

    await expectRejected(fake.confirmCheckout({ token: tampered }), tampered);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = tokenFrom((await provider(OTHER_SECRET).startCheckout(CHECKOUT)).checkoutUrl);
    await expectRejected(provider().confirmCheckout({ token }), token);
  });

  it("rejects a token with a truncated or swapped signature", async () => {
    const fake = provider();
    const token = tokenFrom((await fake.startCheckout(CHECKOUT)).checkoutUrl);
    const other = tokenFrom((await fake.startCheckout(CHECKOUT)).checkoutUrl);
    const [version, payload] = token.split(".");
    const otherSignature = other.split(".")[2];

    await expectRejected(fake.confirmCheckout({ token: token.slice(0, -1) }), token);
    await expectRejected(fake.confirmCheckout({ token: `${version}.${payload}.${otherSignature}` }), token);
  });

  it.each([
    ["an empty object", {}],
    ["null", null],
    ["a bare string", "v2.abc.def"],
    ["a non-string token", { token: 42 }],
    ["an empty token", { token: "" }],
    ["a token with no dots", { token: "garbage" }],
    ["an unknown version", { token: `v9.${"a".repeat(10)}.${"b".repeat(43)}` }],
    ["an overlong token", { token: `v2.${"a".repeat(600)}.${"b".repeat(43)}` }],
  ])("rejects %s", async (_label, payload) => {
    await expect(provider().confirmCheckout(payload)).rejects.toBeInstanceOf(CheckoutVerificationError);
  });

  it("rejects well-signed contents that are not a valid checkout", async () => {
    // Signed with the right secret, so only the claim checks stand in the way.
    const { createHmac } = await import("node:crypto");
    const forge = (message: string): string =>
      `v2.${Buffer.from(message).toString("base64url")}.${createHmac("sha256", SECRET).update(message).digest("base64url")}`;
    const sub = `fake_sub_${"0".repeat(24)}`;
    const exp = String(EXPIRES_AT_SECONDS);

    for (const message of [
      `${sub}|${BUSINESS_ID}|22500|EUR|${exp}`,
      `${sub}|${BUSINESS_ID}|-5|USD|${exp}`,
      `${sub}|${BUSINESS_ID}|22.5|USD|${exp}`,
      `${sub}|not-a-uuid|22500|USD|${exp}`,
      `razorpay_sub|${BUSINESS_ID}|22500|USD|${exp}`,
      `${sub}|${BUSINESS_ID}|22500|USD|${exp}|extra`,
      `${sub}|${BUSINESS_ID}|22500|USD|${exp}.5`,
      `${sub}|${BUSINESS_ID}|22500|USD|-${exp}`,
      `${sub}|${BUSINESS_ID}|22500|USD|`,
      // The v1 shape, with no expiry at all, must not read as a link that never expires.
      `${sub}|${BUSINESS_ID}|22500|USD`,
    ]) {
      await expect(provider().confirmCheckout({ token: forge(message) })).rejects.toBeInstanceOf(
        CheckoutVerificationError,
      );
    }
  });

  it("refuses to start a checkout it could not sign honestly", async () => {
    const fake = provider();
    await expect(fake.startCheckout({ ...CHECKOUT, businessId: "not-a-uuid" })).rejects.toThrow(/UUID/);
    await expect(fake.startCheckout({ ...CHECKOUT, plan: { ...USD_PLAN, initialAmountCents: 0 } })).rejects.toThrow(
      RangeError,
    );
    await expect(
      fake.startCheckout({ ...CHECKOUT, existingProviderSubscriptionId: "sub_from_somewhere_else" }),
    ).rejects.toThrow(/fake provider subscription id/);
  });

  describe("expiry", () => {
    const HOUR_MS = 60 * 60 * 1000;

    async function tokenIssuedAt(issuedAt: Date): Promise<string> {
      return tokenFrom((await provider(SECRET, () => issuedAt).startCheckout(CHECKOUT)).checkoutUrl);
    }

    it("signs an expiry one hour after the link was issued", async () => {
      const token = await tokenIssuedAt(PAID_AT);
      const [, payload] = token.split(".");
      const message = Buffer.from(payload ?? "", "base64url").toString("utf8");
      expect(message.split("|").at(-1)).toBe(String(EXPIRES_AT_SECONDS));
    });

    it("confirms a link up to the last millisecond before it expires", async () => {
      const token = await tokenIssuedAt(PAID_AT);
      const lastMoment = new Date(PAID_AT.getTime() + HOUR_MS - 1);
      await expect(provider(SECRET, () => lastMoment).confirmCheckout({ token })).resolves.toMatchObject({
        paidAt: lastMoment,
      });
    });

    it.each([
      ["exactly at its expiry", 0],
      ["a minute after its expiry", 60_000],
      ["a day after its expiry", 24 * HOUR_MS],
    ])("rejects a link %s", async (_label, afterExpiryMs) => {
      const token = await tokenIssuedAt(PAID_AT);
      const later = new Date(PAID_AT.getTime() + HOUR_MS + afterExpiryMs);
      await expectRejected(provider(SECRET, () => later).confirmCheckout({ token }), token);
      await expect(provider(SECRET, () => later).confirmCheckout({ token })).rejects.toThrow(/expired/);
    });

    it("rejects a link whose expiry was pushed back by editing it", async () => {
      const token = await tokenIssuedAt(PAID_AT);
      const tampered = rewritePayload(token, (message) =>
        message.replace(`|${EXPIRES_AT_SECONDS}`, `|${EXPIRES_AT_SECONDS + 24 * 60 * 60}`),
      );
      expect(tampered).not.toBe(token);
      await expectRejected(provider().confirmCheckout({ token: tampered }), tampered);
    });

    it("honours a configured lifetime and refuses one under a second", async () => {
      const shortLived = createFakeBillingProvider({ secret: SECRET, now: () => PAID_AT, tokenTtlMs: 5_000 });
      const token = tokenFrom((await shortLived.startCheckout(CHECKOUT)).checkoutUrl);
      const sixSecondsOn = new Date(PAID_AT.getTime() + 6_000);
      await expectRejected(provider(SECRET, () => sixSecondsOn).confirmCheckout({ token }), token);

      expect(() => createFakeBillingProvider({ secret: SECRET, tokenTtlMs: 999 })).toThrow(RangeError);
      expect(() => createFakeBillingProvider({ secret: SECRET, tokenTtlMs: 1.5e3 + 0.5 })).toThrow(RangeError);
    });
  });

  it("says whether a refusal came after the signature checked out", async () => {
    const started = await provider().startCheckout(CHECKOUT);
    const token = tokenFrom(started.checkoutUrl);
    const refusal = async (fake: ReturnType<typeof provider>, value: string): Promise<CheckoutVerificationError> => {
      const error: unknown = await fake.confirmCheckout({ token: value }).then(
        () => null,
        (reason: unknown) => reason,
      );
      if (!(error instanceof CheckoutVerificationError)) throw new Error("expected a verification error");
      return error;
    };

    expect((await refusal(provider(OTHER_SECRET), token)).signatureVerified).toBe(false);
    expect((await refusal(provider(), "garbage")).signatureVerified).toBe(false);
    const later = new Date(PAID_AT.getTime() + 2 * 60 * 60 * 1000);
    expect((await refusal(provider(SECRET, () => later), token)).signatureVerified).toBe(true);
  });

  describe("cancelSubscription", () => {
    it("accepts one of its own subscription ids", async () => {
      const { providerSubscriptionId } = await provider().startCheckout(CHECKOUT);
      await expect(provider().cancelSubscription(providerSubscriptionId)).resolves.toBeUndefined();
    });

    it("keeps no state, so a link minted before cancelling still verifies until it expires", async () => {
      const started = await provider().startCheckout(CHECKOUT);
      await provider().cancelSubscription(started.providerSubscriptionId);
      await expect(provider().confirmCheckout({ token: tokenFrom(started.checkoutUrl) })).resolves.toMatchObject({
        providerSubscriptionId: started.providerSubscriptionId,
      });
    });

    it("resolves again for a subscription it already cancelled, as the provider contract says", async () => {
      const { providerSubscriptionId } = await provider().startCheckout(CHECKOUT);
      await provider().cancelSubscription(providerSubscriptionId);
      await expect(provider().cancelSubscription(providerSubscriptionId)).resolves.toBeUndefined();
    });

    it.each(["manual_sub_1", "sub_razorpay", "", `fake_sub_${"A".repeat(24)}`])("rejects %j", async (id) => {
      await expect(provider().cancelSubscription(id)).rejects.toThrow(/Not a fake provider subscription id/);
    });
  });

  describe("leaving", () => {
    it("accepts its own subscription id when ending at the period's end or changing plan", async () => {
      const { providerSubscriptionId } = await provider().startCheckout(CHECKOUT);
      await expect(provider().cancelSubscriptionAtPeriodEnd(providerSubscriptionId)).resolves.toBeUndefined();
      await expect(provider().changeSubscriptionPlanAtPeriodEnd(providerSubscriptionId, "plan_x")).resolves.toBeUndefined();
    });

    it("resolves again for a subscription already set to end, as the provider contract says", async () => {
      const { providerSubscriptionId } = await provider().startCheckout(CHECKOUT);
      await provider().cancelSubscriptionAtPeriodEnd(providerSubscriptionId);
      await expect(provider().cancelSubscriptionAtPeriodEnd(providerSubscriptionId)).resolves.toBeUndefined();
      await provider().cancelSubscription(providerSubscriptionId);
      await expect(provider().cancelSubscriptionAtPeriodEnd(providerSubscriptionId)).resolves.toBeUndefined();
    });

    it.each(["manual_sub_1", "sub_razorpay", ""])("rejects %j", async (id) => {
      await expect(provider().cancelSubscriptionAtPeriodEnd(id)).rejects.toThrow(/Not a fake provider subscription id/);
      await expect(provider().changeSubscriptionPlanAtPeriodEnd(id, "plan_x")).rejects.toThrow(/Not a fake provider subscription id/);
    });
  });

  it("refuses a secret shorter than 32 characters", () => {
    expect(() => createFakeBillingProvider({ secret: "x".repeat(31) })).toThrow(/at least 32 characters/);
  });
});

describe("a referral discount", () => {
  const PLAN = {
    id: "plan-row-id",
    code: "managed-usd-2026-10",
    name: "Managed Website",
    currency: "USD",
    tier: "managed",
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
    providerPlanId: null,
    taxRateBasisPoints: 0,
  } as const;
  const BUSINESS_ID = "11111111-1111-7111-8111-111111111111";

  function providerFor(): ReturnType<typeof createFakeBillingProvider> {
    return createFakeBillingProvider({ secret: "a".repeat(32) });
  }

  async function amountOf(discountAmountCents: number | undefined): Promise<number> {
    const provider = providerFor();
    const started = await provider.startCheckout({
      businessId: BUSINESS_ID,
      businessName: "Acme",
      email: "owner@acme.test",
      plan: PLAN,
      ...(discountAmountCents === undefined ? {} : { discountAmountCents }),
    });
    const token = new URL(started.checkoutUrl, "https://app.test").searchParams.get("token") ?? "";
    const confirmed = await provider.confirmCheckout({ token });
    return confirmed.amountCents;
  }

  it("charges the plan's full price when no code is applied", async () => {
    expect(await amountOf(undefined)).toBe(7_500);
  });

  it("charges the plan's price less the frozen discount", async () => {
    expect(await amountOf(1_125)).toBe(6_375);
  });

  it("refuses a discount that would leave nothing to charge", async () => {
    await expect(amountOf(7_500)).rejects.toThrow(RangeError);
  });

  it("refuses a discount that is not whole minor units", async () => {
    await expect(amountOf(10.5)).rejects.toThrow(RangeError);
  });
});

describe("fake charge payments", () => {
  function chargeTokenFrom(redirectTo: string | null): string {
    const url = new URL(redirectTo ?? "", "http://app.localhost");
    expect(url.pathname).toBe(FAKE_CHARGE_CONFIRM_PATH);
    const token = url.searchParams.get("token");
    if (token === null) throw new Error("charge payment URL carries no token");
    return token;
  }

  const CHARGE_ID = "0192f3c4-3333-7000-8000-000000000003";
  const CHARGE = {
    businessId: BUSINESS_ID,
    businessName: "Riverside Plumbing",
    email: "owner@riverside.test",
    chargeId: CHARGE_ID,
    description: "Extra change hours · 2 h",
    amountCents: 3_000,
    currency: "USD" as const,
  };

  it("sends the customer to the charge confirm page and confirms the payment it names", async () => {
    const fake = provider();
    const started = await fake.startChargePayment(CHARGE);

    expect(started.providerOrderId).toMatch(/^fake_order_[0-9a-f]{24}$/);
        const confirmed = await fake.confirmChargePayment({ token: chargeTokenFrom(started.redirectTo) });
    expect(confirmed).toEqual({
      providerOrderId: started.providerOrderId,
      providerPaymentId: `fake_pay_${started.providerOrderId.slice("fake_order_".length)}`,
      businessId: BUSINESS_ID,
      chargeId: CHARGE_ID,
      amountCents: 3_000,
      currency: "USD",
      paidAt: PAID_AT,
      method: FAKE_PAYMENT_METHOD,
    });
  });

  it("opens a new order on every attempt", async () => {
    const fake = provider();
    const first = await fake.startChargePayment(CHARGE);
    const second = await fake.startChargePayment(CHARGE);
    expect(second.providerOrderId).not.toBe(first.providerOrderId);
  });

  it("refuses a link signed with another secret, an expired one, and a plan checkout link", async () => {
    const started = await provider(OTHER_SECRET).startChargePayment(CHARGE);
    await expect(provider().confirmChargePayment({ token: chargeTokenFrom(started.redirectTo) })).rejects.toThrow(
      CheckoutVerificationError,
    );

    const mine = await provider().startChargePayment(CHARGE);
    const later = provider(SECRET, () => new Date(PAID_AT.getTime() + 2 * 60 * 60 * 1000));
    await expect(later.confirmChargePayment({ token: chargeTokenFrom(mine.redirectTo) })).rejects.toThrow(/expired/);

    const checkout = await provider().startCheckout(CHECKOUT);
    await expect(provider().confirmChargePayment({ token: tokenFrom(checkout.checkoutUrl) })).rejects.toThrow(/malformed/);
  });

  it("refuses an edited amount", async () => {
    const started = await provider().startChargePayment(CHARGE);
    const token = chargeTokenFrom(started.redirectTo);
    const [version, payload, signature] = token.split(".");
    const edited = Buffer.from(Buffer.from(payload ?? "", "base64url").toString("utf8").replace("|3000|", "|1|"), "utf8").toString("base64url");
    await expect(provider().confirmChargePayment({ token: `${version}.${edited}.${signature}` })).rejects.toThrow(/signature/);
  });
});

describe("fake add-on subscriptions", () => {
  const ADD_ON_SUBSCRIPTION_ID = "0192f3c4-4444-7000-8000-000000000004";
  const ADD_ON = {
    businessId: BUSINESS_ID,
    addOnSubscriptionId: ADD_ON_SUBSCRIPTION_ID,
    providerPlanId: null,
    amountCents: 590_000,
    currency: "INR" as const,
    startAt: null,
  };

  function addOnTokenFrom(checkoutUrl: string | null): string {
    const url = new URL(checkoutUrl ?? "", "http://app.localhost");
    expect(url.pathname).toBe(FAKE_ADD_ON_CONFIRM_PATH);
    const token = url.searchParams.get("token");
    if (token === null) throw new Error("add-on URL carries no token");
    return token;
  }

  it("sends the customer to the add-on confirm page and confirms the payment it names", async () => {
    const fake = provider();
    const started = await fake.startAddOnSubscription(ADD_ON);

    expect(FAKE_ADD_ON_CONFIRM_PATH).toBe("/add-ons/confirm");
    expect(started.providerSubscriptionId).toMatch(/^fake_sub_[0-9a-f]{24}$/);
    const confirmed = await fake.confirmAddOnPayment({ token: addOnTokenFrom(started.checkoutUrl) });

    expect(confirmed).toEqual({
      providerSubscriptionId: started.providerSubscriptionId,
      providerPaymentId: `fake_pay_${started.providerSubscriptionId.slice("fake_sub_".length)}`,
      addOnSubscriptionId: ADD_ON_SUBSCRIPTION_ID,
      businessId: BUSINESS_ID,
      amountCents: 590_000,
      currency: "INR",
      paidAt: PAID_AT,
      method: FAKE_PAYMENT_METHOD,
    });
  });

  it("opens a new subscription on every attempt", async () => {
    const fake = provider();
    const first = await fake.startAddOnSubscription(ADD_ON);
    const second = await fake.startAddOnSubscription(ADD_ON);
    expect(second.providerSubscriptionId).not.toBe(first.providerSubscriptionId);
  });

  it("confirms a kept subscription as authorised only, with no payment yet", async () => {
    const fake = provider();
    const startAt = new Date(PAID_AT.getTime() + 10 * 24 * 60 * 60 * 1000);
    const started = await fake.startAddOnSubscription({ ...ADD_ON, startAt });

    const confirmed = await fake.confirmAddOnPayment({ token: addOnTokenFrom(started.checkoutUrl) });
    expect(confirmed.providerPaymentId).toBeNull();
    expect(confirmed.paidAt).toEqual(PAID_AT);
  });

  it("refuses a link signed with another secret, an expired one, and an edited amount", async () => {
    const foreign = await provider(OTHER_SECRET).startAddOnSubscription(ADD_ON);
    const foreignToken = addOnTokenFrom(foreign.checkoutUrl);
    await expectRejected(provider().confirmAddOnPayment({ token: foreignToken }), foreignToken);

    const mine = await provider().startAddOnSubscription(ADD_ON);
    const later = provider(SECRET, () => new Date(PAID_AT.getTime() + 2 * 60 * 60 * 1000));
    await expect(later.confirmAddOnPayment({ token: addOnTokenFrom(mine.checkoutUrl) })).rejects.toThrow(/expired/);

    const token = addOnTokenFrom(mine.checkoutUrl);
    const tampered = rewritePayload(token, (message) => message.replace("|590000|", "|1|"));
    expect(tampered).not.toBe(token);
    await expectRejected(provider().confirmAddOnPayment({ token: tampered }), tampered);
  });

  it("refuses a link moved onto another business or another add-on", async () => {
    const token = addOnTokenFrom((await provider().startAddOnSubscription(ADD_ON)).checkoutUrl);
    const otherBusiness = rewritePayload(token, (message) => message.replace(BUSINESS_ID, OTHER_BUSINESS_ID));
    await expectRejected(provider().confirmAddOnPayment({ token: otherBusiness }), otherBusiness);
    const otherAddOn = rewritePayload(token, (message) => message.replace(ADD_ON_SUBSCRIPTION_ID, OTHER_BUSINESS_ID));
    await expectRejected(provider().confirmAddOnPayment({ token: otherAddOn }), otherAddOn);
  });

  it("never lets a plan, charge or add-on token stand in for another kind", async () => {
    const fake = provider();
    const checkout = await fake.startCheckout(CHECKOUT);
    const charge = await fake.startChargePayment({
      businessId: BUSINESS_ID,
      businessName: "Riverside Plumbing",
      email: "owner@riverside.test",
      chargeId: "0192f3c4-3333-7000-8000-000000000003",
      description: "Extra change hours",
      amountCents: 3_000,
      currency: "USD",
    });
    const addOn = await fake.startAddOnSubscription(ADD_ON);
    const planToken = tokenFrom(checkout.checkoutUrl);
    const chargeToken = new URL(charge.redirectTo ?? "", "http://app.localhost").searchParams.get("token") ?? "";
    const addOnToken = addOnTokenFrom(addOn.checkoutUrl);

    await expectRejected(fake.confirmAddOnPayment({ token: planToken }), planToken);
    await expectRejected(fake.confirmAddOnPayment({ token: chargeToken }), chargeToken);
    await expectRejected(fake.confirmCheckout({ token: addOnToken }), addOnToken);
    await expectRejected(fake.confirmChargePayment({ token: addOnToken }), addOnToken);
  });

  it("refuses an amount that is not a positive whole number of paise", async () => {
    await expect(provider().startAddOnSubscription({ ...ADD_ON, amountCents: 0 })).rejects.toThrow(RangeError);
    await expect(provider().startAddOnSubscription({ ...ADD_ON, amountCents: 10.5 })).rejects.toThrow(RangeError);
  });
});

describe("fake plans", () => {
  it("needs no plan at a provider", async () => {
    await expect(
      provider().createPlan({ currency: "USD", netMonthlyCents: 7_900, taxRateBasisPoints: 0, code: "care-usd-x" }),
    ).resolves.toEqual({ providerPlanId: null });
  });
});
