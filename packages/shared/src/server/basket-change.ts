import "server-only";
import { hasBillingAccess, type BillingProvider } from "@brandbasket/billing";
import {
  BundledAddOnNotPossibleError,
  endPackageOffer,
  findBillingState,
  findBundledAddOnByCharge,
  findBundledAddOnsForSubscription,
  findChargeForBusiness,
  findLiveBundledAddOns,
  findPlanById,
  findSubscriptionById,
  flagPaymentForAttention,
  flagSubscriptionForAttention,
  keepBundledAddOn,
  lockBusinessForBilling,
  markBundledAddOnsScheduled,
  nextBundledNetCents,
  isPackageOfferForfeited,
  openBundledAddOn,
  recordBundledAddOnRemoval,
  setPendingOfferDiscounts,
  type BillingState,
  type BundledAddOn,
  type Database,
  type PendingOfferDiscount,
  type Plan,
  type ScopedTransaction,
  type Subscription,
} from "@brandbasket/db";
import { addOnBlock, quoteAddOn, type AddOnBlock, type AddOnQuote } from "../lib/billing/add-on-proration";
import { addOnById, isMonthlyAddOnId, type MonthlyAddOnId } from "../lib/billing/add-ons";
import { packageBasisPointsFor, packageDiscountCentsFor, packageLineWith, type PackageLine } from "../lib/billing/packages";
import { billingPeriodProgress } from "../lib/billing/period";
import { describeError, logBillingEvent } from "./billing-log";
import { servicePeriod } from "./tax-invoicing";

/*
 * Changing which add-ons ride in a running plan's monthly payment (docs/plans/13-platform-add-ons-after-signup.md in the
 * BrandBasket workspace), shared by the dashboard and the staff console so both quote, apply and finish a change the same
 * way. The database transitions are in @brandbasket/db (queries/bundled-add-ons.ts); this decides what to ask of them and
 * talks to the provider, always with no transaction open.
 *
 * Adding takes the money first (a charge for the rest of the paid month), then moves the provider to the bigger amount
 * from the next renewal. Removing and keeping move the provider first, then record the change: there is no money to take,
 * and if the provider refuses nothing here changes.
 */

export interface BasketDeps {
  readonly staffDb: Database;
  readonly provider: BillingProvider;
  /** The provider plan for the plan's price plus `addOnNetCents`, less the discount, made when first needed. */
  readonly ensureDiscountPlan: (provider: BillingProvider, plan: Plan, discountAmountCents: number, addOnNetCents: number) => Promise<string | undefined>;
}

/** Tells the provider to bill the plan plus `addOnNetCents` from the next renewal. Throws when it cannot. */
async function moveProviderTo(deps: BasketDeps, subscription: Subscription, plan: Plan, addOnNetCents: number): Promise<void> {
  const { provider } = deps;
  if (subscription.provider !== provider.name) throw new Error(`The subscription belongs to ${subscription.provider}, but ${provider.name} is configured.`);
  // The plan's own provider plan when nothing is added or taken off, else the one made for that amount.
  const providerPlanId =
    addOnNetCents === 0 && subscription.discountAmountCents === 0
      ? (plan.providerPlanId ?? undefined)
      : await deps.ensureDiscountPlan(provider, plan, subscription.discountAmountCents, addOnNetCents);
  // The fake provider needs no plan of its own; Razorpay does, and without one there is nothing to move to.
  if (providerPlanId === undefined && provider.name === "razorpay") throw new Error(`Plan ${plan.code} has no provider plan to move to.`);
  await provider.changeSubscriptionPlanAtPeriodEnd(subscription.providerSubscriptionId, providerPlanId ?? "");
}

/** The active lines that are staying in the basket: not asked to end. */
function stayingLines(rows: readonly BundledAddOn[]): readonly BundledAddOn[] {
  return rows.filter((row) => row.status === "active" && row.endRequestedAt === null);
}

function servicesOf(rows: readonly BundledAddOn[]): readonly MonthlyAddOnId[] {
  return rows.map((row) => row.addOn).filter(isMonthlyAddOnId);
}

/** A line at the package offer a basket of `services` earns: its own list price, less that percentage of it. */
interface RepricedLine {
  readonly id: string;
  readonly addOn: string;
  readonly discountCents: number;
  readonly netCents: number;
}

function repriced(rows: readonly BundledAddOn[], services: readonly MonthlyAddOnId[], forfeited: boolean): RepricedLine[] {
  const basisPoints = packageBasisPointsFor({ services, forfeited });
  return rows.map((row) => {
    const discountCents = packageDiscountCentsFor(row.listAmountCents, basisPoints);
    return { id: row.id, addOn: row.addOn, discountCents, netCents: row.listAmountCents - discountCents };
  });
}

function totalNetCents(lines: readonly RepricedLine[]): number {
  return lines.reduce((total, line) => total + line.netCents, 0);
}

/** The monthly list prices of these lines added up: what they cost with no package offer. */
function listTotalCents(rows: readonly BundledAddOn[]): number {
  return rows.reduce((total, row) => total + row.listAmountCents, 0);
}

/**
 * Where the basket's lines should go from the next bill when they are all priced at the package their set earns: the moves
 * that are not already so, the sum the provider is told, and how many lines are staying.
 */
function packageMove(rows: readonly BundledAddOn[], forfeited: boolean): { readonly moves: readonly PendingOfferDiscount[]; readonly netCents: number; readonly staying: number } {
  const staying = stayingLines(rows);
  const targets = repriced(staying, servicesOf(staying), forfeited);
  const moves = targets.flatMap((target): PendingOfferDiscount[] => {
    const row = staying.find((candidate) => candidate.id === target.id);
    const unchanged = row !== undefined && row.pendingOfferDiscountAmountCents === null && row.offerDiscountAmountCents === target.discountCents;
    return unchanged ? [] : [{ id: target.id, pendingOfferDiscountAmountCents: target.discountCents }];
  });
  return { moves, netCents: totalNetCents(targets), staying: staying.length };
}

/**
 * The basket is not what the provider was told it was: another change landed between the read the amount came from and the
 * lock the change is recorded under. Nothing is written; the provider is put on `derivedNetCents` (null when no line is left
 * to bill) and staff are told, and trying again prices the basket as it now stands.
 */
class BasketChangedError extends Error {
  readonly derivedNetCents: number | null;

  constructor(subscriptionId: string, sentNetCents: number, derivedNetCents: number | null) {
    super(`The basket of subscription ${subscriptionId} changed after the provider was told ${sentNetCents}.`);
    this.name = "BasketChangedError";
    this.derivedNetCents = derivedNetCents;
  }
}

/**
 * After a failed change the provider may be ahead of the database: puts it on the amount the database says it should bill.
 * Best effort, since the provider is the thing that may be failing; a failure here is logged and the flag for staff stands.
 */
async function putProviderOnDatabaseAmount(deps: BasketDeps, subscriptionId: string, netCents: number | null): Promise<void> {
  if (netCents === null || netCents <= 0) return;
  try {
    const subscription = await findSubscriptionById(deps.staffDb, subscriptionId);
    if (subscription === null || subscription.provider === "manual") return;
    const plan = await findPlanById(deps.staffDb, subscription.planId);
    if (plan === null) throw new Error(`Subscription ${subscriptionId} has no plan to bill.`);
    await moveProviderTo(deps, subscription, plan, netCents);
  } catch (error) {
    logBillingEvent("error", "basket-provider-repair-failed", { subscriptionId, ...describeError(error) });
  }
}

/**
 * Tells staff a change to a subscription's monthly amount did not go through cleanly, where they already look: the
 * subscription's payment list. Never throws: it runs in a failure path that must still return its result.
 */
async function flagForStaff(deps: BasketDeps, fields: { readonly businessId: string; readonly subscriptionId: string }, now: Date): Promise<void> {
  try {
    await flagSubscriptionForAttention(deps.staffDb, { ...fields, reason: "add_on_provider_pending", now });
  } catch (error) {
    logBillingEvent("error", "basket-flag-failed", { ...fields, ...describeError(error) });
  }
}

/** What a business sees about adding one add-on, for the page and the staff console. */
export type AddOnAssessment =
  /** It cannot add it on its own, and why. */
  | { readonly kind: "blocked"; readonly reason: AddOnBlock }
  /** It could, but not now: the renewal is due, or the subscription is at a provider that is not the one in use. */
  | { readonly kind: "unavailable"; readonly reason: "renewal-due" | "provider-not-ready" }
  /** It is ending: adding it keeps it, at no charge, since the month is paid. */
  | { readonly kind: "keep"; readonly row: BundledAddOn }
  | {
      readonly kind: "offer";
      readonly quote: AddOnQuote;
      /** The service as a line of the basket once added: list, the package offer it earns, and the net it is billed at. */
      readonly line: PackageLine;
      readonly periodStart: Date;
      readonly plan: Plan;
      readonly subscription: Subscription;
    };

export interface AddOnAssessmentInput {
  readonly state: BillingState;
  /** The subscription's add-ons that are `pending` or `active`. */
  readonly live: readonly BundledAddOn[];
  readonly addOn: MonthlyAddOnId;
  /** Whether the business has dropped a service from a package, which ends package prices for good. */
  readonly forfeited: boolean;
  readonly providerName: BillingProvider["name"];
  readonly now: Date;
}

/**
 * Whether a business can add an add-on now, and at what price. Pure: every input is a read the caller has made, so the
 * page and the transaction that opens the add (which reads again under the lock) use the very same rules.
 */
export function assessAddOn(input: AddOnAssessmentInput): AddOnAssessment {
  const { state, now } = input;
  const subscription = state.subscription;
  const active = input.live.find((row) => row.addOn === input.addOn && row.status === "active");
  const block = addOnBlock({
    hasSubscription: subscription !== null,
    provider: subscription?.provider ?? null,
    status: subscription?.status ?? null,
    hasAccess: hasBillingAccess(subscription, now),
    hasEverPaid: state.hasEverPaid,
    cancelRequested: subscription?.cancelRequestedAt != null,
    paymentUnderReview: state.paymentUnderReview,
    addOnActive: active !== undefined && active.endRequestedAt === null,
  });
  if (block !== null) return { kind: "blocked", reason: block };
  if (subscription === null || state.plan === null || subscription.paidThroughAt === null) return { kind: "blocked", reason: "unpaid" };
  if (subscription.provider !== input.providerName) return { kind: "unavailable", reason: "provider-not-ready" };
  if (active !== undefined) return { kind: "keep", row: active };

  const period = billingPeriodProgress(subscription, now);
  if (period === null) return { kind: "unavailable", reason: "renewal-due" };
  const plan = state.plan;
  // The basket once it is added: the lines staying in it share one package percentage (none for a single service or once
  // the offer is given up). The new line and every line already there move to it; a referral code's discount ends.
  const staying = stayingLines(input.live);
  const line = packageLineWith({ services: servicesOf(staying), forfeited: input.forfeited }, input.addOn, plan.currency);
  const renewalNetCents =
    plan.recurringAmountCents + line.netCents + totalNetCents(repriced(staying, [...servicesOf(staying), input.addOn], input.forfeited));
  const quote = quoteAddOn({
    netCents: line.netCents,
    taxRateBasisPoints: plan.taxRateBasisPoints,
    renewalNetCents,
    renewalDiscountCents: staying.length === 0 ? subscription.discountAmountCents : 0,
    period: { start: period.start, end: subscription.paidThroughAt },
    now,
  });
  if (quote.kind === "refused") return { kind: "unavailable", reason: quote.reason };
  return { kind: "offer", quote, line, periodStart: period.start, plan, subscription };
}

/** The reads an assessment needs, on any connection that can see the business. Null when it is not visible. */
export async function readAddOnAssessment(
  db: Database | ScopedTransaction,
  input: { readonly businessId: string; readonly addOn: MonthlyAddOnId; readonly providerName: BillingProvider["name"]; readonly now: Date },
): Promise<AddOnAssessment | null> {
  const state = await findBillingState(db, input.businessId);
  if (state === null) return null;
  const live =
    state.subscription === null
      ? []
      : (await findBundledAddOnsForSubscription(db, state.subscription.id)).filter((row) => row.status !== "removed");
  const forfeited = await isPackageOfferForfeited(db, input.businessId);
  return assessAddOn({ state, live, addOn: input.addOn, forfeited, providerName: input.providerName, now: input.now });
}

/** "Social Media and Ads, 05 Nov to 18 Nov 2026": what the charge and its invoice line say. */
export function addOnChargeDescription(addOn: MonthlyAddOnId, from: Date, periodEnd: Date): string {
  return `${addOnById(addOn).title}, ${servicePeriod(from, periodEnd)}`;
}

/** What the provider step after a paid add came to. */
export type BasketMove =
  /** The provider will bill the new amount from the next renewal. */
  | { readonly kind: "scheduled" }
  /** A bank-transfer subscription has no provider to tell: staff bill the new amount by hand. */
  | { readonly kind: "manual" }
  /** No paid add is waiting for the provider (already told, or never paid). */
  | { readonly kind: "nothing" }
  /** The provider would not do it. The add-on is on; staff retry it from the client page. */
  | { readonly kind: "failed" };

/**
 * The step after the money: tells the provider to bill the plan with its new add-ons from the next renewal, and stamps the
 * add-ons it covered. Runs after the payment's transaction has committed, never inside it; the client has the add-on
 * whatever happens here. Safe to run again: it only acts while an added add-on is waiting to be scheduled. A failure is
 * logged and flags the add-on's payment for staff.
 */
export async function moveBasketAtProvider(deps: BasketDeps, subscriptionId: string, now: Date): Promise<BasketMove> {
  const { staffDb } = deps;
  const subscription = await findSubscriptionById(staffDb, subscriptionId);
  if (subscription === null || subscription.pendingBundledAddOnNetCents === null) return { kind: "nothing" };
  const waiting = (await findBundledAddOnsForSubscription(staffDb, subscriptionId)).filter(
    (row) => row.status === "active" && row.billedFrom === null && row.providerScheduledAt === null,
  );
  if (waiting.length === 0) return { kind: "nothing" };
  if (subscription.provider === "manual") return { kind: "manual" };

  const fields = { businessId: subscription.businessId, subscriptionId, provider: subscription.provider };
  try {
    const plan = await findPlanById(staffDb, subscription.planId);
    if (plan === null) throw new Error(`Subscription ${subscriptionId} has no plan to bill.`);
    // The basket as it now stands is one package: every line that is staying moves to the percentage its set earns from the
    // next bill, and the provider is told the sum of those nets. The lines are recorded after the provider has agreed, the
    // way a removal is, so a provider that refuses leaves the lines as they were and this step can run again.
    const sent = packageMove(await findBundledAddOnsForSubscription(staffDb, subscriptionId), await isPackageOfferForfeited(staffDb, subscription.businessId));
    if (sent.staying === 0) throw new BasketChangedError(subscriptionId, 0, null);
    await moveProviderTo(deps, subscription, plan, sent.netCents);
    await staffDb.transaction(async (tx) => {
      await lockBusinessForBilling(tx, subscription.businessId);
      // Another change may have landed since the lines were read: what is recorded must be what the provider was told.
      const current = packageMove(await findBundledAddOnsForSubscription(tx, subscriptionId), await isPackageOfferForfeited(tx, subscription.businessId));
      if (current.staying === 0 || current.netCents !== sent.netCents) {
        throw new BasketChangedError(subscriptionId, sent.netCents, current.staying === 0 ? null : current.netCents);
      }
      await setPendingOfferDiscounts(tx, { subscriptionId, lines: current.moves, now });
      await markBundledAddOnsScheduled(tx, { subscriptionId, now });
    });
    return { kind: "scheduled" };
  } catch (error) {
    logBillingEvent("error", "add-on-provider-failed", { ...fields, ...describeError(error) });
    if (error instanceof BasketChangedError) await putProviderOnDatabaseAmount(deps, subscriptionId, error.derivedNetCents);
    for (const row of waiting) {
      const charge = row.chargeId === null ? null : await findChargeForBusiness(staffDb, subscription.businessId, row.chargeId);
      if (charge?.paymentId != null) {
        await flagPaymentForAttention(staffDb, { paymentId: charge.paymentId, businessId: subscription.businessId, reason: "add_on_provider_pending", now });
      }
    }
    // An add too small to charge (under ₹1) has no payment of its own to flag: the subscription's is flagged instead.
    if (waiting.some((row) => row.chargeId === null)) await flagForStaff(deps, { businessId: subscription.businessId, subscriptionId }, now);
    return { kind: "failed" };
  }
}

/** The provider step for the add-on a charge paid for, if it was one: what every charge payment path calls after committing. */
export async function finishAddOnAfterPayment(deps: BasketDeps, input: { readonly businessId: string; readonly chargeId: string; readonly now: Date }): Promise<BasketMove> {
  const row = await findBundledAddOnByCharge(deps.staffDb, input.chargeId);
  if (row === null || row.businessId !== input.businessId || row.status !== "active") return { kind: "nothing" };
  return moveBasketAtProvider(deps, row.subscriptionId, input.now);
}

/** What asking to add an add-on came to. */
export type AddOnStart =
  /** A charge to pay: send the customer to pay it. */
  | { readonly kind: "pay"; readonly chargeId: string }
  /** Nothing to take: the add-on is on, and the provider step has run. */
  | { readonly kind: "added"; readonly move: BasketMove }
  /** It was ending and now stays, at no charge. */
  | { readonly kind: "kept" }
  | { readonly kind: "refused"; readonly assessment: Exclude<AddOnAssessment, { kind: "offer" } | { kind: "keep" }> }
  /** The subscription changed between the reading and the lock, or the provider refused to keep it: ask again. */
  | { readonly kind: "changed" };

/**
 * Adds an add-on, from a fresh reading of the business's billing under its lock: the assessment the page showed is never
 * trusted. An open charge for the same add-on and the same month at the same amount is reused, so pressing Add twice finds
 * the same charge. An ending add-on is kept instead (the provider is moved back first).
 */
export async function startAddOn(
  deps: BasketDeps,
  input: { readonly businessId: string; readonly addOn: MonthlyAddOnId; readonly staffId: string | null; readonly now: Date },
): Promise<AddOnStart> {
  const { staffDb, provider } = deps;
  let opened: { readonly kind: "pay"; readonly chargeId: string } | { readonly kind: "added"; readonly subscriptionId: string } | { readonly kind: "keep"; readonly row: BundledAddOn } | Extract<AddOnStart, { kind: "refused" }>;
  try {
    opened = await staffDb.transaction(async (tx) => {
      await lockBusinessForBilling(tx, input.businessId);
      const assessment = await readAddOnAssessment(tx, { businessId: input.businessId, addOn: input.addOn, providerName: provider.name, now: input.now });
      if (assessment === null) return { kind: "refused", assessment: { kind: "blocked", reason: "unpaid" } } as const;
      if (assessment.kind === "keep") return { kind: "keep", row: assessment.row } as const;
      if (assessment.kind !== "offer") return { kind: "refused", assessment } as const;

      const { quote, subscription, plan } = assessment;
      const waiting = (await findBundledAddOnsForSubscription(tx, subscription.id)).find((row) => row.addOn === input.addOn && row.status === "pending");
      if (waiting?.chargeId != null && waiting.quotedPeriodEnd?.getTime() === quote.periodEnd.getTime()) {
        const charge = await findChargeForBusiness(tx, input.businessId, waiting.chargeId);
        if (charge !== null && charge.status === "open" && charge.amountCents === quote.chargeCents) return { kind: "pay", chargeId: charge.id } as const;
      }
      const added = await openBundledAddOn(tx, {
        businessId: input.businessId,
        subscriptionId: subscription.id,
        addOn: input.addOn,
        listAmountCents: assessment.line.listCents,
        offerDiscountAmountCents: assessment.line.discountCents,
        taxRateBasisPoints: plan.taxRateBasisPoints,
        currency: plan.currency,
        netCents: quote.netCents,
        chargeCents: quote.chargeCents,
        quotedPeriodEnd: quote.periodEnd,
        description: addOnChargeDescription(input.addOn, input.now, quote.periodEnd),
        staffId: input.staffId,
        now: input.now,
      });
      return added.chargeId === null ? ({ kind: "added", subscriptionId: subscription.id } as const) : ({ kind: "pay", chargeId: added.chargeId } as const);
    });
  } catch (error) {
    if (error instanceof BundledAddOnNotPossibleError) return { kind: "changed" };
    throw error;
  }
  if (opened.kind === "added") return { kind: "added", move: await moveBasketAtProvider(deps, opened.subscriptionId, input.now) };
  if (opened.kind === "keep") return (await keepBundledAddOnFor(deps, input.businessId, opened.row, input.now)) ? { kind: "kept" } : { kind: "changed" };
  return opened;
}

/** The subscription and plan an active add-on rides on, as long as it is still live and billed. */
async function liveBasket(
  deps: BasketDeps,
  businessId: string,
  pick: (row: BundledAddOn) => boolean,
): Promise<{ readonly row: BundledAddOn; readonly live: readonly BundledAddOn[]; readonly subscription: Subscription; readonly plan: Plan } | null> {
  return deps.staffDb.transaction(async (tx) => {
    await lockBusinessForBilling(tx, businessId);
    const live = await findLiveBundledAddOns(tx, businessId);
    const row = live.find((candidate) => candidate.status === "active" && pick(candidate));
    if (row === undefined) return null;
    const subscription = await findSubscriptionById(tx, row.subscriptionId);
    if (subscription === null || subscription.businessId !== businessId || subscription.activatedAt === null || subscription.status === "cancelled") return null;
    const plan = await findPlanById(tx, subscription.planId);
    if (plan === null || subscription.paidThroughAt === null) return null;
    return { row, live: live.filter((candidate) => candidate.subscriptionId === subscription.id), subscription, plan };
  });
}

/**
 * Keeps an ending add-on: the provider is moved back to the amount with it, then the request to stop is cleared. An ending
 * add-on means a service was dropped, which ended the package offer for good, so the kept one goes to list from the next bill
 * like the others.
 */
async function keepBundledAddOnFor(deps: BasketDeps, businessId: string, ending: BundledAddOn, now: Date): Promise<boolean> {
  const basket = await liveBasket(deps, businessId, (row) => row.id === ending.id && row.endRequestedAt !== null);
  if (basket === null) return false;
  const { row, live, subscription, plan } = basket;
  const keptNetCents = netWithKept(live, row.id);
  const fields = { businessId, subscriptionId: subscription.id, addOn: row.addOn };
  try {
    if (subscription.provider !== "manual") await moveProviderTo(deps, subscription, plan, keptNetCents);
  } catch (error) {
    logBillingEvent("error", "bundled-add-on-keep-failed", { ...fields, stage: "provider", ...describeError(error) });
    return false;
  }
  try {
    return await deps.staffDb.transaction(async (tx) => {
      await lockBusinessForBilling(tx, businessId);
      // The provider was told the amount with this line kept; if the basket has moved since, that is no longer the amount.
      const fresh = await findBundledAddOnsForSubscription(tx, subscription.id);
      if (netWithKept(fresh, row.id) !== keptNetCents) {
        throw new BasketChangedError(subscription.id, keptNetCents, packageMove(fresh, await isPackageOfferForfeited(tx, businessId)).netCents);
      }
      const kept = await keepBundledAddOn(tx, { id: row.id, businessId, now });
      if (kept) await setPendingOfferDiscounts(tx, { subscriptionId: subscription.id, lines: [{ id: row.id, pendingOfferDiscountAmountCents: 0 }], now });
      return kept;
    });
  } catch (error) {
    logBillingEvent("error", "bundled-add-on-keep-failed", { ...fields, stage: "record", ...describeError(error) });
    if (error instanceof BasketChangedError) await putProviderOnDatabaseAmount(deps, subscription.id, error.derivedNetCents);
    await flagForStaff(deps, fields, now);
    return false;
  }
}

/** The next bill's net with `keepId` taken off its way out and put at list, as a keep records it. */
function netWithKept(rows: readonly BundledAddOn[], keepId: string): number {
  return nextBundledNetCents(rows.map((candidate) => (candidate.id === keepId ? { ...candidate, endRequestedAt: null, pendingOfferDiscountAmountCents: 0 } : candidate)));
}

/** What taking an add-on out of the plan's payment came to. */
export type BundledRemoval =
  | { readonly kind: "scheduled"; readonly endsOn: Date }
  /** It is not in the plan's payment (any more), or is already going. */
  | { readonly kind: "not-in-plan" }
  /** It is the only service the subscription has: stopping it is cancelling, which is the exit flow, not a removal. */
  | { readonly kind: "last-service" }
  /** The account has asked to close: the services all stop at the next billing date anyway, so none is taken out on its own. */
  | { readonly kind: "cancel-requested" }
  /** The provider refused, or the request could not be recorded. */
  | { readonly kind: "failed" };

/**
 * Drops a service from the plan's monthly payment from the next billing date. It stays active and paid for until then.
 * Dropping one while two or more are active ends the package offer for good (plan 16): every service that stays is priced
 * at list from the next bill, the business never earns a package price again, and the subscription's ad credit is 0 from the
 * moment the drop is recorded. Dropping the only service is refused: that is cancelling. So is dropping any while the account
 * has asked to close (a cancel is requested): everything is going at the next billing date, and a drop would only change
 * what the provider is told for a subscription that is ending.
 *
 * The provider is moved to a plan at the new amount first, for the cycle end, and our record follows in one transaction:
 * if the provider refuses nothing here changes. If our record cannot then be written the provider is ahead of us, which is
 * flagged for staff because the next renewal would arrive at an amount we do not expect. The lines are read again under the
 * lock before anything is recorded: when another change has landed since the provider was told (a second removal, a paid
 * add), nothing is written, the provider is put on the amount the database holds, staff are flagged and the result is
 * `failed`, so trying again prices the basket as it now stands. Everything comes from the database, under the business's
 * lock; the caller names only the service.
 */
export async function removeBundledAddOn(deps: BasketDeps, input: { readonly businessId: string; readonly addOn: MonthlyAddOnId; readonly now: Date }): Promise<BundledRemoval> {
  const { businessId, addOn, now } = input;
  const basket = await liveBasket(deps, businessId, (row) => row.addOn === addOn && row.endRequestedAt === null);
  if (basket === null) return { kind: "not-in-plan" };
  const { row, live, subscription, plan } = basket;
  if (subscription.cancelRequestedAt !== null) return { kind: "cancel-requested" };
  const sent = removalOf(live, row.id);
  if (sent.kept.length === 0) return { kind: "last-service" };
  const fields = { businessId, subscriptionId: subscription.id, addOn };

  try {
    if (subscription.provider !== "manual") await moveProviderTo(deps, subscription, plan, sent.remainingNetCents);
  } catch (error) {
    logBillingEvent("error", "bundled-add-on-removal-failed", { ...fields, stage: "provider", ...describeError(error) });
    return { kind: "failed" };
  }

  try {
    const recorded = await deps.staffDb.transaction(async (tx) => {
      await lockBusinessForBilling(tx, businessId);
      // The provider was told what the lines read before the lock add up to. Another change may have landed since (a second
      // removal, a paid add), so what is recorded comes from a fresh reading, and it must come to the same amount.
      const fresh = await findBundledAddOnsForSubscription(tx, subscription.id);
      const current = removalOf(fresh, row.id);
      if (current.kept.length === 0 || current.remainingNetCents !== sent.remainingNetCents) {
        throw new BasketChangedError(subscription.id, sent.remainingNetCents, packageMove(fresh, await isPackageOfferForfeited(tx, businessId)).netCents);
      }
      const removed = await recordBundledAddOnRemoval(tx, { id: row.id, businessId, pendingBundledAddOnNetCents: current.remainingNetCents, now });
      if (removed) await endPackageOffer(tx, { businessId, subscriptionId: subscription.id, lines: current.toList, now });
      return removed;
    });
    if (!recorded) return { kind: "not-in-plan" };
  } catch (error) {
    logBillingEvent("error", "bundled-add-on-removal-failed", { ...fields, stage: "record", ...describeError(error) });
    if (error instanceof BasketChangedError) await putProviderOnDatabaseAmount(deps, subscription.id, error.derivedNetCents);
    await flagForStaff(deps, fields, now);
    return { kind: "failed" };
  }
  return { kind: "scheduled", endsOn: subscription.paidThroughAt ?? now };
}

/**
 * What taking `removingId` out leaves: the lines that stay, their list prices added up (every line that stays is at list
 * from the next bill, since the offer is gone for good) and the moves to list for the ones not there already. A line already
 * at list with nothing pending (a business that had given the offer up) has nothing to move.
 */
function removalOf(rows: readonly BundledAddOn[], removingId: string): { readonly kept: readonly BundledAddOn[]; readonly remainingNetCents: number; readonly toList: readonly PendingOfferDiscount[] } {
  const kept = stayingLines(rows).filter((candidate) => candidate.id !== removingId);
  const toList = kept
    .filter((line) => line.pendingOfferDiscountAmountCents !== null || line.offerDiscountAmountCents !== 0)
    .map((line) => ({ id: line.id, pendingOfferDiscountAmountCents: 0 }));
  return { kept, remainingNetCents: listTotalCents(kept), toList };
}
