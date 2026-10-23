import { createHmac, timingSafeEqual } from "node:crypto";
import { billingCurrency, type BillingCurrency } from "@brandbasket/db";
import {
  CheckoutVerificationError,
  type BillingProvider,
  type ConfirmedAddOnPayment,
  type ConfirmedChargePayment,
  type ConfirmedPayment,
  type CreatePlanInput,
  type StartAddOnSubscriptionInput,
  type StartChargePaymentInput,
  type StartCheckoutInput,
  type StartedAddOnSubscription,
  type StartedChargePayment,
  type StartedCheckout,
} from "./provider";
import { chargedAmountCents } from "./tax";

/**
 * The subset of the `razorpay` SDK client this provider calls, so tests can pass a hand-written fake instead of
 * hitting the network. It is shaped around what this provider needs to call, not a 1:1 mirror of the installed
 * `razorpay` package's own types: the real `subscriptions.cancel(id, cancelAtCycleEnd?: boolean | number)` takes a
 * positional flag rather than the `{ cancel_at_cycle_end }` option object below, and the real `payments.fetch`
 * response types `amount` as `number | string` (that field's type is shared with request bodies, which also accept
 * a numeric string; the API itself always returns a number). A caller wiring up the real `new Razorpay({key_id,
 * key_secret})` client therefore needs a thin adapter — not the client's `subscriptions`/`payments` objects passed
 * straight through — to match this interface. See Task 8.
 */
export interface RazorpaySdkClient {
  readonly subscriptions: {
    create(input: {
      readonly plan_id: string;
      readonly total_count: number;
      readonly quantity: number;
      readonly customer_notify: boolean;
      readonly notes: Readonly<Record<string, string>>;
      /** Unix timestamp in whole seconds when the subscription starts and is first charged; absent starts it at once. */
      readonly start_at?: number;
    }): Promise<{ readonly id: string }>;
    cancel(subscriptionId: string, options: { readonly cancel_at_cycle_end: boolean }): Promise<unknown>;
    /** Moves the subscription to another plan; `schedule_change_at` says whether now or when the cycle ends. */
    update(
      subscriptionId: string,
      input: { readonly plan_id: string; readonly schedule_change_at: "now" | "cycle_end" },
    ): Promise<unknown>;
    /** The subscription as Razorpay holds it now. */
    fetch(subscriptionId: string): Promise<{ readonly id: string; readonly status: string }>;
  };
  readonly payments: {
    fetch(paymentId: string): Promise<{ readonly id: string; readonly amount: number; readonly currency: string; readonly created_at: number }>;
  };
  /** Monthly plans, one per price: a new price is always a new plan. */
  readonly plans: {
    create(input: {
      readonly period: "monthly";
      readonly interval: number;
      readonly item: { readonly name: string; readonly amount: number; readonly currency: string };
      readonly notes: Readonly<Record<string, string>>;
    }): Promise<{ readonly id: string }>;
  };
  /** One-time payments, used for charges (paid extras). */
  readonly orders: {
    create(input: {
      readonly amount: number;
      readonly currency: string;
      /** Our reference, shown in Razorpay's dashboard: the charge id (Razorpay allows up to 40 characters). */
      readonly receipt: string;
      readonly notes: Readonly<Record<string, string>>;
    }): Promise<{ readonly id: string }>;
  };
}

/** Razorpay's provider, with what only Razorpay offers: reading a subscription's current status back. */
export interface RazorpayBillingProvider extends BillingProvider {
  /**
   * The status Razorpay holds for the subscription now, in Razorpay's own words ("active", "halted"...). Razorpay does
   * not deliver webhooks in order, so a status event's own status may already be out of date by the time it arrives:
   * the webhook stores this instead.
   */
  fetchSubscriptionStatus(providerSubscriptionId: string): Promise<string>;
}

export interface RazorpayProviderOptions {
  readonly keySecret: string;
  readonly client: RazorpaySdkClient;
  /**
   * Razorpay's payment-verification signature only proves `paymentId|subscriptionId`; it says nothing about which
   * of our businesses that subscription belongs to. This resolves it from our own subscriptions table
   * (`findSubscriptionByProviderId` in packages/db), injected so this package stays free of a database dependency
   * of its own — see `apps/platform/lib/server/billing.ts` for what it is wired to. Returns null for a subscription
   * id this app has never recorded.
   */
  resolveBusinessId(providerSubscriptionId: string): Promise<string | null>;
  /** The business and charge a Razorpay order was opened for, from our charges table; null for an unknown order. */
  resolveChargeOrder(providerOrderId: string): Promise<{ readonly businessId: string; readonly chargeId: string } | null>;
}

/**
 * A subscription runs until cancelled, but Razorpay's API requires a bound. The bound is also the end date of the customer's
 * UPI AutoPay mandate, and UPI refuses a mandate longer than 30 years (the customer's UPI app answers
 * RECURRING_MANDATE_END_DATE_MAX_VALIDITY_BREACH): 1200 monthly cycles, 100 years, made every UPI payment fail. 120 monthly
 * cycles is 10 years, Razorpay's own default mandate length; a subscription that reaches it completes and is started again.
 */
const EFFECTIVELY_UNBOUNDED_CYCLES = 120;

/** Razorpay statuses of a subscription that will never charge again, so a cancel of it has nothing left to do. */
const STOPPED_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set(["cancelled", "completed", "expired"]);

/** Where the checkout-opening page lives; see Task 6. It reads the business's own open subscription from the
 * database rather than trusting a subscription id from the URL, so nothing here needs to carry one. */
export const RAZORPAY_PAY_PATH = "/billing/pay";

/** Where a kept plan's checkout opens: the signed-in account is closing, so it cannot use RAZORPAY_PAY_PATH. */
export const RAZORPAY_KEEP_PAY_PATH = "/restore-account/keep-plan";

/**
 * Rejects an oversized `razorpay_payment_id` / `razorpay_subscription_id` / `razorpay_signature` before it is used
 * for anything (hashing, a database lookup). Real Razorpay ids and hex signatures are well under 100 characters;
 * this is just a cheap ceiling against a large-payload allocation, mirroring `fake-provider.ts`'s `MAX_TOKEN_LENGTH`
 * guard on the same kind of untrusted input.
 */
const MAX_CONFIRM_FIELD_LENGTH = 200;

function isCurrency(value: string): value is BillingCurrency {
  return (billingCurrency.enumValues as readonly string[]).includes(value);
}

function signPaymentVerification(paymentId: string, subscriptionId: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${paymentId}|${subscriptionId}`, "utf8").digest();
}

function readField(record: Record<string, unknown>, name: string): string {
  const value = record[name];
  if (typeof value !== "string" || value === "") throw new CheckoutVerificationError(`${name} is missing`);
  if (value.length > MAX_CONFIRM_FIELD_LENGTH) throw new CheckoutVerificationError("a field is too long");
  return value;
}

function readConfirmPayload(payload: unknown): { readonly paymentId: string; readonly subscriptionId: string; readonly signature: string } {
  if (typeof payload !== "object" || payload === null) throw new CheckoutVerificationError("the payload is not an object");
  const record = payload as Record<string, unknown>;
  const paymentId = record.razorpay_payment_id;
  const subscriptionId = record.razorpay_subscription_id;
  const signature = record.razorpay_signature;
  if (typeof paymentId !== "string" || paymentId === "") throw new CheckoutVerificationError("razorpay_payment_id is missing");
  if (typeof subscriptionId !== "string" || subscriptionId === "") {
    throw new CheckoutVerificationError("razorpay_subscription_id is missing");
  }
  if (typeof signature !== "string" || signature === "") throw new CheckoutVerificationError("razorpay_signature is missing");
  if (
    paymentId.length > MAX_CONFIRM_FIELD_LENGTH ||
    subscriptionId.length > MAX_CONFIRM_FIELD_LENGTH ||
    signature.length > MAX_CONFIRM_FIELD_LENGTH
  ) {
    throw new CheckoutVerificationError("a field is too long");
  }
  return { paymentId, subscriptionId, signature };
}

/**
 * Razorpay Subscriptions, backing `BillingProvider`. The customer authorizes once through Razorpay's own Checkout
 * widget (see Task 6); Razorpay then auto-charges every month and reports both the first charge and every renewal
 * through the webhook (Task 8), which is this app's only path that ever activates a subscription from Razorpay.
 *
 * `confirmCheckout` is implemented in full below to satisfy the `BillingProvider` contract, but nothing in this
 * app's Razorpay checkout path calls it: the browser's `callback_url` redirect (Task 7) is a plain cross-site form
 * POST, which cannot be relied on to carry the customer's session (`SameSite=Lax` drops cookies on a cross-site POST
 * navigation) and must not be treated as authoritative regardless, since a client-relayed "I paid" claim proves
 * nothing on its own. The webhook is signed server-to-server and is the only trusted source. This method exists so
 * the type is honoured and so a future caller (admin tooling, or a synchronous best-effort confirmation before the
 * webhook lands) has a correct implementation to call.
 */
export function createRazorpayProvider(options: RazorpayProviderOptions): RazorpayBillingProvider {
  const { keySecret, client, resolveBusinessId, resolveChargeOrder } = options;

  /** The payment Razorpay reports, refused unless its currency and amount are ones this app can record. */
  async function fetchVerifiedPayment(paymentId: string): Promise<{
    readonly id: string;
    readonly amountCents: number;
    readonly currency: BillingCurrency;
    readonly paidAt: Date;
  }> {
    const payment = await client.payments.fetch(paymentId);
    if (!isCurrency(payment.currency)) {
      throw new CheckoutVerificationError("Razorpay reported a currency this app does not bill in", {
        signatureVerified: true,
      });
    }
    // Defense against the real SDK's `amount: number | string` type (see the RazorpaySdkClient doc comment)
    // ever letting something other than a non-negative integer minor-unit amount through.
    if (!Number.isSafeInteger(payment.amount) || payment.amount < 0) {
      throw new CheckoutVerificationError("Razorpay reported a payment amount that is not a whole number", {
        signatureVerified: true,
      });
    }
    return { id: payment.id, amountCents: payment.amount, currency: payment.currency, paidAt: new Date(payment.created_at * 1000) };
  }

  async function fetchSubscriptionStatus(providerSubscriptionId: string): Promise<string> {
    const subscription = await client.subscriptions.fetch(providerSubscriptionId);
    if (subscription.id !== providerSubscriptionId || subscription.status === "") {
      throw new Error(`Razorpay answered for ${providerSubscriptionId} with another subscription or no status`);
    }
    return subscription.status;
  }

  /**
   * Asks Razorpay to cancel, and counts a refusal as done when the subscription is already stopped. The provider
   * contract promises that a repeat cancel resolves, and account closure relies on it: a closure refused part way
   * through runs the same calls again, and a subscription cancelled the first time would otherwise refuse it for ever.
   *
   * Razorpay's refusal is read only through the subscription's status, never through the error's text, which is not a
   * stable contract. When the status cannot be read, or the subscription is still running, the original refusal is
   * thrown unchanged so the caller sees the real cause.
   *
   * A cancel at cycle end leaves the subscription "active" until the cycle ends, so a repeat of it cannot be told
   * apart from a live subscription here: the SDK's `has_scheduled_changes` is also true for a plan change booked for
   * the cycle end, and `end_at` is the subscription's planned last charge, not the cancel date. Neither is trusted.
   * Razorpay's reply to a repeated cycle-end cancel still has to be confirmed in test mode.
   */
  async function cancelOrConfirmStopped(providerSubscriptionId: string, cancelAtCycleEnd: boolean): Promise<void> {
    try {
      await client.subscriptions.cancel(providerSubscriptionId, { cancel_at_cycle_end: cancelAtCycleEnd });
    } catch (refusal: unknown) {
      let status: string;
      try {
        status = await fetchSubscriptionStatus(providerSubscriptionId);
      } catch {
        throw refusal;
      }
      if (!STOPPED_SUBSCRIPTION_STATUSES.has(status)) throw refusal;
    }
  }

  return {
    name: "razorpay",

    async startCheckout(input: StartCheckoutInput): Promise<StartedCheckout> {
      if (input.existingProviderSubscriptionId !== undefined) {
        return { providerSubscriptionId: input.existingProviderSubscriptionId, checkoutUrl: RAZORPAY_PAY_PATH };
      }
      // A discounted plan, when a code took something off; the base plan's own otherwise.
      const providerPlanId = input.providerPlanId ?? input.plan.providerPlanId;
      if (providerPlanId === null) {
        throw new Error(`Plan ${input.plan.code} has no Razorpay plan id. Run Task 2's script and migration first.`);
      }
      if (input.startAt !== undefined && !(input.startAt.getTime() > Date.now())) {
        throw new RangeError(`A subscription start date must be in the future, received ${input.startAt.toISOString()}`);
      }
      const created = await client.subscriptions.create({
        plan_id: providerPlanId,
        total_count: EFFECTIVELY_UNBOUNDED_CYCLES,
        quantity: 1,
        // We send our own emails (packages/email); Razorpay's would duplicate them.
        customer_notify: false,
        notes: { businessId: input.businessId },
        ...(input.startAt === undefined ? {} : { start_at: Math.floor(input.startAt.getTime() / 1000) }),
      });
      return { providerSubscriptionId: created.id, checkoutUrl: input.startAt === undefined ? RAZORPAY_PAY_PATH : RAZORPAY_KEEP_PAY_PATH };
    },

    async confirmCheckout(payload: unknown): Promise<ConfirmedPayment> {
      const { paymentId, subscriptionId, signature } = readConfirmPayload(payload);
      const expected = signPaymentVerification(paymentId, subscriptionId, keySecret);
      let given: Buffer;
      try {
        given = Buffer.from(signature, "hex");
      } catch {
        throw new CheckoutVerificationError("the signature is not valid hex");
      }
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        throw new CheckoutVerificationError("the signature does not match");
      }

      const businessId = await resolveBusinessId(subscriptionId);
      if (businessId === null) {
        throw new CheckoutVerificationError("the subscription is not one we have recorded", { signatureVerified: true });
      }

      const payment = await fetchVerifiedPayment(paymentId);
      return {
        providerSubscriptionId: subscriptionId,
        providerPaymentId: payment.id,
        businessId,
        amountCents: payment.amountCents,
        currency: payment.currency,
        paidAt: payment.paidAt,
      };
    },

    async cancelSubscription(providerSubscriptionId: string): Promise<void> {
      // Immediate, never at cycle end: every caller of BillingProvider.cancelSubscription today (see
      // provider-cancellation.ts) is replacing an *unpaid* checkout before any money has moved, so there is no paid
      // period to let run out.
      await cancelOrConfirmStopped(providerSubscriptionId, false);
    },

    async cancelSubscriptionAtPeriodEnd(providerSubscriptionId: string): Promise<void> {
      // At cycle end: the customer has paid for the current period, so it runs out and nothing more is taken.
      await cancelOrConfirmStopped(providerSubscriptionId, true);
    },

    fetchSubscriptionStatus,

    async changeSubscriptionPlanAtPeriodEnd(providerSubscriptionId: string, providerPlanId: string): Promise<void> {
      // At cycle end, never now: switching now would re-price the period already paid for.
      await client.subscriptions.update(providerSubscriptionId, { plan_id: providerPlanId, schedule_change_at: "cycle_end" });
    },

    /**
     * A Razorpay Plan charging the new monthly price with its tax on top, the same amount chargedAmountCents gives the
     * renewal check, so a renewal on it matches our plan row to the paisa.
     */
    async createPlan(input: CreatePlanInput): Promise<{ readonly providerPlanId: string | null }> {
      const amount = chargedAmountCents(input.netMonthlyCents, 0, input.taxRateBasisPoints);
      const created = await client.plans.create({
        period: "monthly",
        interval: 1,
        item: { name: input.itemName ?? `Subscription plan (${input.currency})`, amount, currency: input.currency },
        notes: { brandbasketPlanCode: input.code },
      });
      return { providerPlanId: created.id };
    },

    /**
     * One add-on's own subscription, on the Razorpay plan made for its exact amount. The app's pay page opens Checkout
     * on it, so there is no checkout address to return. A kept add-on starts on its old billing date through
     * `start_at`, which Razorpay takes in whole seconds.
     */
    async startAddOnSubscription(input: StartAddOnSubscriptionInput): Promise<StartedAddOnSubscription> {
      if (input.providerPlanId === null) {
        throw new Error(`Add-on subscription ${input.addOnSubscriptionId} has no Razorpay plan id.`);
      }
      if (input.startAt !== null) {
        if (Number.isNaN(input.startAt.getTime())) {
          throw new RangeError("An add-on start date must be a valid date");
        }
        if (input.startAt.getTime() <= Date.now()) {
          throw new RangeError(`An add-on start date must be in the future, received ${input.startAt.toISOString()}`);
        }
      }
      const created = await client.subscriptions.create({
        plan_id: input.providerPlanId,
        total_count: EFFECTIVELY_UNBOUNDED_CYCLES,
        quantity: 1,
        customer_notify: false,
        notes: { businessId: input.businessId, addOnSubscriptionId: input.addOnSubscriptionId },
        ...(input.startAt === null ? {} : { start_at: Math.floor(input.startAt.getTime() / 1000) }),
      });
      return { providerSubscriptionId: created.id, checkoutUrl: null };
    },

    /** Razorpay tells us an add-on was paid through its signed webhook, never through the browser's return. */
    async confirmAddOnPayment(): Promise<ConfirmedAddOnPayment> {
      throw new CheckoutVerificationError("The add-on is confirmed by Razorpay's webhook");
    },

    /**
     * A Razorpay Order for exactly the charge's amount. The page then opens Razorpay Checkout on it; the signed
     * `order.paid` webhook is what records the payment, matched back through the order id stored on the charge.
     */
    async startChargePayment(input: StartChargePaymentInput): Promise<StartedChargePayment> {
      if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
        throw new RangeError(`A charge amount must be a positive whole number of minor units, received ${input.amountCents}`);
      }
      const order = await client.orders.create({
        amount: input.amountCents,
        currency: input.currency,
        receipt: input.chargeId,
        notes: { businessId: input.businessId, chargeId: input.chargeId },
      });
      return { providerOrderId: order.id, redirectTo: null };
    },

    /** Razorpay's standard checkout signature is HMAC-SHA256 of `order_id|payment_id` with the key secret. */
    async confirmChargePayment(payload: unknown): Promise<ConfirmedChargePayment> {
      if (typeof payload !== "object" || payload === null) throw new CheckoutVerificationError("the payload is not an object");
      const record = payload as Record<string, unknown>;
      const paymentId = readField(record, "razorpay_payment_id");
      const orderId = readField(record, "razorpay_order_id");
      const signature = readField(record, "razorpay_signature");
      const expected = signPaymentVerification(orderId, paymentId, keySecret);
      const given = Buffer.from(signature, "hex");
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        throw new CheckoutVerificationError("the signature does not match");
      }

      const owner = await resolveChargeOrder(orderId);
      if (owner === null) {
        throw new CheckoutVerificationError("the order is not one we have recorded", { signatureVerified: true });
      }
      const payment = await fetchVerifiedPayment(paymentId);
      return {
        providerOrderId: orderId,
        providerPaymentId: payment.id,
        businessId: owner.businessId,
        chargeId: owner.chargeId,
        amountCents: payment.amountCents,
        currency: payment.currency,
        paidAt: payment.paidAt,
      };
    },
  };
}
