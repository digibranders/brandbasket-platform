import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { bundledAddOns, providerBundlePlans, subscriptions, type BillingProviderName, type BundledAddOn } from "../schema";
import { isUuid } from "./tenant";

/** Reads run both on their own and inside a tenant-scoped transaction, so they accept either runner. */
type Runner = Database | ScopedTransaction;

/** One add-on taken at the first checkout, priced as the checkout froze it. */
export interface NewBundledAddOn {
  /** A monthly add-on id from the catalogue. */
  readonly addOn: string;
  readonly listAmountCents: number;
  /** The 5% lifetime offer taken off the list price. */
  readonly offerDiscountAmountCents: number;
  readonly netAmountCents: number;
  readonly taxRateBasisPoints: number;
}

/** The monthly price of a set of bundled add-ons before GST: what is added to the plan's net price. */
export function bundledNetCents(items: readonly Pick<NewBundledAddOn, "netAmountCents">[]): number {
  return items.reduce((total, item) => total + item.netAmountCents, 0);
}

/**
 * Records the add-ons a checkout was opened with, as `pending` until the first payment is recorded. Staff connection, in
 * the transaction that inserts the subscription they ride on.
 */
export async function insertBundledAddOns(
  db: Runner,
  input: { readonly businessId: string; readonly subscriptionId: string; readonly items: readonly NewBundledAddOn[] },
): Promise<void> {
  if (input.items.length === 0) return;
  await db.insert(bundledAddOns).values(
    input.items.map((item) => ({
      businessId: input.businessId,
      subscriptionId: input.subscriptionId,
      addOn: item.addOn,
      listAmountCents: item.listAmountCents,
      offerDiscountAmountCents: item.offerDiscountAmountCents,
      netAmountCents: item.netAmountCents,
      taxRateBasisPoints: item.taxRateBasisPoints,
    })),
  );
}

/** The add-ons a subscription was opened with, in the order they were added, whatever their status. */
export async function findBundledAddOnsForSubscription(db: Runner, subscriptionId: string): Promise<readonly BundledAddOn[]> {
  if (!isUuid(subscriptionId)) return [];
  return db
    .select()
    .from(bundledAddOns)
    .where(eq(bundledAddOns.subscriptionId, subscriptionId))
    .orderBy(asc(bundledAddOns.createdAt), asc(bundledAddOns.id));
}

/**
 * The business's bundled add-ons that are being billed or about to be (`pending` or `active`), newest subscription
 * last. Staff connection, or the owner's own scope.
 */
export async function findLiveBundledAddOns(db: Runner, businessId: string): Promise<readonly BundledAddOn[]> {
  if (!isUuid(businessId)) return [];
  return db
    .select()
    .from(bundledAddOns)
    .where(and(eq(bundledAddOns.businessId, businessId), inArray(bundledAddOns.status, ["pending", "active"])))
    .orderBy(asc(bundledAddOns.createdAt), asc(bundledAddOns.id));
}

/** Turns a subscription's `pending` add-ons `active` and billed, in the transaction that records its first payment. Returns them. */
export async function activateBundledAddOns(
  db: Runner,
  input: { readonly subscriptionId: string; readonly now: Date },
): Promise<readonly BundledAddOn[]> {
  if (!isUuid(input.subscriptionId)) return [];
  const activated = await db
    .update(bundledAddOns)
    .set({ status: "active", activatedAt: input.now, billedFrom: input.now, updatedAt: input.now })
    .where(and(eq(bundledAddOns.subscriptionId, input.subscriptionId), eq(bundledAddOns.status, "pending")))
    .returning();
  // RETURNING has no order of its own, and these become the invoice's lines: keep them in the order they were added.
  return activated.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
}

/**
 * Marks every add-on of a subscription that has not already stopped as removed: the subscription is being ended, either a
 * checkout replaced before anything was paid or a lapsed plan a reactivation replaces. Staff connection, in that transaction.
 */
export async function removeBundledAddOnsOf(db: Runner, input: { readonly subscriptionId: string; readonly now: Date }): Promise<void> {
  if (!isUuid(input.subscriptionId)) return;
  await db
    .update(bundledAddOns)
    .set({ status: "removed", removedAt: input.now, updatedAt: input.now })
    .where(and(eq(bundledAddOns.subscriptionId, input.subscriptionId), inArray(bundledAddOns.status, ["pending", "active"])));
}

/** A base plan at one total net monthly price, at one provider. */
export interface BundlePlanKey {
  readonly planId: string;
  /** The net monthly price the provider plan charges before tax, in minor units. Greater than 0. */
  readonly netMonthlyCents: number;
  readonly provider: BillingProviderName;
}

/** The provider's plan already made for this base plan and monthly amount, or null. Staff connection only. */
export async function findProviderBundlePlan(db: Runner, key: BundlePlanKey): Promise<string | null> {
  if (!isUuid(key.planId)) return null;
  const rows = await db
    .select({ providerPlanId: providerBundlePlans.providerPlanId })
    .from(providerBundlePlans)
    .where(
      and(
        eq(providerBundlePlans.planId, key.planId),
        eq(providerBundlePlans.netMonthlyCents, key.netMonthlyCents),
        eq(providerBundlePlans.provider, key.provider),
      ),
    )
    .limit(1);
  return rows[0]?.providerPlanId ?? null;
}

/**
 * Remembers the provider's plan made for this amount and returns the one to use. Two checkouts making the same plan at
 * once both reach here: the first insert wins and both get its id back; the loser's provider plan is never used.
 */
export async function saveProviderBundlePlan(db: Runner, key: BundlePlanKey & { readonly providerPlanId: string }): Promise<string> {
  await db.insert(providerBundlePlans).values(key).onConflictDoNothing();
  const saved = await findProviderBundlePlan(db, key);
  if (saved === null) throw new Error(`Provider bundle plan for ${key.planId} at ${key.netMonthlyCents} was not saved`);
  return saved;
}

/** Whether a subscription's add-on rows are `pending` or `active`, as ids: used to tell whether a checkout still fits the choice. */
export function bundledAddOnIds(items: readonly Pick<BundledAddOn, "addOn">[]): readonly string[] {
  return items.map((item) => item.addOn).sort();
}


/** Every add-on the business took with its plan, newest subscription first, whatever its status. Staff connection. */
export async function listBundledAddOnsForBusiness(db: Runner, businessId: string): Promise<readonly BundledAddOn[]> {
  if (!isUuid(businessId)) return [];
  return db
    .select()
    .from(bundledAddOns)
    .where(eq(bundledAddOns.businessId, businessId))
    .orderBy(asc(bundledAddOns.createdAt), asc(bundledAddOns.id));
}

/**
 * Records that staff have contacted the customer about an add-on taken with the plan. False when it was already marked or
 * was never paid (still `pending`). Staff connection only.
 */
export async function markBundledAddOnContacted(
  db: Runner,
  input: { readonly id: string; readonly businessId: string; readonly staffUserId: string; readonly now: Date },
): Promise<boolean> {
  if (!isUuid(input.id) || !isUuid(input.businessId)) return false;
  const rows = await db
    .update(bundledAddOns)
    .set({ contactedAt: input.now, contactedByStaffId: input.staffUserId, updatedAt: input.now })
    .where(
      and(
        eq(bundledAddOns.id, input.id),
        eq(bundledAddOns.businessId, input.businessId),
        isNull(bundledAddOns.contactedAt),
        isNotNull(bundledAddOns.activatedAt),
      ),
    )
    .returning({ id: bundledAddOns.id });
  return rows.length > 0;
}

/**
 * What the monthly add-ons cost once `removing` has stopped: the nets of the subscription's other active add-ons that are not
 * already on their way out. The figure the provider's plan is made at, and what `recordBundledAddOnRemoval` stores.
 */
export function bundledNetAfterRemoving(rows: readonly BundledAddOn[], removing: Pick<BundledAddOn, "id">): number {
  return bundledNetCents(
    rows.filter((row) => row.id !== removing.id && row.status === "active" && row.endRequestedAt === null),
  );
}

/**
 * Notes that the customer has asked to remove an add-on taken with the plan, after the provider has been told to move the
 * subscription to the lower amount at the cycle end: the add-on stays active and billed until then, and the subscription
 * carries the amount its next renewal must arrive at. Only a live, unfinished request is written, so a double press changes
 * nothing. False when the add-on is not active or was already asked about. Staff connection, in the business's billing lock.
 */
export async function recordBundledAddOnRemoval(
  db: Runner,
  input: { readonly id: string; readonly businessId: string; readonly pendingBundledAddOnNetCents: number; readonly now: Date },
): Promise<boolean> {
  if (!isUuid(input.id) || !isUuid(input.businessId)) return false;
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(bundledAddOns)
      .set({ endRequestedAt: input.now, updatedAt: input.now })
      .where(
        and(
          eq(bundledAddOns.id, input.id),
          eq(bundledAddOns.businessId, input.businessId),
          eq(bundledAddOns.status, "active"),
          isNull(bundledAddOns.endRequestedAt),
        ),
      )
      .returning({ subscriptionId: bundledAddOns.subscriptionId });
    const subscriptionId = rows[0]?.subscriptionId;
    if (subscriptionId === undefined) return false;
    await tx
      .update(subscriptions)
      .set({ pendingBundledAddOnNetCents: input.pendingBundledAddOnNetCents, updatedAt: input.now })
      .where(eq(subscriptions.id, subscriptionId));
    return true;
  });
}

/**
 * The renewal at the lower amount has been recorded: the add-ons the customer asked to remove stop (`removed`) and the
 * subscription's billed amount becomes the pending one. A no-op for a subscription with no removal waiting. Staff connection,
 * in the transaction that records the renewal.
 */
export async function completeBundledAddOnRemovals(db: Runner, input: { readonly subscriptionId: string; readonly now: Date }): Promise<void> {
  if (!isUuid(input.subscriptionId)) return;
  await db
    .update(bundledAddOns)
    .set({ status: "removed", removedAt: input.now, updatedAt: input.now })
    .where(
      and(eq(bundledAddOns.subscriptionId, input.subscriptionId), eq(bundledAddOns.status, "active"), isNotNull(bundledAddOns.endRequestedAt)),
    );
  await db
    .update(subscriptions)
    .set({ bundledAddOnNetCents: sql`${subscriptions.pendingBundledAddOnNetCents}`, pendingBundledAddOnNetCents: null, updatedAt: input.now })
    .where(and(eq(subscriptions.id, input.subscriptionId), isNotNull(subscriptions.pendingBundledAddOnNetCents)));
}
