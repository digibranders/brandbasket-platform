import "server-only";
import { randomUUID } from "node:crypto";
import { addMonthsUtc, CHECKOUT_REUSE_WINDOW_MS, chargedAmountCents, CheckoutVerificationError, type BillingProvider, type ConfirmedAddOnPayment } from "@brandbasket/billing";
import {
  bundledNetAfterRemoving,
  cancelStaleAddOnCheckout,
  consumeRateLimit,
  findAddOnSubscription,
  findBillingState,
  findBusinessCurrency,
  findLifetimeOfferStanding,
  findLiveBundledAddOns,
  findPlanById,
  findSubscriptionById,
  insertAddOnSubscription,
  listAddOnSubscriptionsForBusiness,
  lockBusinessForBilling,
  recordBundledAddOnRemoval,
  recordUnappliedAddOnPayment,
  updateAddOnStatus,
  withTenantScope,
  type AddOnSubscription,
  type BundledAddOn,
  type RateLimitRule,
  type Database,
  type ScopedTransaction,
} from "@brandbasket/db";
import { BROKEN_ADD_ON_LINE, keepDateOf } from "@/lib/billing/add-on-copy";
import { isSafeCheckoutUrl } from "@/lib/billing/checkout-url";
import {
  addOnById,
  addOnPrice,
  isMonthlyAddOnId,
  MONTHLY_ADD_ON_IDS,
  type AddOnId,
  type AddOnPrice,
  type MonthlyAddOnId,
} from "@brandbasket/shared/lib/billing/add-ons";
import { addOnFactsOf, pickAddOnRows, type PickedAddOnRows } from "@brandbasket/shared/lib/billing/add-on-rows";
import {
  addOnActions,
  addOnView,
  decideAddOnCheckout,
  type AddOnAction,
  type AddOnCheckoutIntent,
  type AddOnEndKind,
  type AddOnView,
} from "@brandbasket/shared/lib/billing/add-on-state";
import { lifetimeOfferApplies } from "@brandbasket/shared/lib/billing/lifetime-offer";
import { applyAddOnPayment, type ProviderSubscriptionRef } from "@brandbasket/shared/server/add-on-activation";
import { addOnEndMessage, scheduleAddOnEndFor as scheduleEndWithProvider } from "@brandbasket/shared/server/add-on-ends";
import { ensureAddOnPlan } from "@brandbasket/shared/server/add-on-plans";
import { describeError, logBillingEvent } from "@brandbasket/shared/server/billing-log";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { cancelAtProvider } from "@brandbasket/shared/server/provider-cancellation";
import { getBillingProvider } from "./billing";
import { getCustomerBusinessKind, type GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { ensureDiscountPlan } from "./discount-plans";

/** A stuck button or a script must not be able to open subscriptions or charges at the provider without limit. */
export const ADD_ON_CHECKOUT_RATE_LIMIT: RateLimitRule = { limit: 10, windowSeconds: 60 * 60 };

export type AddOnCheckoutOutcome =
  | { readonly kind: "redirect"; readonly url: string }
  | { readonly kind: "refused"; readonly message: string };

/** What Pause or Cancel came to, as the sentence the page shows. */
export type AddOnEndResult =
  | { readonly kind: "done"; readonly message: string }
  | { readonly kind: "refused"; readonly message: string };

/** What confirming the fake provider's test checkout came to, for the page to say. */
export type AddOnConfirmation =
  /** Not a payment this customer may confirm. Nothing was written. */
  | { readonly kind: "invalid" }
  /** The first payment is recorded and the add-on is running. */
  | { readonly kind: "paid" }
  /** A kept add-on is authorised and will be charged on its start date. */
  | { readonly kind: "authorised" }
  /** Recorded earlier (a refresh or a second click). Nothing was written. */
  | { readonly kind: "already-recorded" }
  /** The money is recorded for staff but bought nothing: the add-on was already running, or the checkout was replaced. */
  | { readonly kind: "needs-attention" };

/** The provider handed back a checkout this site will not send a customer to. */
export class UnsafeAddOnCheckoutUrlError extends Error {
  constructor() {
    super("The billing provider returned an add-on checkout URL that is neither a local path nor https.");
    this.name = "UnsafeAddOnCheckoutUrlError";
  }
}

/** Where the customer pays for a Razorpay add-on checkout: the app's own page, which opens Razorpay Checkout. */
export function addOnPayPath(addOnSubscriptionId: string): string {
  return `/add-ons/pay/${addOnSubscriptionId}`;
}

const TOO_MANY_ATTEMPTS = "That's a lot of attempts in a short time. Please wait a little and try again.";
const PROVIDER_UNAVAILABLE = "We couldn't reach the payment provider. Try again in a minute.";
const CHANGED_MEANWHILE = "Something changed while we were setting up your payment. Please try again.";
const BROKEN_ROW = BROKEN_ADD_ON_LINE;

function refused(message: string): { readonly kind: "refused"; readonly message: string } {
  return { kind: "refused", message };
}

/** A website client on Premium has the member price; a free listing account has no plan, so it never does. */
async function isPremiumMember(customer: GrantedCustomer): Promise<boolean> {
  const { tenant, billing } = customer;
  const kind = await getCustomerBusinessKind(tenant.userId, tenant.businessId);
  return kind === "website" && billing.tier === "premium";
}

/**
 * Whether a new purchase of `addOn` is priced with the first-checkout lifetime offer: it is bought before the first plan
 * payment, or this add-on was bought that way before (lib/billing/lifetime-offer.ts). Each add-on earns it on its own, so
 * one missed at the first checkout stays at its full price. Read on whatever connection can see the business.
 */
async function offerAppliesTo(tx: Database | ScopedTransaction, businessId: string, addOn: AddOnId): Promise<boolean> {
  const standing = await findLifetimeOfferStanding(tx, businessId);
  const state = await findBillingState(tx, businessId);
  return lifetimeOfferApplies({ hasEverPaid: state?.hasEverPaid ?? true, claimedBefore: standing.claimed.includes(addOn) });
}

/** The currency the business is billed in, which a new add-on is priced and charged in. */
async function billedCurrencyOf(tx: ScopedTransaction, businessId: string): Promise<AddOnPrice["currency"]> {
  const currency = await findBusinessCurrency(tx, businessId);
  if (currency === null) throw new Error(`No business with id ${businessId} to price an add-on for`);
  return currency;
}

/** What an existing purchase costs, as stored on it. A resume, Pay now or Keep it never uses today's catalogue. */
function storedPrice(row: AddOnSubscription): AddOnPrice {
  return {
    currency: row.currency,
    listCents: row.listAmountCents,
    discountCents: row.discountAmountCents,
    offerCents: row.offerDiscountAmountCents,
    netCents: row.netAmountCents,
    taxRateBasisPoints: row.taxRateBasisPoints,
    chargedCents: row.chargedAmountCents,
  };
}

/** What an add-on taken at the first checkout costs inside the plan's payment, as frozen on it. */
function bundledPrice(row: BundledAddOn, currency: AddOnPrice["currency"]): AddOnPrice {
  return {
    currency,
    listCents: row.listAmountCents,
    discountCents: row.offerDiscountAmountCents,
    offerCents: row.offerDiscountAmountCents,
    netCents: row.netAmountCents,
    taxRateBasisPoints: row.taxRateBasisPoints,
    chargedCents: chargedAmountCents(row.netAmountCents, 0, row.taxRateBasisPoints),
  };
}

function samePrice(a: AddOnPrice, b: AddOnPrice): boolean {
  return (
    a.currency === b.currency &&
    a.listCents === b.listCents &&
    a.discountCents === b.discountCents &&
    a.offerCents === b.offerCents &&
    a.netCents === b.netCents &&
    a.taxRateBasisPoints === b.taxRateBasisPoints &&
    a.chargedCents === b.chargedCents
  );
}

type PickedRows = PickedAddOnRows<AddOnSubscription>;

/** One business's rows for one add-on, read inside a transaction, and which of them say what the add-on is doing. */
async function pickedRowsFor(tx: ScopedTransaction, businessId: string, addOn: MonthlyAddOnId): Promise<PickedRows> {
  const rows = await listAddOnSubscriptionsForBusiness(tx, businessId);
  return pickAddOnRows(rows.filter((row) => row.addOn === addOn));
}

/** What the add-on shows now, from the rows picked. Throws RangeError for a row holding data no state can come from. */
function viewOf(picked: PickedRows, now: Date): AddOnView {
  return addOnView(
    picked.current === null ? null : addOnFactsOf(picked.current),
    picked.successor === null ? null : addOnFactsOf(picked.successor),
    now,
  );
}

/** Enough of the rows to tell whether the second transaction sees what the first decided from. */
function stateKey(picked: PickedRows): string {
  const part = (row: AddOnSubscription | null): string => (row === null ? "-" : `${row.id}:${row.status}:${row.endKind ?? ""}`);
  return [part(picked.incomplete), part(picked.current), part(picked.successor)].join("|");
}

function refusalMessage(intent: AddOnCheckoutIntent, reason: "already-active" | "not-allowed", view: AddOnView, title: string): string {
  if (reason === "already-active") return `${title} is already running.`;
  switch (intent) {
    case "buy":
      return view.state === "paused"
        ? `${title} is paused. Use Resume to start it again.`
        : `Your last ${title} payment didn't go through. Use Pay now to fix it.`;
    case "resume":
      return `${title} isn't paused, so there is nothing to resume.`;
    case "pay-now":
      return view.state === "ended" || view.state === "none"
        ? `The time to pay for ${title} has passed. You can buy it again from the Add-ons page.`
        : `${title} has no failed payment to pay for.`;
    case "keep":
      return `${title} isn't about to end, so there is nothing to keep.`;
    default: {
      const unhandled: never = intent;
      throw new Error(`Unhandled add-on checkout intent ${String(unhandled)}`);
    }
  }
}

/** What was decided under the lock, carried past its commit. */
type CheckoutPlan =
  | { readonly kind: "refused"; readonly message: string }
  /** An unpaid checkout from the last day, for this very purchase: go back to it. */
  | { readonly kind: "reuse"; readonly url: string }
  | {
      readonly kind: "open";
      readonly price: AddOnPrice;
      /** The row this purchase continues (Resume, Pay now, Keep it), or null for a buy. */
      readonly continued: AddOnSubscription | null;
      readonly startAt: Date | null;
      /** An unpaid checkout this one replaces, cancelled in the same transaction that records the new one. */
      readonly stale: AddOnSubscription | null;
      /** What the rows looked like when this was decided; the second transaction checks they have not moved. */
      readonly seen: string;
    };

function isSameInstant(a: Date | null, b: Date | null): boolean {
  return a === null || b === null ? a === b : a.getTime() === b.getTime();
}

async function planCheckout(
  tx: ScopedTransaction,
  provider: BillingProvider,
  input: { readonly businessId: string; readonly addOn: MonthlyAddOnId; readonly intent: AddOnCheckoutIntent; readonly premium: boolean; readonly now: Date },
): Promise<CheckoutPlan> {
  const { businessId, addOn, intent, premium, now } = input;
  const title = addOnById(addOn).title;
  await lockBusinessForBilling(tx, businessId);
  const picked = await pickedRowsFor(tx, businessId, addOn);

  let view: AddOnView;
  try {
    view = viewOf(picked, now);
  } catch (error) {
    logBillingEvent("error", "add-on-view-failed", { businessId, addOn, addOnSubscriptionId: picked.current?.id ?? null, ...errorLogInfo(error) });
    return refused(BROKEN_ROW);
  }

  const decision = decideAddOnCheckout(intent, view);
  if (decision.kind === "refused") return refused(refusalMessage(intent, decision.reason, view, title));

  const continued = decision.continues ? picked.current : null;
  if (decision.continues && continued === null) {
    throw new Error(`Add-on checkout ${intent} for ${addOn} was allowed with no row to continue`);
  }
  const price =
    continued === null
      ? addOnPrice(addOnById(addOn), await billedCurrencyOf(tx, businessId), premium, await offerAppliesTo(tx, businessId, addOn))
      : storedPrice(continued);
  const startAt = decision.startsOnPeriodEnd ? (continued?.currentPeriodEnd ?? null) : null;
  if (decision.startsOnPeriodEnd && startAt === null) throw new RangeError(`The ${addOn} row being kept has no period end`);

  const { incomplete } = picked;
  // The fake provider cannot reopen a subscription it made (every start mints a new one), so its checkout is replaced.
  if (
    incomplete !== null &&
    provider.name !== "fake" &&
    incomplete.provider === provider.name &&
    now.getTime() - incomplete.createdAt.getTime() < CHECKOUT_REUSE_WINDOW_MS &&
    samePrice(storedPrice(incomplete), price) &&
    incomplete.continuesId === (continued?.id ?? null) &&
    isSameInstant(incomplete.startAt, startAt)
  ) {
    return { kind: "reuse", url: addOnPayPath(incomplete.id) };
  }

  return { kind: "open", price, continued, startAt, stale: incomplete, seen: stateKey(picked) };
}

function checkedUrl(checkoutUrl: string | null, addOnSubscriptionId: string): string {
  const url = checkoutUrl ?? addOnPayPath(addOnSubscriptionId);
  if (!isSafeCheckoutUrl(url)) throw new UnsafeAddOnCheckoutUrlError();
  return url;
}

/**
 * Opens a monthly add-on at the provider and records it, for Buy, Resume, Pay now and Keep it. The shape is
 * lib/server/checkout.ts's:
 *
 * 1. at most ADD_ON_CHECKOUT_RATE_LIMIT attempts per business;
 * 2. under the business's billing lock on the staff connection (customers never write billing rows), the rows for this
 *    add-on say what it is doing; the pure rules decide whether this intent is allowed (decideAddOnCheckout); the price
 *    is today's catalogue price for a buy and the stored price of the row it continues otherwise; and a recent unpaid
 *    checkout for this very purchase is sent back to rather than opened again (Razorpay only: the fake provider cannot
 *    reopen a subscription, so its checkout is replaced);
 * 3. with the lock released, the provider's plan for the amount is found or made and the subscription is opened;
 * 4. a second short transaction under the lock checks the rows have not moved and records the unpaid row, cancelling
 *    any unpaid checkout it replaces. If that check or the recording fails, the subscription just opened is an orphan
 *    and is cancelled at the provider. A replaced checkout is cancelled at the provider only after the commit.
 *
 * The row is `incomplete` until its first payment is recorded (confirmFakeAddOnPaymentFor, or the Razorpay webhook).
 * Resume and Pay now start at once; Keep it starts on the continued row's billing date. Pay now and Keep it copy the
 * continued row's contacted mark (they are not new purchases for staff); Resume does not, so staff see it again.
 */
export async function startAddOnCheckoutFor(
  customer: GrantedCustomer,
  addOn: MonthlyAddOnId,
  intent: AddOnCheckoutIntent,
  now: Date,
): Promise<AddOnCheckoutOutcome> {
  const { tenant } = customer;
  const limit = await consumeRateLimit(getAppDb(), `add-on-checkout:business:${tenant.businessId}`, ADD_ON_CHECKOUT_RATE_LIMIT);
  if (!limit.allowed) return refused(TOO_MANY_ATTEMPTS);

  const provider = getBillingProvider();
  const premium = await isPremiumMember(customer);
  const staffDb = getStaffDb();
  // Taken at the first checkout, it is already billed with the plan: a second subscription would charge it twice.
  const bundled = await findLiveBundledAddOns(staffDb, tenant.businessId);
  if (bundled.some((row) => row.addOn === addOn)) return refused(`${addOnById(addOn).title} is already part of your monthly plan payment.`);
  const checkout = await staffDb.transaction((tx) => planCheckout(tx, provider, { businessId: tenant.businessId, addOn, intent, premium, now }));
  if (checkout.kind === "refused") return checkout;
  if (checkout.kind === "reuse") return { kind: "redirect", url: checkout.url };

  const { price, continued, startAt, stale } = checkout;
  const entry = addOnById(addOn);
  // Made (or found) before anything is opened at the provider: if it cannot be made, nothing exists to clean up.
  let providerPlanId: string | null;
  try {
    providerPlanId = await ensureAddOnPlan(staffDb, provider, { addOn: entry, price });
  } catch (error) {
    logBillingEvent("error", "add-on-plan-failed", { businessId: tenant.businessId, addOn, netAmountCents: price.netCents, ...describeError(error) });
    return refused(PROVIDER_UNAVAILABLE);
  }

  const id = randomUUID();
  let opened: Awaited<ReturnType<BillingProvider["startAddOnSubscription"]>>;
  try {
    opened = await provider.startAddOnSubscription({
      businessId: tenant.businessId,
      addOnSubscriptionId: id,
      providerPlanId,
      amountCents: price.chargedCents,
      currency: price.currency,
      startAt,
    });
  } catch (error) {
    logBillingEvent("error", "add-on-checkout-failed", { businessId: tenant.businessId, addOn, ...describeError(error) });
    return refused(PROVIDER_UNAVAILABLE);
  }
  const orphan = {
    businessId: tenant.businessId,
    subscriptionId: null,
    provider: provider.name,
    providerSubscriptionId: opened.providerSubscriptionId,
  } as const;
  const orphanFields = { businessId: tenant.businessId, providerSubscriptionId: opened.providerSubscriptionId };

  let url: string;
  let recorded: boolean;
  try {
    url = checkedUrl(opened.checkoutUrl, id);
    recorded = await staffDb.transaction(async (tx): Promise<boolean> => {
      await lockBusinessForBilling(tx, tenant.businessId);
      const latest = await pickedRowsFor(tx, tenant.businessId, addOn);
      if (stateKey(latest) !== checkout.seen) return false;
      // Before the insert: the database allows one unpaid checkout per business and add-on.
      if (stale !== null) await cancelStaleAddOnCheckout(tx, stale.id, now);
      await insertAddOnSubscription(tx, {
        id,
        businessId: tenant.businessId,
        addOn,
        listAmountCents: price.listCents,
        discountAmountCents: price.discountCents,
        offerDiscountAmountCents: price.offerCents,
        netAmountCents: price.netCents,
        taxRateBasisPoints: price.taxRateBasisPoints,
        chargedAmountCents: price.chargedCents,
        currency: price.currency,
        provider: provider.name,
        providerSubscriptionId: opened.providerSubscriptionId,
        providerPlanId,
        startAt,
        continuesId: continued?.id ?? null,
        // Paying again for what staff already know about is not a new purchase for them; a resume is.
        contactedAt: intent === "pay-now" || intent === "keep" ? (continued?.contactedAt ?? null) : null,
        contactedByStaffId: intent === "pay-now" || intent === "keep" ? (continued?.contactedByStaffId ?? null) : null,
      });
      return true;
    });
  } catch (error) {
    logBillingEvent("error", "checkout-orphaned", { ...orphanFields, reason: "record-failed", ...describeError(error) });
    await cancelAtProvider(provider, orphan);
    throw error;
  }

  if (!recorded) {
    logBillingEvent("warn", "checkout-orphaned", { ...orphanFields, reason: "changed-meanwhile" });
    await cancelAtProvider(provider, orphan);
    return refused(CHANGED_MEANWHILE);
  }

  if (stale !== null) {
    await cancelAtProvider(provider, {
      businessId: tenant.businessId,
      subscriptionId: stale.id,
      provider: stale.provider,
      providerSubscriptionId: stale.providerSubscriptionId,
    });
  }
  return { kind: "redirect", url };
}

/**
 * Pause or Cancel for the signed-in customer: the shared logic (packages/shared/src/server/add-on-ends.ts, which staff
 * use too) with the customer as the actor, and its outcome as the sentence the page shows. The row is read by id
 * within the customer's own business, so an id from another business finds nothing.
 */
export async function scheduleAddOnEndFor(
  customer: Pick<GrantedCustomer, "tenant">,
  addOnSubscriptionId: string,
  kind: AddOnEndKind,
  now: Date,
): Promise<AddOnEndResult> {
  const outcome = await scheduleEndWithProvider(
    getStaffDb(),
    getBillingProvider(),
    { businessId: customer.tenant.businessId, addOnSubscriptionId, kind, staffUserId: null },
    now,
  );
  return { kind: outcome.kind === "refused" ? "refused" : "done", message: addOnEndMessage(outcome) };
}

const NOT_IN_PLAN = "That add-on isn't part of your plan payment any more. Reload the page to see where it stands.";
const CANNOT_REMOVE_NOW = "We couldn't remove that just now. Please try again in a minute.";

/** What taking an add-on out of the plan's payment came to. */
export type BundledRemovalResult =
  | { readonly kind: "scheduled"; readonly endsOn: Date; readonly message: string }
  | { readonly kind: "refused"; readonly message: string };

/**
 * Takes an add-on out of the plan's monthly payment from the next billing date (the same timing as Cancel on a separate
 * add-on). It stays active and paid for until then. The provider is moved to a plan at the lower amount first, for the cycle
 * end, and our record follows: if the provider refuses nothing here changes. If our record cannot then be written the provider
 * is ahead of us, which is logged for staff because the next renewal would arrive at an amount we do not expect. The page's
 * form carries only the add-on; the row, its price and the new amount all come from the database, under the business's lock.
 */
export async function removeBundledAddOnFor(customer: Pick<GrantedCustomer, "tenant">, addOn: MonthlyAddOnId, now: Date): Promise<BundledRemovalResult> {
  const { businessId } = customer.tenant;
  const limit = await consumeRateLimit(getAppDb(), `add-on-checkout:business:${businessId}`, ADD_ON_CHECKOUT_RATE_LIMIT);
  if (!limit.allowed) return refused(TOO_MANY_ATTEMPTS);

  const staffDb = getStaffDb();
  const provider = getBillingProvider();
  const planned = await staffDb.transaction(async (tx) => {
    await lockBusinessForBilling(tx, businessId);
    const live = await findLiveBundledAddOns(tx, businessId);
    const row = live.find((candidate) => candidate.addOn === addOn && candidate.status === "active" && candidate.endRequestedAt === null);
    if (row === undefined) return null;
    const subscription = await findSubscriptionById(tx, row.subscriptionId);
    if (subscription === null || subscription.businessId !== businessId || subscription.activatedAt === null || subscription.status === "cancelled") return null;
    const plan = await findPlanById(tx, subscription.planId);
    if (plan === null || subscription.paidThroughAt === null) return null;
    return { row, subscription, plan, remainingNetCents: bundledNetAfterRemoving(live, row) };
  });
  if (planned === null) return refused(NOT_IN_PLAN);
  const { row, subscription, plan, remainingNetCents } = planned;
  const fields = { businessId, subscriptionId: subscription.id, addOn };

  try {
    if (subscription.provider !== "manual") {
      if (subscription.provider !== provider.name) throw new Error(`The subscription belongs to ${subscription.provider}.`);
      // The plan's own provider plan when nothing is left to add, else the one made for the lower amount (and any discount).
      const providerPlanId =
        remainingNetCents === 0 && subscription.discountAmountCents === 0
          ? (plan.providerPlanId ?? undefined)
          : await ensureDiscountPlan(provider, plan, subscription.discountAmountCents, remainingNetCents);
      if (providerPlanId === undefined && provider.name === "razorpay") throw new Error(`Plan ${plan.code} has no provider plan to move to.`);
      await provider.changeSubscriptionPlanAtPeriodEnd(subscription.providerSubscriptionId, providerPlanId ?? "");
    }
  } catch (error) {
    logBillingEvent("error", "bundled-add-on-removal-failed", { ...fields, stage: "provider", ...describeError(error) });
    return refused(CANNOT_REMOVE_NOW);
  }

  try {
    const recorded = await staffDb.transaction(async (tx) => {
      await lockBusinessForBilling(tx, businessId);
      return recordBundledAddOnRemoval(tx, { id: row.id, businessId, pendingBundledAddOnNetCents: remainingNetCents, now });
    });
    if (!recorded) return refused(NOT_IN_PLAN);
  } catch (error) {
    logBillingEvent("error", "bundled-add-on-removal-failed", { ...fields, stage: "record", ...describeError(error) });
    return refused(CANNOT_REMOVE_NOW);
  }
  const endsOn = subscription.paidThroughAt ?? now;
  return { kind: "scheduled", endsOn, message: `${addOnById(addOn).title} stays until your next payment date, then it stops and your monthly payment goes down.` };
}

/** What the fake provider's test checkout page shows before the customer pays: the add-on and what it costs today. */
export interface VerifiedAddOnPayment {
  readonly addOn: MonthlyAddOnId;
  readonly amountCents: number;
  readonly currency: ConfirmedAddOnPayment["currency"];
  /** For a kept add-on, the day it starts and is first charged; null for any other checkout. */
  readonly startAt: Date | null;
}

/**
 * Checks a test checkout link without recording anything, so the page can show what is about to be paid for. The link
 * must verify, be for the signed-in customer's business, and name a row of theirs (read through row-level security)
 * that is the very subscription the link was made for. Anything else is null, and the page says the link is not valid
 * without saying which part failed. confirmFakeAddOnPaymentFor repeats every one of these checks when the customer pays.
 */
export async function verifyAddOnPaymentFor(
  customer: Pick<GrantedCustomer, "tenant">,
  token: string,
): Promise<VerifiedAddOnPayment | null> {
  const { tenant } = customer;
  const provider = getBillingProvider();
  let confirmed: ConfirmedAddOnPayment;
  try {
    confirmed = await provider.confirmAddOnPayment({ token });
  } catch (error) {
    if (error instanceof CheckoutVerificationError) return null;
    throw error;
  }
  if (confirmed.businessId !== tenant.businessId) return null;

  const row = await withTenantScope(getAppDb(), tenant, (tx) => findAddOnSubscription(tx, tenant.businessId, confirmed.addOnSubscriptionId));
  if (row === null || row.provider !== provider.name || row.providerSubscriptionId !== confirmed.providerSubscriptionId) return null;
  if (!isMonthlyAddOnId(row.addOn)) return null;
  return { addOn: row.addOn, amountCents: confirmed.amountCents, currency: confirmed.currency, startAt: row.startAt };
}

interface ConfirmationResult {
  readonly confirmation: AddOnConfirmation;
  /** Subscriptions to cancel at the provider once the transaction has committed. */
  readonly toCancel: readonly ProviderSubscriptionRef[];
}

/**
 * The fake provider's test checkout for an add-on: verifies the signed link, checks it is for the signed-in customer's
 * business and for a row of theirs, and records the first payment under the business's billing lock, through the one
 * shared path (applyAddOnPayment: record, open for a month from `paidAt`, invoice). A kept add-on has no payment yet:
 * it is only authorised, so its row becomes `scheduled` and the payment comes on its start date. Halted rows the payment
 * replaces are cancelled at the provider after the commit.
 *
 * A link for another business is refused without writing anything. As in the Razorpay webhook, a payment of another
 * amount or currency than the row was bought at is kept for staff and opens nothing. If another row of the add-on is
 * already billing, or the checkout was cancelled, the money is recorded for staff as an unapplied payment, nothing is
 * opened, and this row's own subscription is cancelled at the provider (after the commit) so it takes no more money.
 */
export async function confirmFakeAddOnPaymentFor(
  customer: Pick<GrantedCustomer, "tenant">,
  token: string,
  now: Date,
): Promise<AddOnConfirmation> {
  const { tenant } = customer;
  const provider = getBillingProvider();
  let confirmed: ConfirmedAddOnPayment;
  try {
    confirmed = await provider.confirmAddOnPayment({ token });
  } catch (error) {
    if (error instanceof CheckoutVerificationError) return { kind: "invalid" };
    throw error;
  }
  if (confirmed.businessId !== tenant.businessId) {
    logBillingEvent("warn", "confirmation-refused", {
      businessId: tenant.businessId,
      subscriptionId: null,
      provider: provider.name,
      providerSubscriptionId: confirmed.providerSubscriptionId,
      reason: "other-business-token",
    });
    return { kind: "invalid" };
  }

  const result = await getStaffDb().transaction(async (tx): Promise<ConfirmationResult> => {
    await lockBusinessForBilling(tx, tenant.businessId);
    const row = await findAddOnSubscription(tx, tenant.businessId, confirmed.addOnSubscriptionId);
    if (row === null || row.provider !== provider.name || row.providerSubscriptionId !== confirmed.providerSubscriptionId) {
      logBillingEvent("warn", "confirmation-refused", {
        businessId: tenant.businessId,
        subscriptionId: null,
        provider: provider.name,
        providerSubscriptionId: confirmed.providerSubscriptionId,
        reason: "unknown-subscription",
      });
      return { confirmation: { kind: "invalid" }, toCancel: [] };
    }
    const refused = (reason: string, providerPaymentId: string | null): void =>
      logBillingEvent("warn", "confirmation-refused", {
        businessId: tenant.businessId,
        subscriptionId: null,
        provider: provider.name,
        providerSubscriptionId: confirmed.providerSubscriptionId,
        providerPaymentId,
        reason,
      });

    if (confirmed.providerPaymentId === null) {
      // Only a kept add-on is authorised without a payment, and it always has the day it starts. A row without one is not
      // something this checkout could have made: it is left as it is for someone to look at.
      if (row.startAt === null) {
        refused("authorised-without-start", null);
        return { confirmation: { kind: "needs-attention" }, toCancel: [] };
      }
      const changed = await updateAddOnStatus(tx, {
        id: row.id,
        status: "scheduled",
        providerStatus: "authenticated",
        now,
        expectedFrom: "incomplete",
      });
      return { confirmation: { kind: changed ? "authorised" : "already-recorded" }, toCancel: [] };
    }

    const record = {
      addOnSubscriptionId: row.id,
      provider: provider.name,
      providerPaymentId: confirmed.providerPaymentId,
      amountCents: confirmed.amountCents,
      currency: confirmed.currency,
      paidAt: confirmed.paidAt,
      periodStart: confirmed.paidAt,
      periodEnd: addMonthsUtc(confirmed.paidAt, 1),
      ...(confirmed.method === undefined ? {} : { method: confirmed.method }),
    } as const;

    // As in the webhook: what was taken must be what the row was bought at.
    if (row.chargedAmountCents !== confirmed.amountCents || row.currency !== confirmed.currency) {
      await recordUnappliedAddOnPayment(tx, { ...record, reason: "amount_mismatch", now });
      refused("amount_mismatch", confirmed.providerPaymentId);
      return { confirmation: { kind: "needs-attention" }, toCancel: [] };
    }

    const applied = await applyAddOnPayment(tx, record, now);
    switch (applied.kind) {
      case "applied":
        return { confirmation: { kind: "paid" }, toCancel: applied.cancelAtProvider };
      case "already-recorded":
        return { confirmation: { kind: "already-recorded" }, toCancel: [] };
      case "refused":
        refused(applied.reason, confirmed.providerPaymentId);
        return { confirmation: { kind: "needs-attention" }, toCancel: applied.cancelAtProvider };
      default: {
        const unhandled: never = applied;
        throw new Error(`Unhandled add-on payment result ${JSON.stringify(unhandled)}`);
      }
    }
  });

  // After the commit, as for any replaced checkout: the provider is never called inside a transaction.
  for (const target of result.toCancel) {
    await cancelAtProvider(provider, {
      businessId: tenant.businessId,
      subscriptionId: null,
      provider: target.provider,
      providerSubscriptionId: target.providerSubscriptionId,
    });
  }
  return result.confirmation;
}

/** One monthly add-on as the Add-ons page shows it. */
export type AddOnPageEntry =
  | {
      readonly kind: "ready";
      readonly addOn: MonthlyAddOnId;
      readonly view: AddOnView;
      readonly actions: readonly AddOnAction[];
      /** What it costs: the stored price while it is in force, else today's price for a buy. */
      readonly price: AddOnPrice;
      /** The row Pause and Cancel act on, or null when those are not offered. */
      readonly endTargetId: string | null;
    }
  /** A row holds data no state can be worked out from. The page says so for this one add-on only. */
  | { readonly kind: "broken"; readonly addOn: MonthlyAddOnId; readonly rowId: string | null }
  /** Taken at the first checkout and billed inside the plan's monthly payment: nothing to buy, pause or cancel here. */
  | {
      readonly kind: "included";
      readonly addOn: MonthlyAddOnId;
      readonly price: AddOnPrice;
      /** The next billing date, when the add-on stops if it has been asked to; null while it is not ending. */
      readonly endsOn: Date | null;
      /** The next billing date, whether or not it is ending: when taking it out would take effect. */
      readonly nextBillingOn: Date | null;
    };

export interface AddOnsPage {
  readonly addOns: readonly AddOnPageEntry[];
  /** What the business is billed in: a new purchase is priced in it. */
  readonly currency: AddOnPrice["currency"];
  readonly premium: boolean;
}

function entryFor(
  businessId: string,
  addOn: MonthlyAddOnId,
  picked: PickedRows,
  pricing: { readonly currency: AddOnPrice["currency"]; readonly premium: boolean; readonly offer: boolean },
  now: Date,
): AddOnPageEntry {
  try {
    const view = viewOf(picked, now);
    const actions = addOnActions(view);
    // Keep it needs the old billing date. Checking here logs a row that cannot give one once, on the server, and the
    // page shows it as broken, rather than the row component failing while it draws.
    if (actions.includes("keep") && keepDateOf(view) === null) {
      throw new RangeError(`Keep it is offered on an ending or pausing add-on, not on ${view.state}`);
    }
    const inForce = picked.successor ?? picked.current;
    const price = view.state === "none" || view.state === "ended" || inForce === null ? addOnPrice(addOnById(addOn), pricing.currency, pricing.premium, pricing.offer) : storedPrice(inForce);
    const ends = actions.includes("pause") || actions.includes("cancel");
    return { kind: "ready", addOn, view, actions, price, endTargetId: ends ? (inForce?.id ?? null) : null };
  } catch (error) {
    logBillingEvent("error", "add-on-view-failed", { businessId, addOn, addOnSubscriptionId: picked.current?.id ?? null, ...errorLogInfo(error) });
    return { kind: "broken", addOn, rowId: picked.current?.id ?? null };
  }
}

/**
 * Everything the Add-ons page shows, read through row-level security as the signed-in customer: per monthly add-on its
 * state, buttons and price. Each add-on is worked out on its own, so one row with
 * impossible data shows as broken and never takes the page down.
 */
export async function loadAddOnsPage(customer: GrantedCustomer, now: Date): Promise<AddOnsPage> {
  const { tenant } = customer;
  const premium = await isPremiumMember(customer);
  const { rows, offers, bundled, currency } = await withTenantScope(getAppDb(), tenant, async (tx) => {
    const offered = new Map<MonthlyAddOnId, boolean>();
    for (const addOn of MONTHLY_ADD_ON_IDS) offered.set(addOn, await offerAppliesTo(tx, tenant.businessId, addOn));
    return {
      rows: await listAddOnSubscriptionsForBusiness(tx, tenant.businessId),
      offers: offered,
      bundled: await findLiveBundledAddOns(tx, tenant.businessId),
      currency: await billedCurrencyOf(tx, tenant.businessId),
    };
  });
  const addOns = MONTHLY_ADD_ON_IDS.map((addOn): AddOnPageEntry => {
    const included = bundled.find((row) => row.addOn === addOn && row.status === "active");
    if (included !== undefined) {
      const nextBillingOn = customer.billing.subscription?.paidThroughAt ?? null;
      return { kind: "included", addOn, price: bundledPrice(included, currency), endsOn: included.endRequestedAt === null ? null : nextBillingOn, nextBillingOn };
    }
    return entryFor(tenant.businessId, addOn, pickAddOnRows(rows.filter((row) => row.addOn === addOn)), { currency, premium, offer: offers.get(addOn) === true }, now);
  });
  return { addOns, premium, currency };
}

