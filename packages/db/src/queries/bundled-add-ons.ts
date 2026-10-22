import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import {
  bundledAddOns,
  businesses,
  charges,
  providerBundlePlans,
  subscriptions,
  type BillingCurrency,
  type BillingProviderName,
  type BundledAddOn,
} from "../schema";
import { isUuid } from "./tenant";

/** Reads run both on their own and inside a tenant-scoped transaction, so they accept either runner. */
type Runner = Database | ScopedTransaction;

/** One service taken at the first checkout, priced as the checkout froze it. */
export interface NewBundledAddOn {
  /** A service id from the catalogue, the website included. */
  readonly addOn: string;
  readonly listAmountCents: number;
  /** The package offer taken off the list price; 0 for a service bought on its own. */
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

/** A line's net from the next renewal: list less the package offer it is moving to, or its own net when none is pending. */
function nextNetCents(row: BundledAddOn): number {
  return row.pendingOfferDiscountAmountCents === null ? row.netAmountCents : row.listAmountCents - row.pendingOfferDiscountAmountCents;
}

/**
 * What the monthly add-ons cost from the next renewal: the nets of the active add-ons that are not on their way out, those
 * added this month included, each at the package offer it is moving to. The figure the provider's plan is made at.
 */
export function nextBundledNetCents(rows: readonly BundledAddOn[]): number {
  return rows.filter((row) => row.status === "active" && row.endRequestedAt === null).reduce((total, row) => total + nextNetCents(row), 0);
}

/**
 * The lines a renewal invoices, priced to match what it was charged. At the pending amount (the renewal that completes a
 * change) that is every active line that is staying, each at the package offer it is moving to, exactly as
 * nextBundledNetCents sums them; at the amount billed now it is the lines that amount was made of, at their own offers.
 */
export function renewalBundledLines(rows: readonly BundledAddOn[], atPendingAmount: boolean): BundledAddOn[] {
  const active = rows.filter((row) => row.status === "active");
  if (!atPendingAmount) return active.filter((row) => row.billedFrom !== null);
  return active
    .filter((row) => row.endRequestedAt === null)
    .map((row) =>
      row.pendingOfferDiscountAmountCents === null
        ? row
        : { ...row, offerDiscountAmountCents: row.pendingOfferDiscountAmountCents, netAmountCents: nextNetCents(row) },
    );
}

/**
 * Notes that the customer has asked to remove an add-on taken with the plan, after the provider has been told to move the
 * subscription to the new amount at the cycle end: the add-on stays active and billed until then, and the subscription
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
 * The renewal at the new amount has been recorded: the add-ons the customer asked to remove stop (`removed`), the ones added
 * this month are billed from now, a pending package offer becomes the line's own, and the subscription's billed amount becomes
 * the pending one. A no-op for a subscription with no change waiting. Staff connection, in the transaction that records the
 * renewal.
 */
export async function completeBundledAddOnChanges(db: Runner, input: { readonly subscriptionId: string; readonly now: Date }): Promise<void> {
  if (!isUuid(input.subscriptionId)) return;
  await db
    .update(bundledAddOns)
    .set({ status: "removed", removedAt: input.now, updatedAt: input.now })
    .where(
      and(eq(bundledAddOns.subscriptionId, input.subscriptionId), eq(bundledAddOns.status, "active"), isNotNull(bundledAddOns.endRequestedAt)),
    );
  // A dropped service gave the package offer up (endPackageOffer), and its ad credit ran to the end of the paid month: this
  // renewal is the first month without the package, whether the line went or was kept at list, so the credit stops now.
  await db
    .update(subscriptions)
    .set({ adCreditCents: 0, updatedAt: input.now })
    .where(
      and(
        eq(subscriptions.id, input.subscriptionId),
        gt(subscriptions.adCreditCents, 0),
        sql`exists (select 1 from ${businesses} where ${businesses.id} = ${subscriptions.businessId} and ${businesses.packageOfferForfeitedAt} is not null)`,
      ),
    );
  await db
    .update(bundledAddOns)
    .set({ billedFrom: input.now, updatedAt: input.now })
    .where(and(eq(bundledAddOns.subscriptionId, input.subscriptionId), eq(bundledAddOns.status, "active"), isNull(bundledAddOns.billedFrom)));
  await db
    .update(bundledAddOns)
    .set({
      offerDiscountAmountCents: sql`${bundledAddOns.pendingOfferDiscountAmountCents}`,
      netAmountCents: sql`${bundledAddOns.listAmountCents} - ${bundledAddOns.pendingOfferDiscountAmountCents}`,
      pendingOfferDiscountAmountCents: null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(bundledAddOns.subscriptionId, input.subscriptionId),
        eq(bundledAddOns.status, "active"),
        isNotNull(bundledAddOns.pendingOfferDiscountAmountCents),
      ),
    );
  await db
    .update(subscriptions)
    .set({ bundledAddOnNetCents: sql`${subscriptions.pendingBundledAddOnNetCents}`, pendingBundledAddOnNetCents: null, updatedAt: input.now })
    .where(and(eq(subscriptions.id, input.subscriptionId), isNotNull(subscriptions.pendingBundledAddOnNetCents)));
}

/*
 * Adding an add-on to a running plan (docs/plans/13-platform-add-ons-after-signup.md in the BrandBasket workspace). The
 * platform works out the quote for the rest of the paid month (lib/billing/add-on-proration.ts in @brandbasket/shared, which
 * this package cannot import); what lives here is the record of it and the transitions the money drives: the charge is
 * opened with a `pending` row, paying it turns the row `active` and raises the amount the next renewal must arrive at, and
 * that renewal bills it (completeBundledAddOnChanges). Every write is on the staff connection under the business's billing
 * lock, like every other billing write.
 */

/** An add-on added to a running plan, at the quote the platform worked out. */
export interface NewAddedAddOn {
  readonly businessId: string;
  readonly subscriptionId: string;
  /** A monthly add-on id from the catalogue. */
  readonly addOn: string;
  /** Its monthly list price. */
  readonly listAmountCents: number;
  /** The package offer taken off it, at the basket's new package percentage (0 for none): billed from the next renewal. */
  readonly offerDiscountAmountCents: number;
  readonly taxRateBasisPoints: number;
  readonly currency: BillingCurrency;
  /** The share of the monthly net price for the days left, before tax. */
  readonly netCents: number;
  /** What is taken now, tax included. Zero when the share is too small to charge: the add-on is on at once. */
  readonly chargeCents: number;
  /** The end of the paid month the quote was worked out for. */
  readonly quotedPeriodEnd: Date;
  /** What the customer reads on Billing and the invoice: "Social Media and Ads, 05 Nov to 18 Nov 2026". */
  readonly description: string;
  /** The staff member adding it for the client, or null when the client is. */
  readonly staffId: string | null;
  readonly now: Date;
}

/** Why an add-on cannot be added against the subscription as it now stands. */
export class BundledAddOnNotPossibleError extends Error {
  readonly reason: "no-subscription" | "not-live" | "already-added";

  constructor(reason: BundledAddOnNotPossibleError["reason"]) {
    super(`The add-on could not be added: ${reason}.`);
    this.name = "BundledAddOnNotPossibleError";
    this.reason = reason;
  }
}

interface LockedSubscription {
  readonly businessId: string;
  readonly status: string;
  readonly activatedAt: Date | null;
  readonly paidThroughAt: Date | null;
  readonly cancelRequestedAt: Date | null;
  readonly bundledAddOnNetCents: number;
}

async function lockSubscription(tx: ScopedTransaction, subscriptionId: string): Promise<LockedSubscription | null> {
  const rows = await tx
    .select({
      businessId: subscriptions.businessId,
      status: subscriptions.status,
      activatedAt: subscriptions.activatedAt,
      paidThroughAt: subscriptions.paidThroughAt,
      cancelRequestedAt: subscriptions.cancelRequestedAt,
      bundledAddOnNetCents: subscriptions.bundledAddOnNetCents,
    })
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1)
    .for("update");
  return rows[0] ?? null;
}

/** Whether the subscription is still the live, paid month the quote was worked out for. */
function stillQuotedFor(subscription: LockedSubscription, quotedPeriodEnd: Date): boolean {
  return (
    subscription.status === "active" &&
    subscription.activatedAt !== null &&
    subscription.cancelRequestedAt === null &&
    subscription.paidThroughAt !== null &&
    subscription.paidThroughAt.getTime() === quotedPeriodEnd.getTime()
  );
}

/**
 * Sets the amount the next renewal must arrive at from the subscription's add-ons as they now stand. Null when nothing is
 * changing (no add-on is ending, waiting to be billed or moving to another package offer), so the renewal is simply at the
 * amount billed now.
 */
async function settlePendingNet(tx: ScopedTransaction, subscriptionId: string, now: Date): Promise<void> {
  const active = (await findBundledAddOnsForSubscription(tx, subscriptionId)).filter((row) => row.status === "active");
  const changing = active.some((row) => row.endRequestedAt !== null || row.billedFrom === null || row.pendingOfferDiscountAmountCents !== null);
  await tx
    .update(subscriptions)
    .set({ pendingBundledAddOnNetCents: changing ? nextBundledNetCents(active) : null, updatedAt: now })
    .where(eq(subscriptions.id, subscriptionId));
}

/**
 * A package replaces a referral code: a subscription with more than one service line staying carries no discount of its own
 * (a code is for a single service only, plan 16 Settled 2). Counts the lines the package price counts, the active ones not
 * asked to end. Called whenever a line becomes active, so the next renewal, the amount the provider is told and the invoice
 * all see the discount gone. The code stays on the subscription for the record. A stay offer frozen on an old subscription
 * goes with it (stay offers are removed in plan 16 phase 5): the renewal invoice puts a discount on a single service line
 * only, so one left on a package would stop it being issued.
 */
async function endCodeDiscountOfPackage(tx: ScopedTransaction, subscriptionId: string, now: Date): Promise<void> {
  const staying = await tx
    .select({ id: bundledAddOns.id })
    .from(bundledAddOns)
    .where(and(eq(bundledAddOns.subscriptionId, subscriptionId), eq(bundledAddOns.status, "active"), isNull(bundledAddOns.endRequestedAt)));
  if (staying.length < 2) return;
  await tx
    .update(subscriptions)
    .set({ discountAmountCents: 0, retentionDiscountCents: 0, updatedAt: now })
    .where(and(eq(subscriptions.id, subscriptionId), sql`(${subscriptions.discountAmountCents} > 0 or ${subscriptions.retentionDiscountCents} > 0)`));
}

/** Closes an add-on still waiting for its charge: the row stops and an open charge is waived, so it can no longer be paid. */
async function dropWaitingAddOn(tx: ScopedTransaction, row: Pick<BundledAddOn, "id" | "chargeId">, now: Date): Promise<void> {
  await tx.update(bundledAddOns).set({ status: "removed", removedAt: now, updatedAt: now }).where(eq(bundledAddOns.id, row.id));
  if (row.chargeId !== null) {
    await tx
      .update(charges)
      .set({ status: "waived", waivedAt: now })
      .where(and(eq(charges.id, row.chargeId), eq(charges.status, "open")));
  }
}

export interface OpenedBundledAddOn {
  readonly row: BundledAddOn;
  /** The charge to pay, or null when the add-on was turned on with nothing to take. */
  readonly chargeId: string | null;
}

/**
 * Opens the add, in the caller's transaction under its billing lock. The subscription must still be the paid month the
 * quote was for. Every earlier open charge of the subscription is waived and its row closed, for any service, since it was
 * quoted for a basket that this add changes. With a charge, the row is `pending` until it is paid; with nothing to take, it is `active` at once and the next renewal's amount is raised. Throws
 * BundledAddOnNotPossibleError when the subscription has moved on, or the add-on is already active (an ending one is kept
 * with keepBundledAddOn instead).
 */
export async function openBundledAddOn(tx: ScopedTransaction, input: NewAddedAddOn): Promise<OpenedBundledAddOn> {
  const subscription = await lockSubscription(tx, input.subscriptionId);
  if (subscription === null || subscription.businessId !== input.businessId) throw new BundledAddOnNotPossibleError("no-subscription");
  if (!stillQuotedFor(subscription, input.quotedPeriodEnd)) throw new BundledAddOnNotPossibleError("not-live");

  const live = (await findBundledAddOnsForSubscription(tx, input.subscriptionId)).filter((row) => row.status !== "removed");
  if (live.some((row) => row.addOn === input.addOn && row.status === "active")) throw new BundledAddOnNotPossibleError("already-added");
  // Every earlier quote is replaced, whatever its service: its price was for a different moment (the basket it was quoted
  // against has changed with this add), so paying it later must not turn it on at that price. Only one add is open at a time.
  for (const row of live) if (row.status === "pending") await dropWaitingAddOn(tx, row, input.now);

  const common = {
    businessId: input.businessId,
    subscriptionId: input.subscriptionId,
    addOn: input.addOn,
    listAmountCents: input.listAmountCents,
    offerDiscountAmountCents: input.offerDiscountAmountCents,
    netAmountCents: input.listAmountCents - input.offerDiscountAmountCents,
    taxRateBasisPoints: input.taxRateBasisPoints,
    quotedPeriodEnd: input.quotedPeriodEnd,
    addedByStaffId: input.staffId,
  } as const;

  if (input.chargeCents > 0) {
    const insertedCharge = await tx
      .insert(charges)
      .values({
        businessId: input.businessId,
        kind: "add_on",
        description: input.description,
        quantity: 1,
        unitAmountCents: input.netCents,
        taxRateBasisPoints: input.taxRateBasisPoints,
        amountCents: input.chargeCents,
        currency: input.currency,
        createdByStaffId: input.staffId,
      })
      .returning({ id: charges.id });
    const charge = insertedCharge[0];
    if (charge === undefined) throw new Error("Inserting the add-on's charge returned no row");
    const inserted = await tx.insert(bundledAddOns).values({ ...common, chargeId: charge.id }).returning();
    const row = inserted[0];
    if (row === undefined) throw new Error("Inserting the added add-on returned no row");
    return { row, chargeId: charge.id };
  }

  const inserted = await tx.insert(bundledAddOns).values({ ...common, status: "active", activatedAt: input.now }).returning();
  const row = inserted[0];
  if (row === undefined) throw new Error("Inserting the added add-on returned no row");
  await endCodeDiscountOfPackage(tx, input.subscriptionId, input.now);
  await settlePendingNet(tx, input.subscriptionId, input.now);
  return { row, chargeId: null };
}

/** The add-on a charge pays for, or null. */
export async function findBundledAddOnByCharge(db: Runner, chargeId: string): Promise<BundledAddOn | null> {
  if (!isUuid(chargeId)) return null;
  const rows = await db.select().from(bundledAddOns).where(eq(bundledAddOns.chargeId, chargeId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Whether a payment for an add-on's charge still buys it: the add-on is waiting for it and the subscription is the paid
 * month it was quoted for. Called by recordChargePayment before it settles the charge, under the same lock.
 */
export async function bundledAddOnStillApplies(tx: ScopedTransaction, chargeId: string): Promise<boolean> {
  const row = await findBundledAddOnByCharge(tx, chargeId);
  if (row === null || row.status !== "pending" || row.quotedPeriodEnd === null) return false;
  const subscription = await lockSubscription(tx, row.subscriptionId);
  return subscription !== null && stillQuotedFor(subscription, row.quotedPeriodEnd);
}

/**
 * The add-on's money has arrived and its quote stood: it is on from this moment and the next renewal must arrive at the new
 * amount. Runs inside recordChargePayment's transaction, so the payment, the paid charge and the add-on never disagree.
 */
export async function applyPaidBundledAddOn(tx: ScopedTransaction, chargeId: string, paidAt: Date): Promise<BundledAddOn | null> {
  const activated = await tx
    .update(bundledAddOns)
    .set({ status: "active", activatedAt: paidAt, updatedAt: paidAt })
    .where(and(eq(bundledAddOns.chargeId, chargeId), eq(bundledAddOns.status, "pending")))
    .returning();
  const row = activated[0];
  if (row === undefined) return null;
  await endCodeDiscountOfPackage(tx, row.subscriptionId, paidAt);
  await settlePendingNet(tx, row.subscriptionId, paidAt);
  return row;
}

/**
 * The add-on stops before it started: its charge was waived, or paid after the quote stopped standing (that money is kept on
 * record and flagged for a refund by recordChargePayment). Inside the caller's transaction.
 */
export async function dropBundledAddOnOfCharge(db: Runner, chargeId: string, now: Date): Promise<void> {
  await db
    .update(bundledAddOns)
    .set({ status: "removed", removedAt: now, updatedAt: now })
    .where(and(eq(bundledAddOns.chargeId, chargeId), eq(bundledAddOns.status, "pending")));
}

/**
 * Keeps an add-on the customer had asked to remove: it is still paid for up to the renewal, so nothing is charged, and the
 * next renewal's amount goes back to include it. False when it is not active and ending, or not the business's. Inside the
 * caller's transaction under its billing lock, after the provider has been moved back.
 */
export async function keepBundledAddOn(
  tx: ScopedTransaction,
  input: { readonly id: string; readonly businessId: string; readonly now: Date },
): Promise<boolean> {
  if (!isUuid(input.id) || !isUuid(input.businessId)) return false;
  const rows = await tx
    .update(bundledAddOns)
    .set({ endRequestedAt: null, updatedAt: input.now })
    .where(
      and(
        eq(bundledAddOns.id, input.id),
        eq(bundledAddOns.businessId, input.businessId),
        eq(bundledAddOns.status, "active"),
        isNotNull(bundledAddOns.endRequestedAt),
      ),
    )
    .returning({ subscriptionId: bundledAddOns.subscriptionId });
  const subscriptionId = rows[0]?.subscriptionId;
  if (subscriptionId === undefined) return false;
  await settlePendingNet(tx, subscriptionId, input.now);
  return true;
}

/**
 * The provider has been told to bill the added add-ons from the next renewal: stamps the active ones not yet billed and not
 * yet stamped, and returns how many. Staff connection.
 */
export async function markBundledAddOnsScheduled(db: Runner, input: { readonly subscriptionId: string; readonly now: Date }): Promise<number> {
  if (!isUuid(input.subscriptionId)) return 0;
  const rows = await db
    .update(bundledAddOns)
    .set({ providerScheduledAt: input.now, updatedAt: input.now })
    .where(
      and(
        eq(bundledAddOns.subscriptionId, input.subscriptionId),
        eq(bundledAddOns.status, "active"),
        isNull(bundledAddOns.billedFrom),
        isNull(bundledAddOns.providerScheduledAt),
      ),
    )
    .returning({ id: bundledAddOns.id });
  return rows.length;
}

/** One line moving to another package offer from the next renewal. */
export interface PendingOfferDiscount {
  readonly id: string;
  /** What the package offer will take off the line's list price: 0 for list price. */
  readonly pendingOfferDiscountAmountCents: number;
}

/**
 * Moves lines to another package offer from the next renewal, after the provider has been told to bill the new amount: a
 * service was added (the basket's new percentage) or dropped (list price for good). Each line keeps its current price until
 * that renewal, which completeBundledAddOnChanges records, and the subscription's pending amount is worked out again. Only
 * the subscription's active lines that are staying can be moved: when any line given is not one, or is given twice, it
 * throws and the caller's transaction writes nothing, so a half-moved basket is never recorded. Inside the caller's
 * transaction under its billing lock.
 */
export async function setPendingOfferDiscounts(
  tx: ScopedTransaction,
  input: { readonly subscriptionId: string; readonly lines: readonly PendingOfferDiscount[]; readonly now: Date },
): Promise<void> {
  const unmoved = (reason: string): Error => new Error(`The package offer of subscription ${input.subscriptionId} could not be moved: ${reason}.`);
  if (!isUuid(input.subscriptionId)) throw unmoved("it is not a subscription id");
  if (new Set(input.lines.map((line) => line.id)).size !== input.lines.length) throw unmoved("a line was given twice");
  for (const line of input.lines) {
    if (!isUuid(line.id)) throw unmoved(`${line.id} is not a line id`);
    const moved = await tx
      .update(bundledAddOns)
      .set({ pendingOfferDiscountAmountCents: line.pendingOfferDiscountAmountCents, updatedAt: input.now })
      .where(
        and(
          eq(bundledAddOns.id, line.id),
          eq(bundledAddOns.subscriptionId, input.subscriptionId),
          eq(bundledAddOns.status, "active"),
          isNull(bundledAddOns.endRequestedAt),
        ),
      )
      .returning({ id: bundledAddOns.id });
    if (moved.length === 0) throw unmoved(`line ${line.id} is not an active line that is staying`);
  }
  await settlePendingNet(tx, input.subscriptionId, input.now);
}

/**
 * Records that the business has dropped a service from a package: its package offer ends for good. The first time is kept,
 * so a second call changes nothing. False when the business was already forfeited or does not exist. Staff connection, in
 * the business's billing lock.
 */
export async function markPackageOfferForfeited(tx: ScopedTransaction, businessId: string, at: Date): Promise<boolean> {
  if (!isUuid(businessId)) return false;
  const rows = await tx
    .update(businesses)
    .set({ packageOfferForfeitedAt: at })
    .where(and(eq(businesses.id, businessId), isNull(businesses.packageOfferForfeitedAt)))
    .returning({ id: businesses.id });
  return rows.length > 0;
}

/**
 * A service has been dropped from a package, after its removal was recorded: the package offer ends for good. The lines
 * that stay move to `lines` (list price) from the next renewal, the business is marked as having given the offer up, the
 * any service still waiting for its charge is dropped, since the price it was quoted at is gone. The monthly ad credit
 * is kept to the end of the month already paid: it stops at the renewal that takes the dropped line off
 * (completeBundledAddOnChanges). Throws, so the caller's transaction writes nothing, when a line given
 * cannot be moved (setPendingOfferDiscounts). Inside the caller's transaction under its billing lock.
 */
export async function endPackageOffer(
  tx: ScopedTransaction,
  input: { readonly businessId: string; readonly subscriptionId: string; readonly lines: readonly PendingOfferDiscount[]; readonly now: Date },
): Promise<void> {
  await setPendingOfferDiscounts(tx, { subscriptionId: input.subscriptionId, lines: input.lines, now: input.now });
  await markPackageOfferForfeited(tx, input.businessId, input.now);
  const waiting = await tx
    .select({ id: bundledAddOns.id, chargeId: bundledAddOns.chargeId })
    .from(bundledAddOns)
    .where(and(eq(bundledAddOns.subscriptionId, input.subscriptionId), eq(bundledAddOns.status, "pending")));
  for (const row of waiting) await dropWaitingAddOn(tx, row, input.now);
}

/**
 * When the business gave its package offer up (markPackageOfferForfeited), or null if it has not. From then on every
 * service it takes is priced at list. Null for a business that does not exist. Staff connection.
 */
export async function findPackageOfferForfeitedAt(db: Runner, businessId: string): Promise<Date | null> {
  if (!isUuid(businessId)) return null;
  const rows = await db
    .select({ at: businesses.packageOfferForfeitedAt })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  return rows[0]?.at ?? null;
}

/** Whether the business has given its package offer up: false for a business that does not exist. Staff connection. */
export async function isPackageOfferForfeited(db: Runner, businessId: string): Promise<boolean> {
  return (await findPackageOfferForfeitedAt(db, businessId)) !== null;
}

/** One live, paid subscription that earns ad credit, for the console's "Ad credit due this month" list. */
export interface AdCreditDue {
  readonly subscriptionId: string;
  readonly businessId: string;
  readonly businessName: string;
  readonly currency: BillingCurrency;
  /** The ad credit a month, in the subscription's minor units. */
  readonly adCreditCents: number;
  /** The end of the period the customer has paid for (after `now`, or the row is not listed). */
  readonly paidThroughAt: Date | null;
  /** The service ids still billed on the subscription, in the order they were taken. */
  readonly services: readonly string[];
}

/**
 * The subscriptions that are owed ad credit this month: paid at least once (`activated_at`), paid through past `now` (a past
 * due subscription whose paid period has run out is owed nothing, as access.ts has it), still billing (active or past due; not
 * stopped by the provider), with credit above zero. A customer who asked to close keeps the credit to the end of the month they
 * paid for, so a cancel request does not hide the row; the provider's cancel at that date does. A cancelled row that never
 * took a payment keeps the credit it was opened with and is not listed by the credit alone. By business name. Staff connection.
 */
export async function listAdCreditDue(db: Runner, now: Date): Promise<readonly AdCreditDue[]> {
  const due = await db
    .select({
      subscriptionId: subscriptions.id,
      businessId: subscriptions.businessId,
      businessName: businesses.name,
      currency: businesses.currency,
      adCreditCents: subscriptions.adCreditCents,
      paidThroughAt: subscriptions.paidThroughAt,
    })
    .from(subscriptions)
    .innerJoin(businesses, eq(businesses.id, subscriptions.businessId))
    .where(
      and(
        gt(subscriptions.adCreditCents, 0),
        isNotNull(subscriptions.activatedAt),
        gt(subscriptions.paidThroughAt, now),
        inArray(subscriptions.status, ["active", "past_due"]),
      ),
    )
    .orderBy(asc(businesses.name), asc(subscriptions.id));
  if (due.length === 0) return [];
  const lines = await db
    .select({ subscriptionId: bundledAddOns.subscriptionId, addOn: bundledAddOns.addOn })
    .from(bundledAddOns)
    .where(and(inArray(bundledAddOns.subscriptionId, due.map((row) => row.subscriptionId)), eq(bundledAddOns.status, "active")))
    .orderBy(asc(bundledAddOns.createdAt), asc(bundledAddOns.id));
  return due.map((row) => ({ ...row, services: lines.filter((line) => line.subscriptionId === row.subscriptionId).map((line) => line.addOn) }));
}
