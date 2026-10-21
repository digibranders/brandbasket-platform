import { asc, desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { findActivePlan, PLAN_COLUMNS, type Plan } from "./billing";
import { planPriceChanges, plans, users, type BillingCurrency, type PlanPriceField, type PlanTier } from "../schema";

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

/** A currency with no active plan: there are no extras to reprice. */
export class NoActivePlanError extends Error {
  readonly currency: BillingCurrency;

  constructor(currency: BillingCurrency) {
    super(`There is no active ${currency} plan to reprice.`);
    this.name = "NoActivePlanError";
    this.currency = currency;
  }
}

function assertPrice(cents: number, what: string): void {
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > MAX_PRICE_CENTS) {
    throw new InvalidPriceChangeError(`${what} must be a whole number of minor units between 1 and ${MAX_PRICE_CENTS}`);
  }
}

/** The plans on sale: in the currency enum's order (dollars first), one per currency. */
export async function listActivePlans(db: Runner): Promise<Plan[]> {
  return db.select(PLAN_COLUMNS).from(plans).where(eq(plans.active, true)).orderBy(asc(plans.currency), asc(plans.tier));
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
