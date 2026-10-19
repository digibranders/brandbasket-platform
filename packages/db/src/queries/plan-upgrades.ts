import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import {
  charges,
  planUpgrades,
  subscriptions,
  type BillingCurrency,
  type PlanUpgradeSource,
  type PlanUpgradeStatus,
} from "../schema";
import { isUuid } from "./tenant";

type Runner = Database | ScopedTransaction;

/*
 * A Care client moving up to Premium on the subscription it has (docs/superpowers/specs/2026-10-08-care-to-premium-
 * upgrade-design.md). The quote is worked out by the platform (lib/billing/upgrade.ts in @brandbasket/shared, which this
 * package cannot import); what lives here is the record of it, and the transitions the money drives: the charge is
 * opened with the upgrade, paying it applies the upgrade, and the first renewal at the new price completes it.
 *
 * Every write is on the staff connection, under the business's billing lock (lockBusinessForBilling), like every other
 * billing write.
 */

export interface PlanUpgrade {
  readonly id: string;
  readonly businessId: string;
  readonly subscriptionId: string;
  readonly fromPlanId: string;
  readonly toPlanId: string;
  readonly fromDiscountAmountCents: number;
  readonly toDiscountAmountCents: number;
  /** The end of the paid month the quote was worked out for. */
  readonly periodEnd: Date;
  readonly netDifferenceCents: number;
  readonly chargeCents: number;
  readonly source: PlanUpgradeSource;
  readonly createdByStaffId: string | null;
  readonly chargeId: string | null;
  readonly status: PlanUpgradeStatus;
  readonly providerPlanId: string | null;
  readonly paidAt: Date | null;
  readonly scheduledAt: Date | null;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly createdAt: Date;
}

const UPGRADE_COLUMNS = {
  id: planUpgrades.id,
  businessId: planUpgrades.businessId,
  subscriptionId: planUpgrades.subscriptionId,
  fromPlanId: planUpgrades.fromPlanId,
  toPlanId: planUpgrades.toPlanId,
  fromDiscountAmountCents: planUpgrades.fromDiscountAmountCents,
  toDiscountAmountCents: planUpgrades.toDiscountAmountCents,
  periodEnd: planUpgrades.periodEnd,
  netDifferenceCents: planUpgrades.netDifferenceCents,
  chargeCents: planUpgrades.chargeCents,
  source: planUpgrades.source,
  createdByStaffId: planUpgrades.createdByStaffId,
  chargeId: planUpgrades.chargeId,
  status: planUpgrades.status,
  providerPlanId: planUpgrades.providerPlanId,
  paidAt: planUpgrades.paidAt,
  scheduledAt: planUpgrades.scheduledAt,
  completedAt: planUpgrades.completedAt,
  cancelledAt: planUpgrades.cancelledAt,
  createdAt: planUpgrades.createdAt,
} as const;

/** The statuses in which a move is still under way: one per business at a time. */
const IN_FLIGHT: readonly PlanUpgradeStatus[] = ["open", "paid", "scheduled"];

/** The move in flight for a business (its charge unpaid, or paid and waiting for the renewal), or null. Works through row-level security. */
export async function findPlanUpgradeInFlight(db: Runner, businessId: string): Promise<PlanUpgrade | null> {
  if (!isUuid(businessId)) return null;
  const rows = await db
    .select(UPGRADE_COLUMNS)
    .from(planUpgrades)
    .where(and(eq(planUpgrades.businessId, businessId), inArray(planUpgrades.status, [...IN_FLIGHT])))
    .orderBy(desc(planUpgrades.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** An upgrade by id, or null. */
export async function findPlanUpgradeById(db: Runner, upgradeId: string): Promise<PlanUpgrade | null> {
  if (!isUuid(upgradeId)) return null;
  const rows = await db.select(UPGRADE_COLUMNS).from(planUpgrades).where(eq(planUpgrades.id, upgradeId)).limit(1);
  return rows[0] ?? null;
}

/** The upgrade a charge pays for, or null. */
export async function findPlanUpgradeByCharge(db: Runner, chargeId: string): Promise<PlanUpgrade | null> {
  if (!isUuid(chargeId)) return null;
  const rows = await db.select(UPGRADE_COLUMNS).from(planUpgrades).where(eq(planUpgrades.chargeId, chargeId)).limit(1);
  return rows[0] ?? null;
}

/** A business's upgrades, newest first. */
export async function listPlanUpgradesForBusiness(db: Runner, businessId: string, limit = 20): Promise<PlanUpgrade[]> {
  if (!isUuid(businessId)) return [];
  return db
    .select(UPGRADE_COLUMNS)
    .from(planUpgrades)
    .where(eq(planUpgrades.businessId, businessId))
    .orderBy(desc(planUpgrades.createdAt))
    .limit(limit);
}

/** The quote an upgrade is opened with. The platform works it out; this records it. */
export interface NewPlanUpgrade {
  readonly businessId: string;
  readonly subscriptionId: string;
  readonly fromPlanId: string;
  readonly toPlanId: string;
  readonly fromDiscountAmountCents: number;
  readonly toDiscountAmountCents: number;
  readonly periodEnd: Date;
  readonly netDifferenceCents: number;
  /** What is taken, tax included. Zero when nothing is: the move is applied at once. */
  readonly chargeCents: number;
  /** The charge's tax rate and currency, for the charge row; used only when `chargeCents` is above zero. */
  readonly taxRateBasisPoints: number;
  readonly currency: BillingCurrency;
  /** What the customer reads on the Billing page and the receipt. */
  readonly description: string;
  readonly source: PlanUpgradeSource;
  readonly staffId: string | null;
  readonly now: Date;
}

/** Why an upgrade cannot be opened or applied against the subscription as it now stands. */
export class PlanUpgradeNotPossibleError extends Error {
  readonly reason: "no-subscription" | "plan-changed" | "already-moving" | "not-live";

  constructor(reason: PlanUpgradeNotPossibleError["reason"]) {
    super(`The upgrade could not be opened: ${reason}.`);
    this.name = "PlanUpgradeNotPossibleError";
    this.reason = reason;
  }
}

interface SubscriptionRow {
  readonly id: string;
  readonly planId: string;
  readonly status: string;
  readonly paidThroughAt: Date | null;
  readonly pendingPlanId: string | null;
  readonly cancelRequestedAt: Date | null;
}

async function lockSubscription(tx: ScopedTransaction, subscriptionId: string): Promise<SubscriptionRow | null> {
  const rows = await tx
    .select({
      id: subscriptions.id,
      planId: subscriptions.planId,
      status: subscriptions.status,
      paidThroughAt: subscriptions.paidThroughAt,
      pendingPlanId: subscriptions.pendingPlanId,
      cancelRequestedAt: subscriptions.cancelRequestedAt,
    })
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1)
    .for("update");
  return rows[0] ?? null;
}

/** Whether the subscription is in the state the quote was worked out for. */
function stillQuotedFor(subscription: SubscriptionRow, upgrade: Pick<NewPlanUpgrade, "fromPlanId" | "periodEnd">): boolean {
  return (
    subscription.planId === upgrade.fromPlanId &&
    subscription.pendingPlanId === null &&
    subscription.status === "active" &&
    subscription.cancelRequestedAt === null &&
    subscription.paidThroughAt !== null &&
    subscription.paidThroughAt.getTime() === upgrade.periodEnd.getTime()
  );
}

async function setPendingPlan(
  tx: ScopedTransaction,
  input: { readonly subscriptionId: string; readonly planId: string; readonly discountAmountCents: number },
): Promise<void> {
  await tx
    .update(subscriptions)
    .set({ pendingPlanId: input.planId, pendingDiscountAmountCents: input.discountAmountCents })
    .where(eq(subscriptions.id, input.subscriptionId));
}

export interface OpenedPlanUpgrade {
  readonly upgrade: PlanUpgrade;
  /** The charge to pay, or null when the move was applied with nothing to take. */
  readonly chargeId: string | null;
}

/**
 * Cancels the move still open for a business: it is marked cancelled and its unpaid charge waived (with no staff
 * member, as an ad spot's is), so it can no longer be paid. Returns the upgrade it cancelled, or null when none was
 * open. A move that has been paid is not cancelled by this. Staff connection, inside the caller's transaction.
 */
export async function cancelOpenPlanUpgrade(tx: ScopedTransaction, businessId: string, now: Date): Promise<PlanUpgrade | null> {
  const open = await tx
    .select(UPGRADE_COLUMNS)
    .from(planUpgrades)
    .where(and(eq(planUpgrades.businessId, businessId), eq(planUpgrades.status, "open")))
    .limit(1)
    .for("update");
  const upgrade = open[0];
  if (upgrade === undefined) return null;
  await tx.update(planUpgrades).set({ status: "cancelled", cancelledAt: now, updatedAt: now }).where(eq(planUpgrades.id, upgrade.id));
  if (upgrade.chargeId !== null) {
    await tx
      .update(charges)
      .set({ status: "waived", waivedAt: now })
      .where(and(eq(charges.id, upgrade.chargeId), eq(charges.status, "open")));
  }
  return { ...upgrade, status: "cancelled", cancelledAt: now };
}

/**
 * Opens the move, in one transaction under the caller's billing lock. The subscription must still be the one the quote
 * was worked out for. A move with a charge is left `open` with that charge to pay, replacing any earlier open one; one
 * with nothing to take (a share too small for the provider, or staff moving a client) is applied at once: the
 * subscription's pending plan is set and the upgrade is `paid`. Throws PlanUpgradeNotPossibleError when the
 * subscription has changed since the quote, or another move has been paid and is waiting for its renewal.
 */
export async function openPlanUpgrade(tx: ScopedTransaction, input: NewPlanUpgrade): Promise<OpenedPlanUpgrade> {
  const subscription = await lockSubscription(tx, input.subscriptionId);
  if (subscription === null) throw new PlanUpgradeNotPossibleError("no-subscription");
  if (subscription.pendingPlanId !== null) throw new PlanUpgradeNotPossibleError("already-moving");
  if (!stillQuotedFor(subscription, input)) {
    throw new PlanUpgradeNotPossibleError(subscription.planId === input.fromPlanId ? "not-live" : "plan-changed");
  }

  // A move that was paid on an earlier subscription (it ended, and the business came back on a new one) is over with
  // it: it would otherwise hold the one-in-flight rule against a move on this subscription for ever.
  await tx
    .update(planUpgrades)
    .set({ status: "cancelled", cancelledAt: input.now, updatedAt: input.now })
    .where(
      and(
        eq(planUpgrades.businessId, input.businessId),
        inArray(planUpgrades.status, ["paid", "scheduled"]),
        ne(planUpgrades.subscriptionId, input.subscriptionId),
      ),
    );
  // An earlier open quote is replaced: its price was for a different moment, and only one move is in flight.
  await cancelOpenPlanUpgrade(tx, input.businessId, input.now);

  const common = {
    businessId: input.businessId,
    subscriptionId: input.subscriptionId,
    fromPlanId: input.fromPlanId,
    toPlanId: input.toPlanId,
    fromDiscountAmountCents: input.fromDiscountAmountCents,
    toDiscountAmountCents: input.toDiscountAmountCents,
    periodEnd: input.periodEnd,
    netDifferenceCents: input.netDifferenceCents,
    chargeCents: input.chargeCents,
    source: input.source,
    createdByStaffId: input.staffId,
  } as const;

  if (input.chargeCents > 0) {
    const insertedCharge = await tx
      .insert(charges)
      .values({
        businessId: input.businessId,
        kind: "plan_upgrade",
        description: input.description,
        quantity: 1,
        unitAmountCents: input.netDifferenceCents,
        taxRateBasisPoints: input.taxRateBasisPoints,
        amountCents: input.chargeCents,
        currency: input.currency,
        createdByStaffId: input.staffId,
      })
      .returning({ id: charges.id });
    const charge = insertedCharge[0];
    if (charge === undefined) throw new Error("Inserting the upgrade's charge returned no row");
    const inserted = await tx.insert(planUpgrades).values({ ...common, chargeId: charge.id }).returning(UPGRADE_COLUMNS);
    const upgrade = inserted[0];
    if (upgrade === undefined) throw new Error("Inserting the plan upgrade returned no row");
    return { upgrade, chargeId: charge.id };
  }

  const inserted = await tx
    .insert(planUpgrades)
    .values({ ...common, chargeId: null, status: "paid", paidAt: input.now })
    .returning(UPGRADE_COLUMNS);
  const upgrade = inserted[0];
  if (upgrade === undefined) throw new Error("Inserting the plan upgrade returned no row");
  await setPendingPlan(tx, {
    subscriptionId: input.subscriptionId,
    planId: input.toPlanId,
    discountAmountCents: input.toDiscountAmountCents,
  });
  return { upgrade, chargeId: null };
}

/**
 * Whether a payment for an upgrade's charge still buys it: the upgrade is open and the subscription is in the state it
 * was quoted for. Called by recordChargePayment before it settles the charge, under the same lock. A charge with no
 * upgrade behind it (it should not exist) does not apply either.
 */
export async function planUpgradeStillApplies(tx: ScopedTransaction, chargeId: string): Promise<boolean> {
  const upgrade = await findPlanUpgradeByCharge(tx, chargeId);
  if (upgrade === null || upgrade.status !== "open") return false;
  const subscription = await lockSubscription(tx, upgrade.subscriptionId);
  return subscription !== null && stillQuotedFor(subscription, upgrade);
}

/**
 * The upgrade's money has arrived and its quote stood: the upgrade becomes `paid` and the subscription's pending plan
 * is set, so the client has Premium from this moment. Runs inside recordChargePayment's transaction, so the payment,
 * the paid charge and the pending plan never disagree. Returns the upgrade, or null when there is none to apply.
 */
export async function applyPaidPlanUpgrade(tx: ScopedTransaction, chargeId: string, paidAt: Date): Promise<PlanUpgrade | null> {
  const upgrade = await findPlanUpgradeByCharge(tx, chargeId);
  if (upgrade === null || upgrade.status !== "open") return null;
  await tx
    .update(planUpgrades)
    .set({ status: "paid", paidAt, updatedAt: paidAt })
    .where(eq(planUpgrades.id, upgrade.id));
  await setPendingPlan(tx, {
    subscriptionId: upgrade.subscriptionId,
    planId: upgrade.toPlanId,
    discountAmountCents: upgrade.toDiscountAmountCents,
  });
  return { ...upgrade, status: "paid", paidAt };
}

/**
 * A payment for an upgrade whose quote no longer stood: nothing changes for the subscription, the upgrade is cancelled
 * and its charge waived, so the money, kept on record and flagged, is for staff to refund. Inside the caller's
 * transaction.
 */
export async function cancelStalePlanUpgrade(tx: ScopedTransaction, chargeId: string, now: Date): Promise<void> {
  const upgrade = await findPlanUpgradeByCharge(tx, chargeId);
  if (upgrade === null) return;
  await tx
    .update(planUpgrades)
    .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
    .where(and(eq(planUpgrades.id, upgrade.id), eq(planUpgrades.status, "open")));
}

/** The provider has been told to bill the new plan from the next renewal. A `paid` upgrade becomes `scheduled`. */
export async function markPlanUpgradeScheduled(
  db: Runner,
  input: { readonly upgradeId: string; readonly providerPlanId: string | null; readonly now: Date },
): Promise<boolean> {
  if (!isUuid(input.upgradeId)) return false;
  const rows = await db
    .update(planUpgrades)
    .set({ status: "scheduled", providerPlanId: input.providerPlanId, scheduledAt: input.now, updatedAt: input.now })
    .where(and(eq(planUpgrades.id, input.upgradeId), eq(planUpgrades.status, "paid")))
    .returning({ id: planUpgrades.id });
  return rows.length > 0;
}

export interface RenewalAtNewPrice {
  readonly subscriptionId: string;
  readonly now: Date;
}

/**
 * The renewal arrived at the new plan's price: the subscription now names that plan, with the discount that carried
 * over, the stay offer ended with the old plan, and the pending plan is cleared; the upgrade is `completed`. A
 * subscription with no pending plan is left alone and false is returned. Inside the webhook's transaction, under the
 * business's billing lock.
 */
export async function completePlanUpgradeAtRenewal(tx: ScopedTransaction, input: RenewalAtNewPrice): Promise<boolean> {
  const rows = await tx
    .select({
      pendingPlanId: subscriptions.pendingPlanId,
      pendingDiscountAmountCents: subscriptions.pendingDiscountAmountCents,
    })
    .from(subscriptions)
    .where(eq(subscriptions.id, input.subscriptionId))
    .limit(1)
    .for("update");
  const subscription = rows[0];
  if (subscription === undefined || subscription.pendingPlanId === null) return false;
  await tx
    .update(subscriptions)
    .set({
      planId: subscription.pendingPlanId,
      discountAmountCents: subscription.pendingDiscountAmountCents,
      retentionDiscountCents: 0,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
    })
    .where(eq(subscriptions.id, input.subscriptionId));
  await tx
    .update(planUpgrades)
    .set({ status: "completed", completedAt: input.now, updatedAt: input.now })
    .where(and(eq(planUpgrades.subscriptionId, input.subscriptionId), inArray(planUpgrades.status, ["paid", "scheduled"])));
  return true;
}

/** Counts of upgrades by status, for staff and tests. */
export async function countPlanUpgradesByStatus(db: Runner, businessId: string): Promise<Record<PlanUpgradeStatus, number>> {
  const rows = await db
    .select({ status: planUpgrades.status, count: sql<number>`count(*)`.mapWith(Number) })
    .from(planUpgrades)
    .where(eq(planUpgrades.businessId, businessId))
    .groupBy(planUpgrades.status);
  const counts: Record<PlanUpgradeStatus, number> = { open: 0, paid: 0, scheduled: 0, completed: 0, cancelled: 0 };
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}
