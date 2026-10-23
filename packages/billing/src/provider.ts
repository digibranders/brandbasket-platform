import type { BillingCurrency, BillingProviderName, PaymentMethodDetails, Plan } from "@brandbasket/db";

export interface StartCheckoutInput {
  readonly businessId: string;
  readonly businessName: string;
  readonly email: string;
  readonly plan: Plan;
  /**
   * An unpaid subscription already opened at this provider for this business. When given, the provider returns a
   * checkout for it instead of opening another one, so a customer who leaves and comes back is not charged twice.
   */
  readonly existingProviderSubscriptionId?: string;
  /**
   * The provider's plan to open the subscription on instead of `plan.providerPlanId`: a discounted plan made for the
   * code the customer applied (provider_discount_plans), priced exactly `discountAmountCents` lower. Absent at full
   * price, and for providers that need no plan of their own (the fake provider simply charges less).
   */
  readonly providerPlanId?: string;
  /**
   * What the applied referral code is worth against `plan`, in the plan's minor units, already computed and about
   * to be frozen on the subscription. Defaults to 0. Razorpay takes it through `providerPlanId`; the fake provider
   * subtracts it directly.
   */
  readonly discountAmountCents?: number;
  /**
   * What the add-ons taken at this checkout cost a month before tax, already about to be frozen on the subscription: the
   * checkout takes the plan's price plus this, less the discount. Defaults to 0. Razorpay takes it through
   * `providerPlanId` (a plan priced at the sum); the fake provider adds it directly.
   */
  readonly bundledAddOnNetCents?: number;
  /**
   * Keep my plan: the day the new subscription starts and is first charged, the end of the paid month it carries on from.
   * The customer authorises the mandate now and nothing is taken until then. Absent starts the subscription at once.
   */
  readonly startAt?: Date;
}

export interface StartedCheckout {
  readonly providerSubscriptionId: string;
  /** Where the customer completes payment. The fake provider returns a path on the dashboard itself. */
  readonly checkoutUrl: string;
}

export interface ConfirmedPayment {
  readonly providerSubscriptionId: string;
  readonly providerPaymentId: string;
  /** The business the checkout was started for. Callers must check it is the business confirming it. */
  readonly businessId: string;
  /** Integer minor units of `currency`. */
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly paidAt: Date;
  /** How the customer paid, when the provider says. Absent means unknown, not "no method". */
  readonly method?: PaymentMethodDetails | null;
}

/** One of the business's open charges (a paid extra), to be paid once, outside the monthly plan. */
export interface StartChargePaymentInput {
  readonly businessId: string;
  readonly businessName: string;
  readonly email: string;
  readonly chargeId: string;
  /** What the customer sees in the payment window: "Extra change hours · 2 h". */
  readonly description: string;
  /** What to take, tax included, in minor units of `currency`. The charge row's amount, never recomputed. */
  readonly amountCents: number;
  readonly currency: BillingCurrency;
}

/**
 * A payment attempt the provider opened for a charge. `providerOrderId` is stored on the charge, so the payment the
 * provider reports later can be matched back to it. `redirectTo` is where to send the customer to pay, or null when
 * the page opens the provider's own payment window itself (Razorpay Checkout, with `providerOrderId`).
 */
export interface StartedChargePayment {
  readonly providerOrderId: string;
  readonly redirectTo: string | null;
}

/** A verified payment for a charge, as the provider reports it. */
export interface ConfirmedChargePayment {
  readonly providerOrderId: string;
  readonly providerPaymentId: string;
  /** The business and charge the attempt was opened for. Callers must check the business is the one confirming. */
  readonly businessId: string;
  readonly chargeId: string;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly paidAt: Date;
  readonly method?: PaymentMethodDetails | null;
}

/** A new monthly price to put on sale at the provider. */
export interface CreatePlanInput {
  readonly currency: BillingCurrency;
  /** The monthly price before tax, in minor units. */
  readonly netMonthlyCents: number;
  readonly taxRateBasisPoints: number;
  /** Our plan code for the new version, recorded on the provider's plan for tracing. */
  readonly code: string;
  /** The provider plan's item name. Absent: "Subscription plan (CUR)". */
  readonly itemName?: string;
}

/** One monthly add-on purchase to open as its own subscription at the provider. */
export interface StartAddOnSubscriptionInput {
  readonly businessId: string;
  /** Our add_on_subscriptions id, sent as a note and carried by the fake checkout token. */
  readonly addOnSubscriptionId: string;
  /** The Razorpay plan for this amount; null with the fake provider. */
  readonly providerPlanId: string | null;
  /** What each charge takes, net plus GST, in paise. The fake provider charges this; Razorpay takes it from the plan. */
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  /** Keep it: the day the subscription starts and is first charged. Null starts it at once. */
  readonly startAt: Date | null;
}

export interface StartedAddOnSubscription {
  readonly providerSubscriptionId: string;
  /** Where to send the customer. Null for Razorpay: the app's own pay page opens Checkout. */
  readonly checkoutUrl: string | null;
}

/** A verified add-on checkout, as the fake provider reports it. Razorpay's live path records from the webhook. */
export interface ConfirmedAddOnPayment {
  readonly providerSubscriptionId: string;
  /** Null when a kept subscription was only authorised and is first charged later. */
  readonly providerPaymentId: string | null;
  readonly addOnSubscriptionId: string;
  readonly businessId: string;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly paidAt: Date;
  readonly method?: PaymentMethodDetails | null;
}

export interface BillingProvider {
  readonly name: BillingProviderName;
  startCheckout(input: StartCheckoutInput): Promise<StartedCheckout>;
  /**
   * Verifies whatever the provider handed back and returns the payment to record. Throws
   * `CheckoutVerificationError` if it does not check out.
   */
  confirmCheckout(payload: unknown): Promise<ConfirmedPayment>;
  /**
   * Cancels an unpaid subscription at the provider, so a checkout we have replaced (or that an admin's manual payment
   * made unnecessary) can no longer take money. Resolves once the provider has cancelled it, or if it was already
   * cancelled. Callers run it after their own database change has committed and log a failure rather than undoing
   * that change: our record is the one the access rule reads.
   */
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  /**
   * Ends a paid subscription with the period it has paid for: no further payment is taken, and the provider closes it
   * when the period runs out. Unlike `cancelSubscription` this is for a customer who is leaving. Resolves once the
   * provider has accepted it, or if it was already cancelled.
   */
  cancelSubscriptionAtPeriodEnd(providerSubscriptionId: string): Promise<void>;
  /**
   * Moves a running subscription to another of the provider's plans from its next renewal: the current period, already
   * paid, is untouched. Used to give a customer a discount from then on. A provider with no plans of its own (the fake
   * one) accepts it and does nothing.
   */
  changeSubscriptionPlanAtPeriodEnd(providerSubscriptionId: string, providerPlanId: string): Promise<void>;
  /** Opens a one-time payment for a charge. Never touches the business's subscription. */
  startChargePayment(input: StartChargePaymentInput): Promise<StartedChargePayment>;
  /**
   * Verifies what the provider handed back for a charge payment. Throws `CheckoutVerificationError` if it does not
   * check out. Like `confirmCheckout`, Razorpay's live path does not call it: its signed webhook is the only trusted
   * source of a paid charge.
   */
  confirmChargePayment(payload: unknown): Promise<ConfirmedChargePayment>;
  /**
   * Creates the provider's own plan for a new monthly price, charging the taxed amount every month, and returns its
   * id; null when the provider needs no plan of its own (the fake one). Existing plans are never changed.
   */
  createPlan(input: CreatePlanInput): Promise<{ readonly providerPlanId: string | null }>;
  /**
   * Opens a monthly subscription for one add-on, apart from the business's plan subscription. It starts at once, or on
   * `startAt` when the customer is keeping an add-on on its old billing date. Never touches the plan subscription.
   */
  startAddOnSubscription(input: StartAddOnSubscriptionInput): Promise<StartedAddOnSubscription>;
  /**
   * Verifies what the fake provider's checkout handed back for an add-on. Throws `CheckoutVerificationError` if it
   * does not check out. Razorpay's live path never calls it: its signed webhook is the only trusted source of an
   * add-on payment, so its version always throws.
   */
  confirmAddOnPayment(payload: unknown): Promise<ConfirmedAddOnPayment>;
}

/**
 * A confirmation that could not be verified. The message never includes the payload, because the payload is the
 * credential: echoing it into a log or a page would hand it to whoever reads that.
 */
export class CheckoutVerificationError extends Error {
  /**
   * True when the provider's signature checked out and the confirmation was refused for something else (it had
   * expired, say). Such a refusal is worth logging; a bad signature is anyone's guess and is not.
   */
  readonly signatureVerified: boolean;

  constructor(reason: string, options: { readonly signatureVerified?: boolean } = {}) {
    super(`The payment confirmation could not be verified: ${reason}.`);
    this.name = "CheckoutVerificationError";
    this.signatureVerified = options.signatureVerified ?? false;
  }
}
