import { and, asc, desc, eq, gt, isNull, max, or } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { findActivePlan, PLAN_COLUMNS, type Plan } from "./billing";
import {
  planPriceChanges,
  plans,
  referralCodes,
  users,
  type BillingCurrency,
  type PlanPriceField,
  type PlanTier,
} from "../schema";

type Runner = Database | ScopedTransaction;

/** Largest amount a price may be set to, in minor units: well past any real price, well inside an int4. */
export const MAX_PRICE_CENTS = 100_000_000;

/** A price change that cannot be made. The message says why in words staff can act on. */
export class InvalidPriceChangeError extends Error {
  constructor(reason: string) {
    super(`The price was not changed: ${reason}.`);
    this.name = "InvalidPriceChangeError";
  }
}

/** A currency with no active plan of that tier: there is nothing to reprice. */
export class NoActivePlanError extends Error {
  readonly currency: BillingCurrency;
  readonly tier: PlanTier | null;

  constructor(currency: BillingCurrency, tier: PlanTier | null = null) {
    super(tier === null ? `There is no active ${currency} plan to reprice.` : `There is no active ${currency} ${tier} plan to reprice.`);
    this.name = "NoActivePlanError";
    this.currency = currency;
    this.tier = tier;
  }
}

function assertPrice(cents: number, what: string): void {
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > MAX_PRICE_CENTS) {
    throw new InvalidPriceChangeError(`${what} must be a whole number of minor units between 1 and ${MAX_PRICE_CENTS}`);
  }
}

/** The plans on sale: in the currency enum's order (dollars first), and in each currency Care before Premium. */
export async function listActivePlans(db: Runner): Promise<Plan[]> {
  return db.select(PLAN_COLUMNS).from(plans).where(eq(plans.active, true)).orderBy(asc(plans.currency), asc(plans.tier));
}

/**
 * The largest flat discount any live referral code in `currency` takes off a month. A monthly price must stay above
 * it, or that code would leave nothing (or less than nothing) to charge. Percentage codes are left out: they are at
 * most 99% of whatever the price is, so they scale with it and never take the whole month. Subscriptions already
 * running keep the discount frozen on them at checkout, whichever kind their code was.
 */
export async function largestLiveReferralDiscount(db: Runner, currency: BillingCurrency, now: Date): Promise<number> {
  const rows = await db
    .select({ largest: max(referralCodes.discountAmountCents) })
    .from(referralCodes)
    .where(
      and(
        eq(referralCodes.currency, currency),
        eq(referralCodes.discountKind, "amount"),
        eq(referralCodes.active, true),
        or(isNull(referralCodes.expiresAt), gt(referralCodes.expiresAt, now)),
      ),
    );
  return rows[0]?.largest ?? 0;
}

/** The extra prices staff may set, net of tax, in minor units. A field left out is not changed. */
export interface ExtraPrices {
  readonly extraHourAmountCents?: number;
  readonly extraPublishAmountCents?: number;
  readonly extraBlogPostsAmountCents?: number;
}

const EXTRA_FIELDS = [
  { key: "extraHourAmountCents", field: "extra_hour", what: "The extra hour price" },
  { key: "extraPublishAmountCents", field: "extra_publish", what: "The extra publish price" },
  { key: "extraBlogPostsAmountCents", field: "extra_blog_posts", what: "The blog-post block price" },
] as const satisfies readonly { key: keyof ExtraPrices; field: PlanPriceField; what: string }[];

/**
 * Sets the extra prices for one currency on every plan in it, retired versions included, so a customer on an older
 * monthly price pays the same for extras as everyone else. Safe to edit in place: no subscription or provider plan
 * is priced from these, and a charge already added keeps the price it was made at. Logs each price that changed and
 * returns which ones did. Staff connection only.
 */
export async function updateExtraPrices(
  db: Runner,
  input: { readonly currency: BillingCurrency; readonly prices: ExtraPrices; readonly staffId: string },
): Promise<PlanPriceField[]> {
  for (const { key, what } of EXTRA_FIELDS) {
    const value = input.prices[key];
    if (value !== undefined) assertPrice(value, what);
  }
  return db.transaction(async (tx) => {
    const current = await findActivePlan(tx, input.currency, "managed");
    if (current === null) throw new NoActivePlanError(input.currency);

    const changes = EXTRA_FIELDS.flatMap(({ key, field }) => {
      const value = input.prices[key];
      return value === undefined || value === current[key] ? [] : [{ key, field, oldAmount: current[key], newAmount: value }];
    });
    if (changes.length === 0) return [];

    await tx
      .update(plans)
      .set(Object.fromEntries(changes.map((change) => [change.key, change.newAmount])))
      .where(eq(plans.currency, input.currency));
    await tx.insert(planPriceChanges).values(
      changes.map((change) => ({
        currency: input.currency,
        field: change.field,
        oldAmountCents: change.oldAmount,
        newAmountCents: change.newAmount,
        changedByStaffId: input.staffId,
      })),
    );
    return changes.map((change) => change.field);
  });
}

export interface MonthlyPriceChange {
  readonly currency: BillingCurrency;
  /** Which plan is repriced: Care's monthly price and Premium's are set separately. */
  readonly tier: PlanTier;
  /** The new monthly price before tax, in minor units. */
  readonly netMonthlyCents: number;
  /** The provider's plan for the new price, created first; null for the fake provider, which needs none. */
  readonly providerPlanId: string | null;
  readonly staffId: string;
  readonly now: Date;
}

/**
 * `premium-inr-20261002-093000`: a new plan version's code, unique per tier, currency and second. The staff console
 * records the same code on the provider's plan, so it computes it with this too, from the same moment. Premium
 * versions made before Care existed were coded `care-inr-…`: a code is never rewritten, so those keep it.
 */
export function planVersionCode(currency: BillingCurrency, tier: PlanTier, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `${tier}-${currency.toLowerCase()}-${stamp}`;
}

/**
 * Puts a new monthly price on sale for one plan in one currency: a new plan version at that price (its extras,
 * allowances and tax copied from the current one), with the old version retired in the same transaction. The old row is never edited:
 * subscriptions on it keep their price, and their renewals are still checked against it. New checkouts pick up the
 * new version because it is the active one. Staff connection only.
 */
export async function replaceMonthlyPrice(db: Runner, input: MonthlyPriceChange): Promise<Plan> {
  assertPrice(input.netMonthlyCents, "The monthly price");
  return db.transaction(async (tx) => {
    const locked = await tx
      .select(PLAN_COLUMNS)
      .from(plans)
      .where(and(eq(plans.currency, input.currency), eq(plans.tier, input.tier), eq(plans.active, true)))
      .limit(1)
      .for("update");
    const current = locked[0];
    if (current === undefined) throw new NoActivePlanError(input.currency, input.tier);
    if (current.recurringAmountCents === input.netMonthlyCents) {
      throw new InvalidPriceChangeError("the new monthly price is the same as the current one");
    }

    // Retire first: only one plan per currency and tier may be active at a time.
    await tx.update(plans).set({ active: false }).where(eq(plans.id, current.id));
    const inserted = await tx
      .insert(plans)
      .values({
        code: planVersionCode(input.currency, input.tier, input.now),
        name: current.name,
        currency: current.currency,
        tier: current.tier,
        initialAmountCents: input.netMonthlyCents * current.initialTermMonths,
        initialTermMonths: current.initialTermMonths,
        recurringAmountCents: input.netMonthlyCents,
        includedPublishesPerMonth: current.includedPublishesPerMonth,
        extraPublishAmountCents: current.extraPublishAmountCents,
        includedChangeHours: current.includedChangeHours,
        extraHourAmountCents: current.extraHourAmountCents,
        includedBlogPosts: current.includedBlogPosts,
        blogPostBlockSize: current.blogPostBlockSize,
        extraBlogPostsAmountCents: current.extraBlogPostsAmountCents,
        providerPlanId: input.providerPlanId,
        taxRateBasisPoints: current.taxRateBasisPoints,
        active: true,
      })
      .returning(PLAN_COLUMNS);
    const created = inserted[0];
    if (created === undefined) throw new Error("Inserting the new plan version returned no row");

    await tx.insert(planPriceChanges).values({
      currency: input.currency,
      field: "monthly",
      oldAmountCents: current.recurringAmountCents,
      newAmountCents: input.netMonthlyCents,
      newPlanId: created.id,
      changedByStaffId: input.staffId,
    });
    return created;
  });
}

/**
 * Gives a plan on sale the provider's plan it was missing: a price put on sale by a migration (Care's, Premium's ₹9,999)
 * has no Razorpay plan until staff save it in the console. Only ever fills an empty `provider_plan_id`, never replaces one
 * and never touches a price, so it cannot change what anyone is charged. False when the plan already had one (or is gone).
 */
export async function attachProviderPlan(db: Runner, input: { readonly planId: string; readonly providerPlanId: string }): Promise<boolean> {
  const rows = await db
    .update(plans)
    .set({ providerPlanId: input.providerPlanId })
    .where(and(eq(plans.id, input.planId), isNull(plans.providerPlanId)))
    .returning({ id: plans.id });
  return rows.length > 0;
}

/** One logged price change, with who made it. */
export interface PriceChange {
  readonly id: string;
  readonly currency: BillingCurrency;
  readonly field: PlanPriceField;
  /** The plan a monthly change repriced; null for an extra, which applies to both plans. */
  readonly tier: PlanTier | null;
  readonly oldAmountCents: number;
  readonly newAmountCents: number;
  readonly changedByName: string | null;
  readonly createdAt: Date;
}

/** The latest price changes, newest first. Staff connection only. */
export async function listPriceChanges(db: Runner, limit: number): Promise<PriceChange[]> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("limit must be a positive integer");
  return db
    .select({
      id: planPriceChanges.id,
      currency: planPriceChanges.currency,
      field: planPriceChanges.field,
      tier: plans.tier,
      oldAmountCents: planPriceChanges.oldAmountCents,
      newAmountCents: planPriceChanges.newAmountCents,
      changedByName: users.name,
      createdAt: planPriceChanges.createdAt,
    })
    .from(planPriceChanges)
    .leftJoin(users, eq(users.id, planPriceChanges.changedByStaffId))
    .leftJoin(plans, eq(plans.id, planPriceChanges.newPlanId))
    .orderBy(desc(planPriceChanges.createdAt), desc(planPriceChanges.id))
    .limit(limit);
}
