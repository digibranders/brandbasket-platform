import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, notInArray, or, sql, sum, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { bundledNetCents, findLiveBundledAddOns, insertBundledAddOns, removeBundledAddOnsOf, type NewBundledAddOn } from "./bundled-add-ons";
import { markLeadPaidForBusiness } from "./leads";
import { isUuid } from "./tenant";
import {
  addOnPayments,
  addOnSubscriptions,
  businesses,
  charges,
  payments,
  plans,
  subscriptions,
  taxInvoices,
  UNAPPLIED_PAYMENT_REASONS,
  type BillingCurrency,
  type BillingProviderName,
  type BundledAddOn,
  type ChargeKind,
  type PaymentAttentionReason,
  type PaymentInvoiceBasis,
  type PaymentKind,
  type PaymentStatus,
  type PlanTier,
  type SignupChoice,
  type SubscriptionStatus,
} from "../schema";

/** Reads run both on their own and inside a tenant-scoped transaction, so they accept either runner. */
type Runner = Database | ScopedTransaction;

/** `amount_cents` is an integer column, so nothing larger than a signed 32-bit value can be stored. */
const MAX_MINOR_UNITS = 2_147_483_647;

/**
 * Money is integer minor units everywhere: cents for USD, paise for INR. A float would round silently, so an
 * amount that is not a whole, non-negative, storable number is refused before it reaches Postgres.
 */
export class InvalidAmountError extends Error {
  constructor(amountCents: number) {
    super(`Payment amounts must be whole minor units (cents or paise) between 0 and ${MAX_MINOR_UNITS}, received ${amountCents}.`);
    this.name = "InvalidAmountError";
  }
}

export class SubscriptionNotFoundError extends Error {
  constructor(subscriptionId: string, businessId: string) {
    super(`No subscription ${subscriptionId} for business ${businessId}.`);
    this.name = "SubscriptionNotFoundError";
  }
}

/** The payment insert conflicted but the conflicting row could not be read back, which should be impossible. */
export class PaymentReadBackError extends Error {
  constructor(provider: BillingProviderName, providerPaymentId: string) {
    super(`Payment ${provider}/${providerPaymentId} conflicted on insert but could not be read back.`);
    this.name = "PaymentReadBackError";
  }
}

/** The business a billing operation names does not exist (or is not visible to the connection). */
export class BillingBusinessNotFoundError extends Error {
  constructor(businessId: string) {
    super(`No business ${businessId} to bill.`);
    this.name = "BillingBusinessNotFoundError";
  }
}

/**
 * A stale checkout was to be cancelled, but it was no longer an unpaid subscription of that business: it was paid,
 * cancelled or replaced in the meantime. Nothing was changed.
 */
export class StaleSubscriptionChangedError extends Error {
  constructor(subscriptionId: string) {
    super(`Subscription ${subscriptionId} changed (it was paid for, or is not this business's), so it was not cancelled.`);
    this.name = "StaleSubscriptionChangedError";
  }
}

/** A manual payment's audit details are missing or malformed. Nothing was written. */
export class InvalidManualPaymentError extends Error {
  constructor(reason: string) {
    super(`A manual payment could not be recorded: ${reason}.`);
    this.name = "InvalidManualPaymentError";
  }
}

const MAX_MANUAL_REFERENCE_LENGTH = 100;
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Shared with charges.ts, which records charge payments into the same table. Not re-exported from the package. */
export function assertMinorUnits(amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents < 0 || amountCents > MAX_MINOR_UNITS) {
    throw new InvalidAmountError(amountCents);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive whole number, received ${value}`);
}

export interface Plan {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly currency: BillingCurrency;
  /** Which plan this price is for: the website-only Care, or Premium (docs/superpowers/specs/2026-10-07-care-plan-design.md). */
  readonly tier: PlanTier;
  /** Paid up front, covering the first `initialTermMonths` months. Integer minor units. */
  readonly initialAmountCents: number;
  readonly initialTermMonths: number;
  readonly recurringAmountCents: number;
  readonly includedPublishesPerMonth: number;
  readonly extraPublishAmountCents: number;
  /** Free hours of changes, once per customer; then `extraHourAmountCents` an hour. */
  readonly includedChangeHours: number;
  readonly extraHourAmountCents: number;
  /** Blog posts included; more are sold in blocks of `blogPostBlockSize` at `extraBlogPostsAmountCents` a block. */
  readonly includedBlogPosts: number;
  readonly blogPostBlockSize: number;
  readonly extraBlogPostsAmountCents: number;
  readonly providerPlanId: string | null;
  /** Tax added on top of the amounts above, in basis points. See chargedAmountCents in packages/billing. */
  readonly taxRateBasisPoints: number;
}

export const PLAN_COLUMNS = {
  id: plans.id,
  code: plans.code,
  name: plans.name,
  currency: plans.currency,
  tier: plans.tier,
  initialAmountCents: plans.initialAmountCents,
  initialTermMonths: plans.initialTermMonths,
  recurringAmountCents: plans.recurringAmountCents,
  includedPublishesPerMonth: plans.includedPublishesPerMonth,
  includedChangeHours: plans.includedChangeHours,
  extraHourAmountCents: plans.extraHourAmountCents,
  includedBlogPosts: plans.includedBlogPosts,
  blogPostBlockSize: plans.blogPostBlockSize,
  extraBlogPostsAmountCents: plans.extraBlogPostsAmountCents,
  extraPublishAmountCents: plans.extraPublishAmountCents,
  providerPlanId: plans.providerPlanId,
  taxRateBasisPoints: plans.taxRateBasisPoints,
} as const;

export interface Subscription {
  readonly id: string;
  readonly businessId: string;
  readonly planId: string;
  readonly provider: BillingProviderName;
  readonly providerSubscriptionId: string;
  readonly providerStatus: string | null;
  /** The referral code this subscription was opened with, or null at the full price. */
  readonly referralCodeId: string | null;
  /** What that code is worth against this subscription's plan, frozen when the checkout opened. */
  readonly discountAmountCents: number;
  /** The paid months that code's discount still has to run; null for no limit. */
  readonly discountMonthsLeft: number | null;
  /** What the code takes off from the next renewal when that differs from `discountAmountCents`; null when nothing is waiting. */
  readonly nextDiscountAmountCents: number | null;
  /** The part of `discountAmountCents` that is a stay offer rather than a code's; zero when none was taken. */
  readonly retentionDiscountCents: number;
  /** The plan the next renewal will bill, once the customer has paid to move up (plan_upgrades); null otherwise. */
  readonly pendingPlanId: string | null;
  readonly pendingDiscountAmountCents: number;
  /** What the add-ons taken at the first checkout cost a month, GST included (bundled_add_ons, summed), billed within this subscription. */
  readonly bundledAddOnNetCents: number;
  /** What those add-ons cost once the ones the customer asked to remove have stopped, from the next renewal; null when none are waiting. */
  readonly pendingBundledAddOnNetCents: number | null;
  /** Ad credit a month for a package bought together at the first checkout, frozen then; 0 for none. Never invoiced. */
  readonly adCreditCents: number;
  readonly status: SubscriptionStatus;
  readonly activatedAt: Date | null;
  readonly commitmentEndsAt: Date | null;
  /** The end of the period the customer has paid for: the single input to the access rule. */
  readonly paidThroughAt: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly cancelRequestedAt: Date | null;
  readonly cancelledAt: Date | null;
  /** Keep my plan: the subscription this one carries on from, or null. */
  readonly continuesId: string | null;
  /** Keep my plan: the day this one is first charged, or null. */
  readonly startAt: Date | null;
  readonly createdAt: Date;
}

const SUBSCRIPTION_COLUMNS = {
  id: subscriptions.id,
  businessId: subscriptions.businessId,
  planId: subscriptions.planId,
  provider: subscriptions.provider,
  providerSubscriptionId: subscriptions.providerSubscriptionId,
  providerStatus: subscriptions.providerStatus,
  referralCodeId: subscriptions.referralCodeId,
  discountAmountCents: subscriptions.discountAmountCents,
  discountMonthsLeft: subscriptions.discountMonthsLeft,
  nextDiscountAmountCents: subscriptions.nextDiscountAmountCents,
  retentionDiscountCents: subscriptions.retentionDiscountCents,
  pendingPlanId: subscriptions.pendingPlanId,
  pendingDiscountAmountCents: subscriptions.pendingDiscountAmountCents,
  bundledAddOnNetCents: subscriptions.bundledAddOnNetCents,
  pendingBundledAddOnNetCents: subscriptions.pendingBundledAddOnNetCents,
  adCreditCents: subscriptions.adCreditCents,
  status: subscriptions.status,
  activatedAt: subscriptions.activatedAt,
  commitmentEndsAt: subscriptions.commitmentEndsAt,
  paidThroughAt: subscriptions.paidThroughAt,
  currentPeriodEnd: subscriptions.currentPeriodEnd,
  cancelRequestedAt: subscriptions.cancelRequestedAt,
  cancelledAt: subscriptions.cancelledAt,
  continuesId: subscriptions.continuesId,
  startAt: subscriptions.startAt,
  createdAt: subscriptions.createdAt,
} as const;

export interface Payment {
  readonly id: string;
  readonly businessId: string;
  readonly subscriptionId: string | null;
  readonly provider: BillingProviderName;
  readonly providerPaymentId: string;
  readonly kind: PaymentKind;
  /** Integer minor units of `currency`. */
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly status: PaymentStatus;
  readonly paidAt: Date | null;
  readonly failureReason: string | null;
  /** Set when staff need to look at this payment. See paymentAttentionReason in the schema. */
  readonly attentionReason: PaymentAttentionReason | null;
  readonly attentionResolvedAt: Date | null;
  readonly createdAt: Date;
}

export const PAYMENT_COLUMNS = {
  id: payments.id,
  businessId: payments.businessId,
  subscriptionId: payments.subscriptionId,
  provider: payments.provider,
  providerPaymentId: payments.providerPaymentId,
  kind: payments.kind,
  amountCents: payments.amountCents,
  currency: payments.currency,
  status: payments.status,
  paidAt: payments.paidAt,
  failureReason: payments.failureReason,
  attentionReason: payments.attentionReason,
  attentionResolvedAt: payments.attentionResolvedAt,
  createdAt: payments.createdAt,
} as const;

/**
 * How a payment was made, as the provider reported it (Razorpay's payment entity). Only what a merchant is shown:
 * the card network, its last four digits, whether it is credit or debit, and the issuing bank, or the UPI address.
 */
export interface PaymentMethodDetails {
  /** Razorpay's payment method: "card", "upi", "netbanking", "wallet", "emandate", or a newer one. */
  readonly method: string;
  readonly cardNetwork: string | null;
  /** Exactly four digits, or null. The database refuses anything else. */
  readonly cardLast4: string | null;
  readonly cardType: string | null;
  readonly cardIssuer: string | null;
  readonly upiVpa: string | null;
}

const PAYMENT_METHOD_COLUMNS = {
  method: payments.method,
  cardNetwork: payments.cardNetwork,
  cardLast4: payments.cardLast4,
  cardType: payments.cardType,
  cardIssuer: payments.cardIssuer,
  upiVpa: payments.upiVpa,
} as const;

/** The insert values for a payment's method, or nothing when the provider did not say how it was paid. */
export function paymentMethodValues(method: PaymentMethodDetails | null | undefined): Partial<PaymentMethodDetails> {
  if (method === null || method === undefined) return {};
  return {
    method: method.method,
    cardNetwork: method.cardNetwork,
    cardLast4: method.cardLast4,
    cardType: method.cardType,
    cardIssuer: method.cardIssuer,
    upiVpa: method.upiVpa,
  };
}

/** True for an attention reason whose payment bought nothing. */
export function isUnappliedReason(reason: PaymentAttentionReason | null): boolean {
  return reason !== null && (UNAPPLIED_PAYMENT_REASONS as readonly PaymentAttentionReason[]).includes(reason);
}

/** A payment that was applied: it has no attention reason, or its reason came after it applied. */
export function paymentWasApplied(): SQL {
  const applied = or(
    isNull(payments.attentionReason),
    notInArray(payments.attentionReason, [...UNAPPLIED_PAYMENT_REASONS]),
  );
  if (applied === undefined) throw new Error("Could not build the applied-payment condition");
  return applied;
}

/**
 * The plan a sign-up choice buys. Brandbasket sells one plan, so every choice (Managed Website, a free listing, an
 * account from a setup link) is priced as Managed Website. The choice stays a parameter so callers read the same.
 */
export function planTierForSignupChoice(_choice: SignupChoice | null): PlanTier {
  return "managed";
}

/**
 * The live plan for a currency and tier. A partial unique index allows only one active plan per currency and tier, so
 * this can never be ambiguous; it returns null when that currency has no plan of that tier on sale yet, which callers
 * must handle rather than charging a guessed price.
 */
export async function findActivePlan(db: Runner, currency: BillingCurrency, tier: PlanTier): Promise<Plan | null> {
  const rows = await db
    .select(PLAN_COLUMNS)
    .from(plans)
    .where(and(eq(plans.currency, currency), eq(plans.tier, tier), eq(plans.active, true)))
    .limit(1);
  return rows[0] ?? null;
}

/** A plan by id, retired or not: a subscription keeps the price it was sold at. */
export async function findPlanById(db: Runner, planId: string): Promise<Plan | null> {
  if (!isUuid(planId)) return null;
  const rows = await db.select(PLAN_COLUMNS).from(plans).where(eq(plans.id, planId)).limit(1);
  return rows[0] ?? null;
}

/**
 * A kept plan's successor (Keep my plan) whose first charge has not been recorded. It waits beside the subscription it
 * continues, which stays the one billing state, access and the console read until the new mandate has charged for the
 * first time. A condition for any read that picks a business's current subscription.
 */
export function subscriptionWaitingToStart(): SQL {
  return sql`(${subscriptions.continuesId} is not null and ${subscriptions.activatedAt} is null)`;
}

function notWaitingToStart(): SQL {
  return sql`not ${subscriptionWaitingToStart()}`;
}

/**
 * The business's newest subscription, whatever its status. This is the one billing state is read from: a
 * subscription cancelled inside its paid period still grants access until `paidThroughAt`, so it must not vanish
 * from view the moment it is cancelled. `subscriptions_one_live_per_business_idx` allows at most one subscription
 * that is not cancelled, and a new one is only ever opened once the older one is cancelled, so the newest row is the
 * live one whenever a live one exists. Ties on `created_at` (rows written in one transaction) fall to the id, which
 * is a UUIDv7 and so ordered by creation. A kept plan's successor that has not been charged yet is skipped (it waits beside
 * the paid month it carries on from).
 */
export async function findLatestSubscriptionForBusiness(db: Runner, businessId: string): Promise<Subscription | null> {
  if (!isUuid(businessId)) return null;
  const rows = await db
    .select(SUBSCRIPTION_COLUMNS)
    .from(subscriptions)
    .where(and(eq(subscriptions.businessId, businessId), notWaitingToStart()))
    .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The business's newest subscription that a payment ever activated, or null when none was. A reactivation checkout that was
 * left unpaid or dropped is newer than the lapsed subscription it replaced but never billed anything, so this is the one that
 * says what the business was paying for. Staff connection, or the owner's own scope.
 */
export async function findLatestActivatedSubscriptionForBusiness(db: Runner, businessId: string): Promise<Subscription | null> {
  if (!isUuid(businessId)) return null;
  const rows = await db
    .select(SUBSCRIPTION_COLUMNS)
    .from(subscriptions)
    .where(and(eq(subscriptions.businessId, businessId), isNotNull(subscriptions.activatedAt)))
    .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Ad credit that goes with a subscription that ends: zero for one a payment activated, which has been earning it, and untouched
 * for one that never was activated. An unpaid reactivation checkout carries the lapsed subscription's credit forward, and
 * dropping it must not lose that credit, so the next reactivation can still read it.
 */
const adCreditAfterEnding = sql`case when ${subscriptions.activatedAt} is not null then 0 else ${subscriptions.adCreditCents} end`;

/**
 * Ad credit of a subscription the provider has cancelled. Zero only when the customer asked for it (`cancel_requested_at`): the
 * credit then ends with the paid month they kept it for. A cancel they did not ask for (a revoked mandate) is a lapse, which a
 * reactivation restores with its credit, so the row keeps what it has. Neither is listed once its status is `cancelled`.
 */
const adCreditAfterProviderCancel = sql`case when ${subscriptions.activatedAt} is not null and ${subscriptions.cancelRequestedAt} is not null then 0 else ${subscriptions.adCreditCents} end`;

export interface NewSubscription {
  readonly businessId: string;
  readonly planId: string;
  readonly provider: BillingProviderName;
  readonly providerSubscriptionId: string;
  /** Exactly as the provider reported it, when it reported anything at all. */
  readonly providerStatus?: string | null;
  /** The referral code the checkout was opened with. Defaults to none. */
  readonly referralCodeId?: string | null;
  /**
   * What that code is worth against the plan, in the plan's minor units. Frozen here and never recomputed, so a
   * code edited or retired later cannot change what this customer is charged. Must be 0 when there is no code,
   * and greater than 0 when there is: `subscriptions_discount_check` refuses anything else.
   */
  readonly discountAmountCents?: number;
  /** The paid months the code's discount runs for, copied from the code (referral_codes.discount_months). Null or absent for no limit. */
  readonly discountMonthsLeft?: number | null;
  /** What the add-ons taken at this checkout cost a month, GST included: the sum of their prices. Defaults to 0. */
  readonly bundledAddOnNetCents?: number;
  /** Ad credit a month earned by the package bought at this checkout (adCreditCentsFor in @brandbasket/shared). Defaults to 0. */
  readonly adCreditCents?: number;
  /** Keep my plan only: the stay-offer part of the discount, the discount waiting for the next renewal, and the commitment, all carried over. */
  readonly retentionDiscountCents?: number;
  readonly nextDiscountAmountCents?: number | null;
  readonly commitmentEndsAt?: Date | null;
  /** Keep my plan only: the subscription this one carries on from and the day it is first charged. Both or neither. */
  readonly continuesId?: string | null;
  readonly startAt?: Date | null;
}

/**
 * Opens an `incomplete` subscription: the customer has been sent to the provider but no money has arrived, so it
 * grants no access. RETURNING needs SELECT privilege, which only the staff role has on this table.
 */
export async function insertSubscription(db: Runner, input: NewSubscription): Promise<Subscription> {
  const rows = await db
    .insert(subscriptions)
    .values({
      businessId: input.businessId,
      planId: input.planId,
      provider: input.provider,
      providerSubscriptionId: input.providerSubscriptionId,
      providerStatus: input.providerStatus ?? null,
      referralCodeId: input.referralCodeId ?? null,
      discountAmountCents: input.discountAmountCents ?? 0,
      discountMonthsLeft: input.discountMonthsLeft ?? null,
      bundledAddOnNetCents: input.bundledAddOnNetCents ?? 0,
      adCreditCents: input.adCreditCents ?? 0,
      retentionDiscountCents: input.retentionDiscountCents ?? 0,
      nextDiscountAmountCents: input.nextDiscountAmountCents ?? null,
      commitmentEndsAt: input.commitmentEndsAt ?? null,
      continuesId: input.continuesId ?? null,
      startAt: input.startAt ?? null,
      status: "incomplete",
    })
    .returning(SUBSCRIPTION_COLUMNS);
  const subscription = rows[0];
  if (subscription === undefined) throw new Error("Subscription insert returned no row");
  return subscription;
}

/** A subscription by our id, as the provider is billing it (no pending move up applied), whatever its status. Staff connection. */
export async function findSubscriptionById(db: Runner, subscriptionId: string): Promise<Subscription | null> {
  if (!isUuid(subscriptionId)) return null;
  const rows = await db.select(SUBSCRIPTION_COLUMNS).from(subscriptions).where(eq(subscriptions.id, subscriptionId)).limit(1);
  return rows[0] ?? null;
}

/** Records what a code will take off from the next renewal. Null when it is the amount the subscription takes already. Staff connection, under the billing lock. */
export async function setNextDiscount(tx: ScopedTransaction, input: { readonly subscriptionId: string; readonly discountCents: number; readonly now: Date }): Promise<void> {
  if (!isUuid(input.subscriptionId)) return;
  await tx
    .update(subscriptions)
    .set({
      nextDiscountAmountCents: sql`case when ${input.discountCents}::integer = ${subscriptions.discountAmountCents} then null else ${input.discountCents}::integer end`,
      updatedAt: input.now,
    })
    .where(eq(subscriptions.id, input.subscriptionId));
}

/** What a payment did to the subscription's discount. */
export interface DiscountSettlement {
  /** The paid months the discount still has to run after this payment; null for no limit. */
  readonly monthsLeft: number | null;
  /** This payment was the last of the discount's months: the provider must be moved to the amount without it. */
  readonly ended: boolean;
}

/**
 * The one place a payment's effect on a code's discount is worked out, for the first payment, a renewal, a reactivation and
 * the console's manual payment. Only a payment taken with a code discount counts a month off `discount_months_left` (null
 * stays null, so months offline cost nothing); the last month sets the amount for the next renewal to 0. A payment taken at the
 * discount that was waiting (`adoptsNewDiscount`) makes it the subscription's own and clears the wait first, so a month that
 * ends the discount in the same payment still leaves 0 waiting. Staff connection, in the payment's transaction under the billing lock.
 */
export async function settleDiscountAfterPayment(
  tx: ScopedTransaction,
  input: { readonly subscriptionId: string; readonly discountTakenCents: number; readonly adoptsNewDiscount: boolean; readonly now: Date },
): Promise<DiscountSettlement> {
  const rows = await tx
    .select({
      discountAmountCents: subscriptions.discountAmountCents,
      retentionDiscountCents: subscriptions.retentionDiscountCents,
      discountMonthsLeft: subscriptions.discountMonthsLeft,
      nextDiscountAmountCents: subscriptions.nextDiscountAmountCents,
    })
    .from(subscriptions)
    .where(eq(subscriptions.id, input.subscriptionId))
    .limit(1)
    .for("update");
  const row = rows[0];
  if (row === undefined) throw new Error(`Subscription ${input.subscriptionId} was not found to settle its discount.`);
  let { discountAmountCents, retentionDiscountCents, nextDiscountAmountCents } = row;
  if (input.adoptsNewDiscount) {
    discountAmountCents = input.discountTakenCents;
    retentionDiscountCents = 0;
    nextDiscountAmountCents = null;
  }
  let monthsLeft = row.discountMonthsLeft;
  let ended = false;
  if (input.discountTakenCents > 0 && monthsLeft !== null && monthsLeft > 0) {
    monthsLeft -= 1;
    ended = monthsLeft === 0;
    if (ended) nextDiscountAmountCents = 0;
  }
  const unchanged =
    discountAmountCents === row.discountAmountCents &&
    retentionDiscountCents === row.retentionDiscountCents &&
    monthsLeft === row.discountMonthsLeft &&
    nextDiscountAmountCents === row.nextDiscountAmountCents;
  if (!unchanged) {
    await tx
      .update(subscriptions)
      .set({ discountAmountCents, retentionDiscountCents, discountMonthsLeft: monthsLeft, nextDiscountAmountCents, updatedAt: input.now })
      .where(eq(subscriptions.id, input.subscriptionId));
  }
  return { monthsLeft, ended };
}

/** A subscription by the provider's own id, whatever its status. Staff connection. */
export async function findSubscriptionByProviderId(
  db: Runner,
  provider: BillingProviderName,
  providerSubscriptionId: string,
): Promise<Subscription | null> {
  const rows = await db
    .select(SUBSCRIPTION_COLUMNS)
    .from(subscriptions)
    .where(
      and(eq(subscriptions.provider, provider), eq(subscriptions.providerSubscriptionId, providerSubscriptionId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Takes a row lock on the business for the rest of the transaction. Every billing change for one business (starting
 * a checkout, confirming a payment, recording a manual one) takes it first, so two of them for the same business run
 * one after the other and each sees what the previous one committed. Other businesses are not held up.
 *
 * It is FOR NO KEY UPDATE rather than FOR UPDATE: the customer's saves and uploads insert rows that reference the
 * business, which takes FOR KEY SHARE on it, and that must not wait behind a payment. Billing never changes the
 * business's key, so the weaker lock is all the serialisation it needs.
 */
export async function lockBusinessForBilling(tx: ScopedTransaction, businessId: string): Promise<void> {
  if (!isUuid(businessId)) throw new BillingBusinessNotFoundError(businessId);
  const rows = await tx
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1)
    .for("no key update");
  if (rows[0] === undefined) throw new BillingBusinessNotFoundError(businessId);
}

export interface StaleSubscriptionCancellation {
  readonly subscriptionId: string;
  readonly businessId: string;
  readonly now: Date;
}

/**
 * Ends the subscription a new checkout replaces: an unpaid checkout, or a live one that no longer grants access (a
 * lapsed or halted plan, which reactivation replaces). The guard is in the UPDATE itself, so a payment that lands in
 * between, moving paid_through_at into the future, makes it match nothing and throw StaleSubscriptionChangedError.
 * Only the status, cancelledAt and ad credit change: the old row's dates and payments stay as history.
 */
export async function cancelStaleSubscription(db: Runner, input: StaleSubscriptionCancellation): Promise<void> {
  const rows = await db
    .update(subscriptions)
    // The ad credit of a subscription that was paid goes with it: a replacement is opened with the credit the caller read
    // before this, and the ads team reads it from live rows. An unpaid checkout never earned any and keeps what it carries.
    .set({ status: "cancelled", cancelledAt: input.now, adCreditCents: adCreditAfterEnding })
    .where(
      and(
        eq(subscriptions.id, input.subscriptionId),
        eq(subscriptions.businessId, input.businessId),
        // Exactly the rows hasBillingAccess (packages/billing) grants nothing to, except a cancelled one, which is final.
        or(
          inArray(subscriptions.status, ["incomplete", "inactive"]),
          and(
            inArray(subscriptions.status, ["active", "past_due"]),
            or(isNull(subscriptions.paidThroughAt), lte(subscriptions.paidThroughAt, input.now)),
          ),
        ),
      ),
    )
    .returning({ id: subscriptions.id });
  if (rows.length === 0) throw new StaleSubscriptionChangedError(input.subscriptionId);
  // The lines billed inside it end with it. A reactivation restores them as new lines on the subscription that replaces it
  // (reactivationBasketOf), read before this ran.
  await removeBundledAddOnsOf(db, { subscriptionId: input.subscriptionId, now: input.now });
}

export interface CheckoutSubscription extends Omit<NewSubscription, "bundledAddOnNetCents"> {
  /** The unpaid subscription this one replaces, or null when the business has no live subscription. */
  readonly replacing: string | null;
  readonly now: Date;
  /**
   * The services taken at this checkout, the website included, each at its package price: the plan row costs nothing, so
   * these are what the provider bills. Their net prices are summed onto the subscription.
   */
  readonly bundledAddOns?: readonly NewBundledAddOn[];
}

/**
 * Opens the subscription a new checkout pays for, ending the one it replaces first (cancelStaleSubscription). Both
 * happen in one transaction (a savepoint when `db` is already a transaction): the one-live-subscription index would
 * refuse the new row while the old one is live, and an ended subscription with no replacement must not be left behind.
 */
export async function openCheckoutSubscription(db: Runner, input: CheckoutSubscription): Promise<Subscription> {
  return db.transaction(async (tx) => {
    if (input.replacing !== null) {
      await cancelStaleSubscription(tx, {
        subscriptionId: input.replacing,
        businessId: input.businessId,
        now: input.now,
      });
    }
    const bundledAddOns = input.bundledAddOns ?? [];
    const subscription = await insertSubscription(tx, { ...input, bundledAddOnNetCents: bundledNetCents(bundledAddOns) });
    await insertBundledAddOns(tx, { businessId: input.businessId, subscriptionId: subscription.id, items: bundledAddOns });
    return subscription;
  });
}

/** The unpaid or authorised-but-uncharged successor of a kept plan, or null. At most one exists (subscriptions_one_successor_idx). */
export async function findWaitingSuccessor(db: Runner, subscriptionId: string): Promise<Subscription | null> {
  if (!isUuid(subscriptionId)) return null;
  const rows = await db
    .select(SUBSCRIPTION_COLUMNS)
    .from(subscriptions)
    .where(and(eq(subscriptions.continuesId, subscriptionId), ne(subscriptions.status, "cancelled"), subscriptionWaitingToStart()))
    .limit(1);
  return rows[0] ?? null;
}

export interface KeptSubscription {
  /** The subscription the client cancelled at the provider and is keeping. Its plan, discount, credit and commitment carry over. */
  readonly continues: Subscription;
  readonly provider: BillingProviderName;
  readonly providerSubscriptionId: string;
  /** The services as they will be billed, each at its current package price. */
  readonly bundledAddOns: readonly NewBundledAddOn[];
  readonly adCreditCents: number;
  /** An earlier keep checkout that was never authorised, ended here so only one exists. */
  readonly replacing: string | null;
  readonly now: Date;
}

/**
 * Opens the successor of a plan the client is keeping: an `incomplete` subscription for the same plan, discount, code
 * months and commitment, starting on the old one's `paid_through_at` (docs/plans/18-platform-owner-decisions.md, Keep my
 * plan). The old subscription stays the business's current one until this is charged. Throws for a subscription with no
 * paid month to start from.
 */
export async function openKeptSubscription(db: Runner, input: KeptSubscription): Promise<Subscription> {
  const { continues } = input;
  if (continues.paidThroughAt === null) throw new Error(`Subscription ${continues.id} has no paid month to continue from`);
  const startAt = continues.paidThroughAt;
  return db.transaction(async (tx) => {
    if (input.replacing !== null) {
      await cancelStaleSubscription(tx, { subscriptionId: input.replacing, businessId: continues.businessId, now: input.now });
    }
    const subscription = await insertSubscription(tx, {
      businessId: continues.businessId,
      planId: continues.planId,
      provider: input.provider,
      providerSubscriptionId: input.providerSubscriptionId,
      referralCodeId: continues.referralCodeId,
      // The discount the next renewal would have taken (a code repriced on a changed basket, or ended), now its own.
      discountAmountCents: continues.nextDiscountAmountCents ?? continues.discountAmountCents,
      discountMonthsLeft: continues.discountMonthsLeft,
      nextDiscountAmountCents: null,
      retentionDiscountCents: continues.nextDiscountAmountCents === null ? continues.retentionDiscountCents : 0,
      commitmentEndsAt: continues.commitmentEndsAt,
      bundledAddOnNetCents: bundledNetCents(input.bundledAddOns),
      adCreditCents: input.adCreditCents,
      continuesId: continues.id,
      startAt,
    });
    await insertBundledAddOns(tx, { businessId: continues.businessId, subscriptionId: subscription.id, items: input.bundledAddOns });
    return subscription;
  });
}

export interface ConfirmedKeep {
  readonly businessId: string;
  /** The subscription that was kept: its cancel request is cleared, so the plan shows as running. */
  readonly continuesId: string;
}

/**
 * Records that the provider holds the new mandate of a kept plan: the successor is `active` (authorised, not yet
 * charged) and the subscription it continues no longer carries the client's cancel request. Idempotent: null when the
 * subscription is not a successor still waiting to start (already charged, cancelled, or not a kept plan). The caller holds
 * the business's billing lock. Staff connection.
 */
export async function confirmKeptSubscription(db: Runner, input: { readonly subscriptionId: string; readonly now: Date }): Promise<ConfirmedKeep | null> {
  if (!isUuid(input.subscriptionId)) return null;
  const confirmed = await db
    .update(subscriptions)
    .set({ status: "active", lastSyncedAt: input.now })
    .where(and(eq(subscriptions.id, input.subscriptionId), inArray(subscriptions.status, ["incomplete", "active"]), subscriptionWaitingToStart()))
    .returning({ businessId: subscriptions.businessId, continuesId: subscriptions.continuesId });
  const row = confirmed[0];
  if (row === undefined || row.continuesId === null) return null;
  await db.update(subscriptions).set({ cancelRequestedAt: null }).where(eq(subscriptions.id, row.continuesId));
  return { businessId: row.businessId, continuesId: row.continuesId };
}

export async function findPaymentByProviderId(
  db: Runner,
  provider: BillingProviderName,
  providerPaymentId: string,
): Promise<Payment | null> {
  const rows = await db
    .select(PAYMENT_COLUMNS)
    .from(payments)
    .where(and(eq(payments.provider, provider), eq(payments.providerPaymentId, providerPaymentId)))
    .limit(1);
  return rows[0] ?? null;
}

export interface PaymentActivation {
  readonly businessId: string;
  readonly subscriptionId: string;
  readonly provider: BillingProviderName;
  /** The provider's own id for this payment. It is what makes recording idempotent. */
  readonly providerPaymentId: string;
  readonly kind: PaymentKind;
  /** Integer minor units of `currency`: cents for USD, paise for INR. */
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly paidAt: Date;
  /** The end of the period this payment buys. Nothing else decides whether the customer has access. */
  readonly paidThroughAt: Date;
  readonly commitmentEndsAt: Date;
  readonly currentPeriodEnd: Date;
  readonly providerStatus?: string | null;
  /** Required when `provider` is `manual`, refused otherwise: the audit trail of a payment recorded by hand. */
  readonly manual?: ManualPaymentRecord;
  /** How the customer paid, when the provider said. Shown on the billing page's payment-method card. */
  readonly method?: PaymentMethodDetails | null;
}

export interface ManualPaymentRecord {
  /** The staff user who recorded the payment. */
  readonly recordedByStaffId: string;
  /** The bank or payment reference, trimmed, 1 to 100 characters. */
  readonly reference: string;
  /** The calendar date the money arrived, `YYYY-MM-DD`. */
  readonly receivedOn: string;
}

export interface ManualColumns {
  readonly recordedByStaffId?: string;
  readonly manualReference?: string;
  readonly receivedOn?: string;
}

export function manualColumns(provider: BillingProviderName, manual: ManualPaymentRecord | undefined): ManualColumns {
  if (provider !== "manual") {
    if (manual !== undefined) throw new InvalidManualPaymentError(`a ${provider} payment cannot carry manual details`);
    return {};
  }
  if (manual === undefined) throw new InvalidManualPaymentError("who recorded it, the reference and the date are required");
  const reference = manual.reference.trim();
  if (reference === "" || reference.length > MAX_MANUAL_REFERENCE_LENGTH || reference !== manual.reference) {
    throw new InvalidManualPaymentError(`the reference must be 1 to ${MAX_MANUAL_REFERENCE_LENGTH} characters with no surrounding spaces`);
  }
  if (manual.recordedByStaffId.trim() === "") throw new InvalidManualPaymentError("the recording staff user is missing");
  if (!CALENDAR_DATE_PATTERN.test(manual.receivedOn)) {
    throw new InvalidManualPaymentError("the received date must be YYYY-MM-DD");
  }
  return { recordedByStaffId: manual.recordedByStaffId, manualReference: reference, receivedOn: manual.receivedOn };
}

export interface RecordedActivation {
  readonly payment: Payment;
  /**
   * True when this provider payment had already been recorded: nothing was written a second time and no date on
   * the subscription moved.
   */
  readonly alreadyRecorded: boolean;
  /** How many leads this payment moved to `paid`. Only a first (`initial`) payment moves any. */
  readonly leadsMarkedPaid: number;
}

/**
 * Records a captured payment and opens the subscription it paid for, in one transaction: both rows change or
 * neither does. Money recorded against a subscription that stayed locked, or a subscription opened without the
 * payment that bought it, are the two outcomes this exists to make impossible.
 *
 * It is idempotent on `(provider, providerPaymentId)`, because a provider will deliver the same payment twice
 * sooner or later and a webhook or a refreshed confirm page must not double-count the money or push the
 * paid-through date out by another term for free. The second delivery writes nothing and reports
 * `alreadyRecorded: true`.
 *
 * A first (`initial`) payment also marks the business's lead paid, in the same transaction, so the sales pipeline
 * can never show a paying customer as unpaid or the other way round.
 *
 * Staff connection only. Pass a transaction to make this part of a larger one: it then runs in a savepoint, and
 * everything still commits or rolls back with the caller's transaction.
 *
 * This records the payment and nothing else: it issues no tax invoice. Application code calls the wrapped versions in
 * `@brandbasket/shared` (activateFirstPayment, activateRenewalPayment, activateReactivationPayment), which invoice the
 * payment in the same transaction. The raw function is for those wrappers and for tests.
 */
export async function recordPaymentAndActivate(db: Runner, input: PaymentActivation): Promise<RecordedActivation> {
  assertMinorUnits(input.amountCents);
  const manual = manualColumns(input.provider, input.manual);
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(payments)
      .values({
        businessId: input.businessId,
        subscriptionId: input.subscriptionId,
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        kind: input.kind,
        amountCents: input.amountCents,
        currency: input.currency,
        status: "captured",
        paidAt: input.paidAt,
        ...manual,
        ...paymentMethodValues(input.method),
      })
      .onConflictDoNothing({ target: [payments.provider, payments.providerPaymentId] })
      .returning(PAYMENT_COLUMNS);

    const payment = inserted[0];
    if (payment === undefined) {
      // A concurrent delivery holds the conflicting row until it commits, so by the time the insert returns
      // nothing the other transaction has finished and this read sees its row.
      const existing = await findPaymentByProviderId(tx, input.provider, input.providerPaymentId);
      if (existing === null) throw new PaymentReadBackError(input.provider, input.providerPaymentId);
      return { payment: existing, alreadyRecorded: true, leadsMarkedPaid: 0 };
    }

    // Locking the subscription keeps two payments arriving at once from interleaving their date updates.
    const found = await tx
      .select({ activatedAt: subscriptions.activatedAt })
      .from(subscriptions)
      .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.businessId, input.businessId)))
      .limit(1)
      .for("update");
    const subscription = found[0];
    // Rolls the payment back with it: a subscription that is missing, or belongs to another business, means the
    // caller got the money wrong, and half of this must not survive.
    if (subscription === undefined) throw new SubscriptionNotFoundError(input.subscriptionId, input.businessId);

    await tx
      .update(subscriptions)
      .set({
        status: "active",
        // "When the first payment was confirmed": a renewal must not overwrite it.
        activatedAt: subscription.activatedAt ?? input.paidAt,
        commitmentEndsAt: input.commitmentEndsAt,
        paidThroughAt: input.paidThroughAt,
        currentPeriodEnd: input.currentPeriodEnd,
        lastSyncedAt: input.paidAt,
        ...(input.providerStatus === undefined ? {} : { providerStatus: input.providerStatus }),
      })
      .where(eq(subscriptions.id, input.subscriptionId));

    const leadsMarkedPaid = input.kind === "initial" ? await markLeadPaidForBusiness(tx, input.businessId) : 0;
    return { payment, alreadyRecorded: false, leadsMarkedPaid };
  });
}

export interface SubscriptionStatusSync {
  readonly provider: BillingProviderName;
  readonly providerSubscriptionId: string;
  readonly status: SubscriptionStatus;
  /** Exactly as the provider reported it (e.g. "halted"), for support and reconciliation. */
  readonly providerStatus: string;
  readonly now: Date;
}

/**
 * Mirrors a provider lifecycle event that carries no payment (authorized, pending, halted, cancelled, completed)
 * onto our own status. Never touches paidThroughAt or commitmentEndsAt — those move only when a payment is
 * recorded (recordPaymentAndActivate); this is deliberately the one place that can move a subscription to
 * `inactive` (and so remove access, via hasBillingAccess's no-grace-period rule) without any money changing hands.
 *
 * Returns false when no subscription matches (an event for one we have not recorded, or a stale retry after the row
 * changed provider), so the caller can log it rather than silently doing nothing. Staff connection only.
 */
export async function updateSubscriptionProviderStatus(db: Runner, input: SubscriptionStatusSync): Promise<boolean> {
  // `cancelled` is terminal: subscriptions_one_live_per_business_idx is a partial unique index on businessId WHERE
  // status <> 'cancelled', so flipping an old, already-cancelled row to any other status could collide with a
  // newer live subscription of the same business. A stray or out-of-order webhook for a superseded
  // providerSubscriptionId must not be able to do that, so once a row is cancelled only another `cancelled` event
  // (the idempotent-replay case, which never changes index membership) is allowed to match it.
  const guard = input.status === "cancelled" ? undefined : ne(subscriptions.status, "cancelled");
  const rows = await db
    .update(subscriptions)
    // A single atomic UPDATE with `coalesce` for cancelledAt, rather than the SELECT-FOR-UPDATE-then-JS-`??`
    // fallback pattern recordPaymentAndActivate uses elsewhere in this file: no lock is needed here because the
    // atomic UPDATE is already race-free on its own.
    .set({
      status: input.status,
      providerStatus: input.providerStatus,
      lastSyncedAt: input.now,
      ...(input.status === "cancelled" ? { cancelledAt: sql`coalesce(${subscriptions.cancelledAt}, ${input.now})`, adCreditCents: adCreditAfterProviderCancel } : {}),
    })
    .where(
      and(
        eq(subscriptions.provider, input.provider),
        eq(subscriptions.providerSubscriptionId, input.providerSubscriptionId),
        guard,
      ),
    )
    .returning({ id: subscriptions.id });
  return rows.length > 0;
}

export type UnappliedPaymentReason = (typeof UNAPPLIED_PAYMENT_REASONS)[number];

export interface UnappliedPayment {
  readonly businessId: string;
  /** The subscription the provider says it paid, even though it can no longer be paid. */
  readonly subscriptionId: string;
  readonly provider: BillingProviderName;
  readonly providerPaymentId: string;
  readonly kind: PaymentKind;
  /** What the provider says it took, in integer minor units of `currency`. */
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly paidAt: Date;
  readonly reason: UnappliedPaymentReason;
  readonly now: Date;
  /** How the customer paid, when the provider said. */
  readonly method?: PaymentMethodDetails | null;
}

export interface RecordedUnappliedPayment {
  readonly payment: Payment;
  /** True when this provider payment had already been recorded; nothing was written. */
  readonly alreadyRecorded: boolean;
}

/**
 * Records money the provider took that buys nothing: a payment for a checkout we had replaced or cancelled, a
 * duplicate for a business that already has access, or an amount that is not the plan's. The payment is stored as
 * captured, flagged for staff, and nothing else changes: no subscription dates move and no lead is marked paid.
 * Idempotent on `(provider, providerPaymentId)`, like recordPaymentAndActivate. Staff connection only.
 *
 * Money that buys nothing gets no tax invoice, so unlike the other payment recorders this one has no invoicing wrapper:
 * application code calls it directly.
 */
export async function recordUnappliedPayment(db: Runner, input: UnappliedPayment): Promise<RecordedUnappliedPayment> {
  assertMinorUnits(input.amountCents);
  if (!isUnappliedReason(input.reason)) throw new Error(`Not a reason for an unapplied payment: ${input.reason}`);
  const inserted = await db
    .insert(payments)
    .values({
      businessId: input.businessId,
      subscriptionId: input.subscriptionId,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      kind: input.kind,
      amountCents: input.amountCents,
      currency: input.currency,
      status: "captured",
      paidAt: input.paidAt,
      attentionReason: input.reason,
      attentionRaisedAt: input.now,
      ...paymentMethodValues(input.method),
    })
    .onConflictDoNothing({ target: [payments.provider, payments.providerPaymentId] })
    .returning(PAYMENT_COLUMNS);
  const payment = inserted[0];
  if (payment !== undefined) return { payment, alreadyRecorded: false };
  const existing = await findPaymentByProviderId(db, input.provider, input.providerPaymentId);
  if (existing === null) throw new PaymentReadBackError(input.provider, input.providerPaymentId);
  return { payment: existing, alreadyRecorded: true };
}

export interface PaymentAttentionFlag {
  readonly paymentId: string;
  readonly businessId: string;
  /**
   * Only the reasons of a payment that did apply: `submission_failed`, `upgrade_provider_pending` and
   * `add_on_provider_pending`. An unapplied payment is flagged when it is recorded, by recordUnappliedPayment.
   */
  readonly reason: Extract<PaymentAttentionReason, "submission_failed" | "upgrade_provider_pending" | "add_on_provider_pending">;
  readonly now: Date;
}

/**
 * Flags an applied payment for staff, when something after it went wrong. A payment already flagged keeps its
 * first reason. Returns whether the flag was set. Staff connection only.
 */
export async function flagPaymentForAttention(db: Runner, input: PaymentAttentionFlag): Promise<boolean> {
  if (!isUuid(input.paymentId)) return false;
  const rows = await db
    .update(payments)
    .set({ attentionReason: input.reason, attentionRaisedAt: input.now })
    .where(
      and(
        eq(payments.id, input.paymentId),
        eq(payments.businessId, input.businessId),
        isNull(payments.attentionReason),
      ),
    )
    .returning({ id: payments.id });
  return rows.length > 0;
}

/**
 * Flags a subscription for staff when a change to its monthly amount went wrong and no payment of that change exists to
 * flag: a service dropped (no payment) or added for less than the smallest charge. The flag lands on the subscription's
 * latest captured payment that carries none, so it shows in the console's list of payments needing attention with the same
 * reason; one already flagged and not yet dealt with for the same reason is left as it is. Returns whether a flag was set.
 * Staff connection only.
 */
export async function flagSubscriptionForAttention(
  db: Runner,
  input: { readonly subscriptionId: string; readonly businessId: string; readonly reason: PaymentAttentionFlag["reason"]; readonly now: Date },
): Promise<boolean> {
  if (!isUuid(input.subscriptionId) || !isUuid(input.businessId)) return false;
  const captured = await db
    .select({ id: payments.id, attentionReason: payments.attentionReason, attentionResolvedAt: payments.attentionResolvedAt })
    .from(payments)
    .where(and(eq(payments.subscriptionId, input.subscriptionId), eq(payments.businessId, input.businessId), eq(payments.status, "captured")))
    .orderBy(desc(payments.createdAt), desc(payments.id));
  if (captured.some((payment) => payment.attentionReason === input.reason && payment.attentionResolvedAt === null)) return false;
  const target = captured.find((payment) => payment.attentionReason === null);
  if (target === undefined) return false;
  return flagPaymentForAttention(db, { paymentId: target.id, businessId: input.businessId, reason: input.reason, now: input.now });
}

export interface PaymentAttentionResolution {
  readonly paymentId: string;
  /** The business the payment must belong to; a payment of any other business is left alone. */
  readonly businessId: string;
  readonly staffUserId: string;
  readonly now: Date;
}

/**
 * Marks a flagged payment as dealt with (refunded at the provider, or applied by hand). Only a payment that is
 * flagged and not yet resolved matches, so resolving twice changes nothing; returns whether it did. Staff only.
 */
export async function resolvePaymentAttention(db: Runner, input: PaymentAttentionResolution): Promise<boolean> {
  if (!isUuid(input.paymentId) || !isUuid(input.businessId)) return false;
  if (input.staffUserId.trim() === "") throw new Error("Resolving a payment needs the staff user who did it");
  const rows = await db
    .update(payments)
    .set({ attentionResolvedAt: input.now, attentionResolvedByStaffId: input.staffUserId })
    .where(
      and(
        eq(payments.id, input.paymentId),
        eq(payments.businessId, input.businessId),
        isNotNull(payments.attentionReason),
        isNull(payments.attentionResolvedAt),
      ),
    )
    .returning({ id: payments.id });
  return rows.length > 0;
}

export interface PaymentNeedingAttention {
  readonly paymentId: string;
  readonly businessId: string;
  readonly businessName: string;
  readonly reason: PaymentAttentionReason;
  readonly raisedAt: Date;
  readonly provider: BillingProviderName;
  readonly providerPaymentId: string;
  /** Integer minor units of `currency`. */
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly paidAt: Date | null;
}

/**
 * Flagged payments nobody has dealt with yet, oldest first so the longest-waiting customer is at the top. Pass a
 * business id to list one business's. Staff connection only: it reads across tenants.
 */
export async function listPaymentsNeedingAttention(
  db: Database,
  options: { readonly businessId?: string; readonly limit: number },
): Promise<PaymentNeedingAttention[]> {
  assertPositiveInteger(options.limit, "limit");
  if (options.businessId !== undefined && !isUuid(options.businessId)) return [];
  const rows = await db
    .select({
      paymentId: payments.id,
      businessId: payments.businessId,
      businessName: businesses.name,
      reason: payments.attentionReason,
      raisedAt: payments.attentionRaisedAt,
      provider: payments.provider,
      providerPaymentId: payments.providerPaymentId,
      amountCents: payments.amountCents,
      currency: payments.currency,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .innerJoin(businesses, eq(businesses.id, payments.businessId))
    .where(
      and(
        isNotNull(payments.attentionReason),
        isNull(payments.attentionResolvedAt),
        options.businessId === undefined ? undefined : eq(payments.businessId, options.businessId),
      ),
    )
    .orderBy(asc(payments.attentionRaisedAt), asc(payments.id))
    .limit(options.limit);
  return rows.flatMap(({ reason, raisedAt, ...row }) =>
    // The check constraint makes both present together; the filter above makes them present.
    reason === null || raisedAt === null ? [] : [{ ...row, reason, raisedAt }],
  );
}

/** The receipts list: newest first, tie-broken by id so the order is stable between reads. */
export async function listPaymentsForBusiness(db: Runner, businessId: string, limit: number): Promise<Payment[]> {
  assertPositiveInteger(limit, "limit");
  return db
    .select(PAYMENT_COLUMNS)
    .from(payments)
    .where(eq(payments.businessId, businessId))
    .orderBy(desc(payments.createdAt), desc(payments.id))
    .limit(limit);
}

export interface Receipt extends Payment {
  /**
   * The paid-up-front term of the plan this payment's subscription was sold on, in months: what a first payment
   * bought, even if the plan on sale has changed since. Null when the payment has no subscription.
   */
  readonly initialTermMonths: number | null;
  /** The name of the plan this payment's subscription was sold on. Null when the payment has no subscription. */
  readonly planName: string | null;
  /** The tax rate of what was bought (the charge's, the add-on's, or the plan's), so a receipt can split the tax out
   * of what was taken. Null when none is known. */
  readonly taxRateBasisPoints: number | null;
  /** For a paid extra (kind `charge`), what it was for: "Extra change hours". Null for everything else. */
  readonly chargeDescription: string | null;
  /** For a paid extra, how many units it was for. Null for everything else. */
  readonly chargeQuantity: number | null;
  /** For a paid extra, what kind it was. Null for everything else. */
  readonly chargeKind: ChargeKind | null;
  /** For a paid extra, when it was added: the month it belongs to on the bill. Null for everything else. */
  readonly chargeCreatedAt: Date | null;
  /**
   * The payment's place among everything the business has been charged, oldest first, starting at 1. It numbers
   * the receipt, and does not change as later payments arrive.
   */
  readonly sequence: number;
  /** The payment's tax invoice, when it has one. Its number replaces the receipt's title on the bill. */
  readonly taxInvoiceId: string | null;
  readonly taxInvoiceNumber: string | null;
  /** For an add-on payment, the catalogue id of what was bought ("digital-growth"). Null for everything else. */
  readonly addOnId: string | null;
  /** What a plan payment was billed as (its services and discounts), for a receipt that lists them. Null when not kept. */
  readonly invoiceBasis: PaymentInvoiceBasis | null;
}

/** The receipts list with the term each payment bought. Newest first. Works through row-level security. */
export async function listReceiptsForBusiness(db: Runner, businessId: string, limit: number): Promise<Receipt[]> {
  assertPositiveInteger(limit, "limit");
  // Numbered over every payment the business has, not just the page being read, so a receipt keeps its number.
  const numbered = db
    .select({
      id: payments.id,
      sequence: sql<number>`row_number() over (order by ${payments.createdAt}, ${payments.id})`
        .mapWith(Number)
        .as("sequence"),
    })
    .from(payments)
    .where(eq(payments.businessId, businessId))
    .as("numbered");
  return db
    .select({
      ...PAYMENT_COLUMNS,
      initialTermMonths: plans.initialTermMonths,
      planName: plans.name,
      taxRateBasisPoints: sql<number | null>`coalesce(${charges.taxRateBasisPoints}, ${addOnSubscriptions.taxRateBasisPoints}, ${plans.taxRateBasisPoints})`,
      chargeDescription: charges.description,
      chargeQuantity: charges.quantity,
      chargeKind: charges.kind,
      chargeCreatedAt: charges.createdAt,
      sequence: numbered.sequence,
      taxInvoiceId: taxInvoices.id,
      taxInvoiceNumber: taxInvoices.number,
      addOnId: addOnSubscriptions.addOn,
      invoiceBasis: payments.invoiceBasis,
    })
    .from(payments)
    .innerJoin(numbered, eq(numbered.id, payments.id))
    .leftJoin(subscriptions, eq(subscriptions.id, payments.subscriptionId))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .leftJoin(charges, eq(charges.paymentId, payments.id))
    .leftJoin(taxInvoices, eq(taxInvoices.paymentId, payments.id))
    .leftJoin(addOnPayments, eq(addOnPayments.paymentId, payments.id))
    .leftJoin(addOnSubscriptions, eq(addOnSubscriptions.id, addOnPayments.addOnSubscriptionId))
    .where(eq(payments.businessId, businessId))
    .orderBy(desc(payments.createdAt), desc(payments.id))
    .limit(limit);
}

/**
 * How the business last paid: the method of its newest captured payment that recorded one, or null. Payments
 * recorded by hand, or before 0047, have none and are skipped. Works through row-level security.
 */
export async function findLatestPaymentMethod(db: Runner, businessId: string): Promise<PaymentMethodDetails | null> {
  const rows = await db
    .select(PAYMENT_METHOD_COLUMNS)
    .from(payments)
    .where(and(eq(payments.businessId, businessId), eq(payments.status, "captured"), isNotNull(payments.method)))
    .orderBy(desc(payments.createdAt), desc(payments.id))
    .limit(1);
  const row = rows[0];
  if (row === undefined || row.method === null) return null;
  return { ...row, method: row.method };
}

/** How the business pays now, for Billing's Payment method section: the fields paymentLabel reads, and when. */
export interface CurrentPaymentMethod {
  readonly provider: Payment["provider"];
  /** A paid extra is a one-off, so its method says nothing about how the plan renews. */
  readonly kind: Payment["kind"];
  readonly method: string | null;
  readonly cardNetwork: string | null;
  readonly cardType: string | null;
  /** Exactly four digits, or null. Nothing more of the card number is ever stored. */
  readonly cardLast4: string | null;
  readonly upiVpa: string | null;
  readonly manualReference: string | null;
  readonly paidAt: Date | null;
}

/** What `findCurrentPaymentMethod` should look at. */
export interface CurrentPaymentMethodOptions {
  /**
   * True when the plan renews by itself at the provider: then only payments that bought or renewed the plan count, so a
   * one-off paid extra, or a charge staff recorded by hand, cannot name the method the plan renews on. False looks at
   * every payment that bought something, which is what a customer who pays by hand last used.
   */
  readonly planOnly: boolean;
}

/**
 * The kinds of payment that say nothing about the plan: a paid extra, and an add-on. The plan's first payment and its
 * review checks skip them. Shared with the staff client list (queries/clients.ts).
 */
export const PLAN_EXCLUDED_PAYMENT_KINDS: readonly PaymentKind[] = ["charge", "add_on"];

/** The payment kinds that pay for the plan itself, as opposed to a paid extra or a staff-recorded charge. */
const PLAN_PAYMENT_KINDS: readonly Payment["kind"][] = ["initial", "renewal", "reactivation"];

/**
 * The newest captured payment that bought something and says how it was made (a provider method, or a bank transfer
 * staff recorded), or null before the first. The issuing bank is left out: Razorpay sends a four letter code for it, not a
 * name. Works through row-level security.
 */
export async function findCurrentPaymentMethod(
  db: Runner,
  businessId: string,
  { planOnly }: CurrentPaymentMethodOptions,
): Promise<CurrentPaymentMethod | null> {
  const rows = await db
    .select({
      provider: payments.provider,
      kind: payments.kind,
      method: payments.method,
      cardNetwork: payments.cardNetwork,
      cardType: payments.cardType,
      cardLast4: payments.cardLast4,
      upiVpa: payments.upiVpa,
      manualReference: payments.manualReference,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .where(
      and(
        eq(payments.businessId, businessId),
        eq(payments.status, "captured"),
        paymentWasApplied(),
        or(isNotNull(payments.method), eq(payments.provider, "manual")),
        planOnly ? inArray(payments.kind, [...PLAN_PAYMENT_KINDS]) : undefined,
      ),
    )
    .orderBy(desc(payments.createdAt), desc(payments.id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The first payment a business made that bought something, or null. It is what the staff console shows as "paid".
 * A payment that could not be applied (see UNAPPLIED_PAYMENT_REASONS) is not one, and neither is a paid extra or an
 * add-on payment: only the plan's own payments count.
 */
export async function findFirstPayment(db: Runner, businessId: string): Promise<Payment | null> {
  const rows = await db
    .select(PAYMENT_COLUMNS)
    .from(payments)
    .where(
      and(
        eq(payments.businessId, businessId),
        eq(payments.status, "captured"),
        notInArray(payments.kind, [...PLAN_EXCLUDED_PAYMENT_KINDS]),
        paymentWasApplied(),
      ),
    )
    .orderBy(asc(payments.paidAt), asc(payments.id))
    .limit(1);
  return rows[0] ?? null;
}

/** Whether any subscription of the business was ever activated by a payment. */
export async function hasEverPaid(db: Runner, businessId: string): Promise<boolean> {
  const rows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.businessId, businessId), isNotNull(subscriptions.activatedAt)))
    .limit(1);
  return rows.length > 0;
}

/** Whether money arrived that bought nothing and staff have not dealt with it yet. */
async function hasPaymentUnderReview(db: Runner, businessId: string): Promise<boolean> {
  const rows = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.businessId, businessId),
        inArray(payments.attentionReason, [...UNAPPLIED_PAYMENT_REASONS]),
        isNull(payments.attentionResolvedAt),
        // A flagged payment for a paid extra or an add-on says nothing about the plan, so it must not hold the plan's checkout.
        notInArray(payments.kind, [...PLAN_EXCLUDED_PAYMENT_KINDS]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export interface BillingState {
  readonly currency: BillingCurrency;
  /**
   * The customer has paid to move up and the renewal at the new price has not yet been taken. While true, `plan`,
   * `tier` and `subscription` describe the subscription as the customer is now entitled to it (the new plan, with the
   * discount that carried over), not as the provider is still billing it; the dates and status are the raw ones.
   * Code that checks what the provider will charge reads the raw subscription row (findSubscriptionByProviderId).
   */
  readonly upgradePaid: boolean;
  /**
   * The plan the business is on or is buying: its subscription's plan's tier, or, with no subscription yet, the one its
   * sign-up choice names (planTierForSignupChoice). A checkout, a manual payment and the plan shown all price from it.
   */
  readonly tier: PlanTier;
  /** The newest subscription, whatever its status (see findLatestSubscriptionForBusiness). */
  readonly subscription: Subscription | null;
  /** Any subscription was ever activated: a business that has paid once and lapsed is reactivated, never re-sold. */
  readonly hasEverPaid: boolean;
  /** Money arrived that bought nothing and is waiting for staff. The customer must not be asked to pay again. */
  readonly paymentUnderReview: boolean;
  /**
   * The plan the business is on: its subscription's (the price it was sold at, even if retired since), otherwise
   * the active plan of its tier for its currency. Null only when its currency has no active plan of that tier.
   */
  readonly plan: Plan | null;
  /** The services billed inside the subscription (`pending` or `active`): what decides whether the business has a website. */
  readonly addOns: readonly BundledAddOn[];
}

/**
 * Everything the dashboard needs to decide what to show about money, for one business. Works on the tenant-scoped
 * app connection (row-level security limits it to the customer's own business) and on the staff connection.
 * Returns null when the business is not visible.
 */
export async function findBillingState(db: Runner, businessId: string): Promise<BillingState | null> {
  if (!isUuid(businessId)) return null;
  const businessRows = await db
    .select({ currency: businesses.currency, signupChoice: businesses.signupChoice })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  const business = businessRows[0];
  if (business === undefined) return null;

  // Sequential: `db` may be a transaction, which runs one statement at a time.
  const subscription = await findLatestSubscriptionForBusiness(db, businessId);
  const everPaid = await hasEverPaid(db, businessId);
  const paymentUnderReview = await hasPaymentUnderReview(db, businessId);
  const addOns = await findLiveBundledAddOns(db, businessId);
  const billed = subscription === null ? null : await findPlanById(db, subscription.planId);
  // A move up that has been paid for is Premium from that moment, though the provider bills the old plan until the
  // renewal: the customer is shown, and gets, what they paid for.
  const pending =
    subscription === null || subscription.pendingPlanId === null ? null : await findPlanById(db, subscription.pendingPlanId);
  const subscribed = pending ?? billed;
  const entitled =
    subscription === null || pending === null
      ? subscription
      : {
          ...subscription,
          planId: pending.id,
          discountAmountCents: subscription.pendingDiscountAmountCents,
          retentionDiscountCents: 0,
        };
  // A subscription's plan decides the tier; a business that has not subscribed is priced from what it chose.
  const tier = subscribed?.tier ?? planTierForSignupChoice(business.signupChoice);
  const plan = subscribed ?? (await findActivePlan(db, business.currency, tier));
  return {
    currency: business.currency,
    upgradePaid: pending !== null,
    tier,
    subscription: entitled,
    hasEverPaid: everPaid,
    paymentUnderReview,
    plan,
    addOns,
  };
}

/** Money collected in one currency over a period, in minor units (paise for INR, cents for USD). */
export interface CollectedAmount {
  readonly currency: BillingCurrency;
  readonly amountCents: number;
}

/**
 * What came in between `from` (included) and `to` (excluded): captured payments that bought something, plan and extras
 * alike, summed per currency. A payment that could not be applied (paymentWasApplied) is left out, as everywhere else.
 */
export async function sumCapturedPaymentsBetween(db: Database, from: Date, to: Date): Promise<CollectedAmount[]> {
  const rows = await db
    .select({ currency: payments.currency, total: sum(payments.amountCents) })
    .from(payments)
    .where(and(eq(payments.status, "captured"), gte(payments.paidAt, from), lt(payments.paidAt, to), paymentWasApplied()))
    .groupBy(payments.currency)
    .orderBy(asc(payments.currency));
  return rows.map((row) => ({ currency: row.currency, amountCents: Number(row.total ?? 0) }));
}

