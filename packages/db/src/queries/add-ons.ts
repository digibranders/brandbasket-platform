import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import {
  assertMinorUnits,
  findPaymentByProviderId,
  isUnappliedReason,
  PAYMENT_COLUMNS,
  PaymentReadBackError,
  paymentMethodValues,
  type Payment,
  type PaymentMethodDetails,
  type UnappliedPaymentReason,
} from "./billing";
import { isUuid } from "./tenant";
import {
  addOnPayments,
  addOnProviderPlans,
  addOnSubscriptions,
  bundledAddOns,
  businesses,
  charges,
  payments,
  pressReleases,
  users,
  type AddOnSubscription,
  type AddOnSubscriptionStatus,
  type BillingCurrency,
  type BillingProviderName,
  type PressRelease,
} from "../schema";

/** Reads run both on their own and inside a tenant-scoped transaction, so they accept either runner. */
type Runner = Database | ScopedTransaction;

/** An add-on payment was recorded for a row that does not exist. Nothing was written. */
export class AddOnSubscriptionNotFoundError extends Error {
  constructor(addOnSubscriptionId: string) {
    super(`No add-on subscription ${addOnSubscriptionId} to record a payment against.`);
    this.name = "AddOnSubscriptionNotFoundError";
  }
}

/**
 * A payment arrived for an add-on that is cancelled. A cancelled add-on is final, so it is never opened again; the
 * caller records the money as an unapplied payment (recordUnappliedAddOnPayment) for staff instead.
 */
export class AddOnSubscriptionNotPayableError extends Error {
  constructor(addOnSubscriptionId: string) {
    super(`Add-on subscription ${addOnSubscriptionId} is cancelled, so a payment cannot open it again.`);
    this.name = "AddOnSubscriptionNotPayableError";
  }
}

/**
 * Another row of the same business and add-on is already billing (scheduled, active or past due, and not ending), so a
 * payment cannot open this one: a second would double the add-on. Thrown before anything is written. The caller records
 * the money with recordUnappliedAddOnPayment (reason `already_paid`) for staff to refund.
 */
export class AddOnAlreadyBillingError extends Error {
  constructor(addOnSubscriptionId: string, billingId: string) {
    super(`Add-on subscription ${addOnSubscriptionId} cannot open: ${billingId} already bills the same add-on.`);
    this.name = "AddOnAlreadyBillingError";
  }
}

/**
 * The provider payment id is already recorded against something that is not this add-on subscription: a plan payment, a
 * charge, or another add-on row. Nothing was written. The message holds ids only.
 */
export class AddOnPaymentConflictError extends Error {
  constructor(provider: BillingProviderName, providerPaymentId: string, addOnSubscriptionId: string) {
    super(`Payment ${provider}/${providerPaymentId} is already recorded against something other than add-on subscription ${addOnSubscriptionId}.`);
    this.name = "AddOnPaymentConflictError";
  }
}

export type NewAddOnSubscription = Omit<typeof addOnSubscriptions.$inferInsert, "createdAt" | "updatedAt" | "status"> & {
  readonly id: string;
};

/**
 * Stores an unpaid add-on subscription: the price the customer was shown, and the Razorpay subscription made for it.
 * The row is `incomplete` until its first payment is recorded (recordAddOnPayment). The database allows one unpaid
 * checkout per business and add-on, so a second is refused. Staff connection only.
 */
export async function insertAddOnSubscription(db: Runner, row: NewAddOnSubscription): Promise<AddOnSubscription> {
  const inserted = await db.insert(addOnSubscriptions).values(row).returning();
  const created = inserted[0];
  if (created === undefined) throw new Error("Inserting an add-on subscription returned no row");
  return created;
}

/** One of the business's add-on rows, or null. Scoped by business so a guessed id from another business finds nothing. Works through row-level security. */
export async function findAddOnSubscription(db: Runner, businessId: string, id: string): Promise<AddOnSubscription | null> {
  if (!isUuid(businessId) || !isUuid(id)) return null;
  const rows = await db
    .select()
    .from(addOnSubscriptions)
    .where(and(eq(addOnSubscriptions.id, id), eq(addOnSubscriptions.businessId, businessId)))
    .limit(1);
  return rows[0] ?? null;
}

/** The row Razorpay's event or payment belongs to, from the provider's own id for it. Staff connection only. */
export async function findAddOnSubscriptionByProviderId(
  db: Runner,
  provider: BillingProviderName,
  providerSubscriptionId: string,
): Promise<AddOnSubscription | null> {
  const rows = await db
    .select()
    .from(addOnSubscriptions)
    .where(and(eq(addOnSubscriptions.provider, provider), eq(addOnSubscriptions.providerSubscriptionId, providerSubscriptionId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Every add-on row of the business, newest first. Works through row-level security. */
export async function listAddOnSubscriptionsForBusiness(db: Runner, businessId: string): Promise<AddOnSubscription[]> {
  if (!isUuid(businessId)) return [];
  return db
    .select()
    .from(addOnSubscriptions)
    .where(eq(addOnSubscriptions.businessId, businessId))
    .orderBy(desc(addOnSubscriptions.createdAt), desc(addOnSubscriptions.id));
}

/** A business's add-on row with the name of the staff member who scheduled its end, for the staff console. */
export type AddOnSubscriptionForStaff = AddOnSubscription & { readonly endRequestedByStaffName: string | null };

/**
 * Every add-on row of the business, newest first, each with the name of the staff member who asked for its end (null when
 * the customer did, or no end is set). Staff connection only.
 */
export async function listAddOnSubscriptionsForStaff(db: Runner, businessId: string): Promise<AddOnSubscriptionForStaff[]> {
  if (!isUuid(businessId)) return [];
  const rows = await db
    .select({ row: addOnSubscriptions, endRequestedByStaffName: users.name })
    .from(addOnSubscriptions)
    .leftJoin(users, eq(users.id, addOnSubscriptions.endRequestedByStaffId))
    .where(eq(addOnSubscriptions.businessId, businessId))
    .orderBy(desc(addOnSubscriptions.createdAt), desc(addOnSubscriptions.id));
  return rows.map(({ row, endRequestedByStaffName }) => ({ ...row, endRequestedByStaffName }));
}

/** The row, locked until the transaction ends, so two payments or two clicks cannot interleave. Staff connection only. */
export async function lockAddOnSubscription(tx: ScopedTransaction, id: string): Promise<AddOnSubscription | null> {
  if (!isUuid(id)) return null;
  const rows = await tx.select().from(addOnSubscriptions).where(eq(addOnSubscriptions.id, id)).limit(1).for("update");
  return rows[0] ?? null;
}

/**
 * Ends an unpaid checkout the customer replaced or abandoned. A row that was paid for in the meantime is left alone:
 * only an `incomplete` row is cancelled. Staff connection only.
 */
export async function cancelStaleAddOnCheckout(tx: ScopedTransaction, id: string, now: Date): Promise<void> {
  await tx
    .update(addOnSubscriptions)
    .set({ status: "cancelled", endedAt: now, updatedAt: now })
    .where(and(eq(addOnSubscriptions.id, id), eq(addOnSubscriptions.status, "incomplete")));
}

/**
 * Marks an active add-on as ending at the end of its paid period: a cancel, or a pause. Cancel and Pause have already
 * told the provider to stop at cycle end; this records it, and who asked (null when the customer did). Only an `active`
 * row with no end can be scheduled, because end actions are only offered on active rows. Returns `scheduled`, `already`
 * when an end was set earlier (the first request stands, whatever kind it was), or `not-active` for any other row or one
 * that does not exist. The row is locked, so two clicks cannot both schedule. Staff connection only.
 */
export async function scheduleAddOnEnd(
  tx: ScopedTransaction,
  input: { readonly id: string; readonly kind: "cancel" | "pause"; readonly now: Date; readonly staffUserId: string | null },
): Promise<"scheduled" | "already" | "not-active"> {
  const row = await lockAddOnSubscription(tx, input.id);
  if (row === null || row.status !== "active") return "not-active";
  if (row.endKind !== null) return "already";
  await tx
    .update(addOnSubscriptions)
    .set({ endKind: input.kind, endRequestedAt: input.now, endRequestedByStaffId: input.staffUserId, updatedAt: input.now })
    .where(eq(addOnSubscriptions.id, input.id));
  return "scheduled";
}

/**
 * Changes the kind of an end that is already set on an active add-on, between a cancel and a pause, and records who asked
 * and when. For Pause or Cancel pressed on a kept subscription that has not started: the provider already stops the old
 * subscription at the end of its cycle either way, so only our record of what the customer chose changes. Returns
 * `changed`, `unchanged` when the end is already of that kind (the first request's time and author stand), or
 * `not-ending` for a row that is not active with an end set, or does not exist. The row is locked. Staff connection only.
 */
export async function changeAddOnEndKind(
  tx: ScopedTransaction,
  input: { readonly id: string; readonly kind: "cancel" | "pause"; readonly now: Date; readonly staffUserId: string | null },
): Promise<"changed" | "unchanged" | "not-ending"> {
  const row = await lockAddOnSubscription(tx, input.id);
  if (row === null || row.status !== "active" || row.endKind === null) return "not-ending";
  if (row.endKind === input.kind) return "unchanged";
  await tx
    .update(addOnSubscriptions)
    .set({ endKind: input.kind, endRequestedAt: input.now, endRequestedByStaffId: input.staffUserId, updatedAt: input.now })
    .where(eq(addOnSubscriptions.id, input.id));
  return "changed";
}

/**
 * Applies a status change that carries no payment (see nextAddOnStatus in @brandbasket/shared). `cancelled` is final: only
 * another `cancelled` event matches a cancelled row, so a late event cannot reopen it beside a newer live row of the
 * same add-on. With `expectedFrom`, the row changes only if it is still in that status, so an event decided from a
 * stale read cannot overwrite a newer state. Returns whether the row changed. Staff connection only.
 */
export async function updateAddOnStatus(
  db: Runner,
  input: {
    readonly id: string;
    readonly status: AddOnSubscriptionStatus;
    /** Exactly as the provider reported it, for support and reconciliation. */
    readonly providerStatus: string;
    readonly haltedAt?: Date;
    readonly endedAt?: Date;
    readonly now: Date;
    /** The status the caller read the row in; the update is skipped if the row has moved on. */
    readonly expectedFrom?: AddOnSubscriptionStatus;
  },
): Promise<boolean> {
  const guard = input.status === "cancelled" ? undefined : ne(addOnSubscriptions.status, "cancelled");
  const rows = await db
    .update(addOnSubscriptions)
    .set({
      status: input.status,
      providerStatus: input.providerStatus,
      updatedAt: input.now,
      ...(input.haltedAt === undefined ? {} : { haltedAt: input.haltedAt }),
      ...(input.endedAt === undefined ? {} : { endedAt: sql`coalesce(${addOnSubscriptions.endedAt}, ${input.endedAt})` }),
    })
    .where(
      and(
        eq(addOnSubscriptions.id, input.id),
        guard,
        input.expectedFrom === undefined ? undefined : eq(addOnSubscriptions.status, input.expectedFrom),
      ),
    )
    .returning({ id: addOnSubscriptions.id });
  return rows.length > 0;
}

/** Cancels a row now, keeping an end date it already has. Staff connection only. */
export async function markAddOnCancelled(tx: ScopedTransaction, id: string, now: Date): Promise<void> {
  await tx
    .update(addOnSubscriptions)
    .set({ status: "cancelled", endedAt: sql`coalesce(${addOnSubscriptions.endedAt}, ${now})`, updatedAt: now })
    .where(eq(addOnSubscriptions.id, id));
}

export interface AddOnPaymentRecord {
  readonly addOnSubscriptionId: string;
  readonly provider: BillingProviderName;
  readonly providerPaymentId: string;
  /** What the provider says it took, in integer minor units of `currency`. */
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly paidAt: Date;
  /** The month this payment pays for. */
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly providerStatus?: string | null;
  readonly method?: PaymentMethodDetails | null;
}

export interface RecordedAddOnPayment {
  readonly payment: Payment;
  /** True when this provider payment had already been recorded; nothing was written a second time. */
  readonly alreadyRecorded: boolean;
  /**
   * The halted rows of the same add-on this payment closed (Pay now, or a fresh Buy after the grace), to cancel at the
   * provider once the transaction has committed. Empty when there were none.
   */
  readonly predecessorsToCancel: readonly {
    readonly provider: BillingProviderName;
    readonly providerSubscriptionId: string;
  }[];
}

/**
 * A payment that already exists under this provider id must be this add-on's own: kind add_on, linked to this row. Anything
 * else (a plan payment, a charge, another row) means the id is not ours to treat as recorded.
 */
async function assertPaymentBelongsToAddOn(
  tx: ScopedTransaction,
  payment: Payment,
  row: { readonly id: string; readonly businessId: string },
  provider: BillingProviderName,
): Promise<void> {
  if (payment.kind === "add_on" && payment.businessId === row.businessId) {
    const links = await tx
      .select({ addOnSubscriptionId: addOnPayments.addOnSubscriptionId })
      .from(addOnPayments)
      .where(eq(addOnPayments.paymentId, payment.id))
      .limit(1);
    if (links[0]?.addOnSubscriptionId === row.id) return;
  }
  throw new AddOnPaymentConflictError(provider, payment.providerPaymentId, row.id);
}

/**
 * Records a captured add-on payment and opens the add-on for the period it paid, in the caller's transaction: the
 * payment, its link and the row change together or not at all. The row is locked first, so two payments arriving at
 * once cannot interleave their dates. Idempotent on `(provider, providerPaymentId)`: a second delivery writes nothing,
 * moves no date and reports `alreadyRecorded: true`, even if the row has been cancelled since. An existing payment under
 * that id that is not this row's own throws AddOnPaymentConflictError.
 *
 * Before anything is written, a new payment is refused on a cancelled row (AddOnSubscriptionNotPayableError), and when
 * another row of the same add-on is already billing (AddOnAlreadyBillingError); the caller records the money with
 * recordUnappliedAddOnPayment instead. Every other halted row of the same add-on is cancelled before this one becomes
 * active, so the one-billing index never sees two (this covers Pay now and a fresh Buy after the grace). Their provider
 * ids come back for the caller to cancel at the provider once the transaction has committed; the provider is never
 * called here.
 *
 * This records the payment and nothing else: it issues no tax invoice. The caller invoices the payment in the same
 * transaction, as the last write. Staff connection only.
 */
export async function recordAddOnPayment(tx: ScopedTransaction, input: AddOnPaymentRecord): Promise<RecordedAddOnPayment> {
  assertMinorUnits(input.amountCents);
  const row = await lockAddOnSubscription(tx, input.addOnSubscriptionId);
  if (row === null) throw new AddOnSubscriptionNotFoundError(input.addOnSubscriptionId);

  // A redelivery comes first: it is reported as recorded even when the row has been cancelled since (a Pay now
  // predecessor, say), so it is checked before the row's status.
  const earlier = await findPaymentByProviderId(tx, input.provider, input.providerPaymentId);
  if (earlier !== null) {
    await assertPaymentBelongsToAddOn(tx, earlier, row, input.provider);
    return { payment: earlier, alreadyRecorded: true, predecessorsToCancel: [] };
  }
  if (row.status === "cancelled") throw new AddOnSubscriptionNotPayableError(row.id);

  // The other rows of this add-on, locked in id order so two payments for the same add-on cannot deadlock. A row that
  // is ending (end_kind set) is outside the one-billing index, so it neither blocks this payment nor needs closing.
  const joinsBilling = row.endKind === null;
  let halted: readonly { readonly id: string; readonly provider: BillingProviderName; readonly providerSubscriptionId: string }[] = [];
  if (joinsBilling) {
    const others = await tx
      .select({
        id: addOnSubscriptions.id,
        status: addOnSubscriptions.status,
        provider: addOnSubscriptions.provider,
        providerSubscriptionId: addOnSubscriptions.providerSubscriptionId,
      })
      .from(addOnSubscriptions)
      .where(
        and(
          eq(addOnSubscriptions.businessId, row.businessId),
          eq(addOnSubscriptions.addOn, row.addOn),
          ne(addOnSubscriptions.id, row.id),
          isNull(addOnSubscriptions.endKind),
          inArray(addOnSubscriptions.status, ["scheduled", "active", "past_due", "halted"]),
        ),
      )
      .orderBy(asc(addOnSubscriptions.id))
      .for("update");
    const billing = others.find((other) => other.status !== "halted");
    if (billing !== undefined) throw new AddOnAlreadyBillingError(row.id, billing.id);
    halted = others;
  }

  const inserted = await tx
    .insert(payments)
    .values({
      businessId: row.businessId,
      subscriptionId: null,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      kind: "add_on",
      amountCents: input.amountCents,
      currency: input.currency,
      status: "captured",
      paidAt: input.paidAt,
      ...paymentMethodValues(input.method),
    })
    .onConflictDoNothing({ target: [payments.provider, payments.providerPaymentId] })
    .returning(PAYMENT_COLUMNS);
  const payment = inserted[0];
  if (payment === undefined) {
    const existing = await findPaymentByProviderId(tx, input.provider, input.providerPaymentId);
    if (existing === null) throw new PaymentReadBackError(input.provider, input.providerPaymentId);
    await assertPaymentBelongsToAddOn(tx, existing, row, input.provider);
    return { payment: existing, alreadyRecorded: true, predecessorsToCancel: [] };
  }

  await tx.insert(addOnPayments).values({ paymentId: payment.id, addOnSubscriptionId: row.id, businessId: row.businessId });

  if (halted.length > 0) {
    await tx
      .update(addOnSubscriptions)
      .set({ status: "cancelled", endedAt: input.paidAt, updatedAt: input.paidAt })
      .where(inArray(addOnSubscriptions.id, halted.map((other) => other.id)));
  }

  await tx
    .update(addOnSubscriptions)
    .set({
      status: "active",
      activatedAt: row.activatedAt ?? input.paidAt,
      currentPeriodStart: input.periodStart,
      currentPeriodEnd: input.periodEnd,
      haltedAt: null,
      ...(input.providerStatus === undefined || input.providerStatus === null ? {} : { providerStatus: input.providerStatus }),
    })
    .where(eq(addOnSubscriptions.id, row.id));

  return {
    payment,
    alreadyRecorded: false,
    predecessorsToCancel: halted.map(({ provider, providerSubscriptionId }) => ({ provider, providerSubscriptionId })),
  };
}

/**
 * Records money the provider took for an add-on that cannot be applied (a checkout we had replaced, say): stored as
 * captured, flagged for staff, linked to the add-on, and nothing else moves. Idempotent on `(provider,
 * providerPaymentId)`. Money that buys nothing gets no tax invoice. Staff connection only.
 */
export async function recordUnappliedAddOnPayment(
  tx: ScopedTransaction,
  input: AddOnPaymentRecord & { readonly reason: UnappliedPaymentReason; readonly now: Date },
): Promise<{ payment: Payment; alreadyRecorded: boolean }> {
  assertMinorUnits(input.amountCents);
  if (!isUnappliedReason(input.reason)) throw new Error(`Not a reason for an unapplied payment: ${input.reason}`);
  const found = await tx
    .select({ id: addOnSubscriptions.id, businessId: addOnSubscriptions.businessId })
    .from(addOnSubscriptions)
    .where(eq(addOnSubscriptions.id, input.addOnSubscriptionId))
    .limit(1);
  const row = found[0];
  if (row === undefined) throw new AddOnSubscriptionNotFoundError(input.addOnSubscriptionId);

  const earlier = await findPaymentByProviderId(tx, input.provider, input.providerPaymentId);
  if (earlier !== null) {
    await assertPaymentBelongsToAddOn(tx, earlier, row, input.provider);
    return { payment: earlier, alreadyRecorded: true };
  }

  const inserted = await tx
    .insert(payments)
    .values({
      businessId: row.businessId,
      subscriptionId: null,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      kind: "add_on",
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
  if (payment === undefined) {
    const existing = await findPaymentByProviderId(tx, input.provider, input.providerPaymentId);
    if (existing === null) throw new PaymentReadBackError(input.provider, input.providerPaymentId);
    await assertPaymentBelongsToAddOn(tx, existing, row, input.provider);
    return { payment: existing, alreadyRecorded: true };
  }
  await tx.insert(addOnPayments).values({ paymentId: payment.id, addOnSubscriptionId: row.id, businessId: row.businessId });
  return { payment, alreadyRecorded: false };
}

/** The add-on row a payment paid for, or null for a payment that is not an add-on's. Staff connection only. */
export async function findAddOnSubscriptionForPayment(db: Runner, paymentId: string): Promise<AddOnSubscription | null> {
  if (!isUuid(paymentId)) return null;
  const rows = await db
    .select({ addOn: addOnSubscriptions })
    .from(addOnPayments)
    .innerJoin(addOnSubscriptions, eq(addOnSubscriptions.id, addOnPayments.addOnSubscriptionId))
    .where(eq(addOnPayments.paymentId, paymentId))
    .limit(1);
  return rows[0]?.addOn ?? null;
}

export interface AddOnProviderPlanKey {
  readonly addOn: string;
  readonly netAmountCents: number;
  readonly taxRateBasisPoints: number;
  readonly currency: BillingCurrency;
  readonly provider: BillingProviderName;
}

function planKeyWhere(key: AddOnProviderPlanKey): SQL | undefined {
  return and(
    eq(addOnProviderPlans.addOn, key.addOn),
    eq(addOnProviderPlans.netAmountCents, key.netAmountCents),
    eq(addOnProviderPlans.taxRateBasisPoints, key.taxRateBasisPoints),
    eq(addOnProviderPlans.currency, key.currency),
    eq(addOnProviderPlans.provider, key.provider),
  );
}

/** The provider's plan already made for this add-on at this amount, or null. Staff connection only. */
export async function findAddOnProviderPlan(db: Runner, key: AddOnProviderPlanKey): Promise<string | null> {
  const rows = await db
    .select({ providerPlanId: addOnProviderPlans.providerPlanId })
    .from(addOnProviderPlans)
    .where(planKeyWhere(key))
    .limit(1);
  return rows[0]?.providerPlanId ?? null;
}

/**
 * Remembers the provider's plan for this add-on and amount and returns the id now stored. Two callers racing to make a
 * plan converge on one: the first insert wins and both read it back. Staff connection only.
 */
export async function saveAddOnProviderPlan(db: Runner, key: AddOnProviderPlanKey & { readonly providerPlanId: string }): Promise<string> {
  await db.insert(addOnProviderPlans).values(key).onConflictDoNothing();
  const stored = await findAddOnProviderPlan(db, key);
  if (stored === null) throw new Error(`No stored plan for add-on ${key.addOn} at ${key.netAmountCents} after saving one`);
  return stored;
}

/** Records that staff have contacted the customer about a purchase. False when it was already marked, or is not a paid row. Staff connection only. */
export async function markAddOnContacted(db: Runner, input: { readonly id: string; readonly staffUserId: string; readonly now: Date }): Promise<boolean> {
  if (!isUuid(input.id)) return false;
  const rows = await db
    .update(addOnSubscriptions)
    .set({ contactedAt: input.now, contactedByStaffId: input.staffUserId, updatedAt: input.now })
    .where(and(eq(addOnSubscriptions.id, input.id), isNull(addOnSubscriptions.contactedAt), isNotNull(addOnSubscriptions.activatedAt)))
    .returning({ id: addOnSubscriptions.id });
  return rows.length > 0;
}

/** The business's paid press releases, newest first, with what the charge was and when it was paid. Works through row-level security. */
export async function listPressReleasesForBusiness(
  db: Runner,
  businessId: string,
): Promise<Array<PressRelease & { readonly paidAt: Date | null; readonly amountCents: number }>> {
  if (!isUuid(businessId)) return [];
  const rows = await db
    .select({ release: pressReleases, paidAt: charges.paidAt, amountCents: charges.amountCents })
    .from(pressReleases)
    .innerJoin(charges, eq(charges.id, pressReleases.chargeId))
    .where(eq(pressReleases.businessId, businessId))
    .orderBy(desc(pressReleases.createdAt), desc(pressReleases.id));
  return rows.map(({ release, paidAt, amountCents }) => ({ ...release, paidAt, amountCents }));
}

type PressReleaseStatus = PressRelease["status"];

/** The statuses a release may be moved on from, to reach each status. A release only ever moves forward. */
const PRESS_RELEASE_STATUSES_BEFORE: Readonly<Record<PressReleaseStatus, readonly PressReleaseStatus[]>> = {
  waiting: [],
  in_progress: ["waiting"],
  published: ["waiting", "in_progress"],
};

/**
 * Moves a press release forward (waiting, then in progress, then published) and records who did it and when. Skipping a
 * step is allowed. It never moves backward and never repeats: a form left open while someone else moved the release on,
 * or a double click, changes nothing and keeps the earlier author and time. Returns whether the release changed; false
 * also covers a release that does not exist. Staff connection only.
 */
export async function setPressReleaseStatus(
  db: Runner,
  input: { readonly id: string; readonly status: PressReleaseStatus; readonly staffUserId: string; readonly now: Date },
): Promise<boolean> {
  if (!isUuid(input.id)) return false;
  const before = PRESS_RELEASE_STATUSES_BEFORE[input.status];
  if (before.length === 0) return false;
  const rows = await db
    .update(pressReleases)
    .set({ status: input.status, statusChangedAt: input.now, statusChangedByStaffId: input.staffUserId })
    .where(and(eq(pressReleases.id, input.id), inArray(pressReleases.status, [...before])))
    .returning({ id: pressReleases.id });
  return rows.length > 0;
}

export interface AddOnToContact {
  /** A monthly add-on of its own, one taken with the plan at the first checkout, or a press release. */
  readonly kind: "subscription" | "bundled" | "press-release";
  readonly id: string;
  readonly businessId: string;
  readonly businessName: string;
  /** A catalogue id: "digital-growth", "local-seo-aeo" or "press-release". */
  readonly addOn: string;
  /** When it was paid (a purchase) or bought (a press release). */
  readonly at: Date;
}

/**
 * What staff should get in touch about, oldest first: paid purchases (separate, or taken with the plan) not yet marked
 * contacted, and press releases still waiting. Staff connection only.
 */
export async function listAddOnsToContact(db: Runner, limit: number): Promise<AddOnToContact[]> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("limit must be a positive integer");
  const subscriptionRows = await db
    .select({
      id: addOnSubscriptions.id,
      businessId: addOnSubscriptions.businessId,
      businessName: businesses.name,
      addOn: addOnSubscriptions.addOn,
      activatedAt: addOnSubscriptions.activatedAt,
    })
    .from(addOnSubscriptions)
    .innerJoin(businesses, eq(businesses.id, addOnSubscriptions.businessId))
    .where(and(isNotNull(addOnSubscriptions.activatedAt), isNull(addOnSubscriptions.contactedAt)))
    .orderBy(asc(addOnSubscriptions.activatedAt), asc(addOnSubscriptions.id))
    .limit(limit);
  const bundledRows = await db
    .select({
      id: bundledAddOns.id,
      businessId: bundledAddOns.businessId,
      businessName: businesses.name,
      addOn: bundledAddOns.addOn,
      activatedAt: bundledAddOns.activatedAt,
    })
    .from(bundledAddOns)
    .innerJoin(businesses, eq(businesses.id, bundledAddOns.businessId))
    .where(and(isNotNull(bundledAddOns.activatedAt), isNull(bundledAddOns.contactedAt)))
    .orderBy(asc(bundledAddOns.activatedAt), asc(bundledAddOns.id))
    .limit(limit);
  const releaseRows = await db
    .select({
      id: pressReleases.id,
      businessId: pressReleases.businessId,
      businessName: businesses.name,
      createdAt: pressReleases.createdAt,
    })
    .from(pressReleases)
    .innerJoin(businesses, eq(businesses.id, pressReleases.businessId))
    .where(eq(pressReleases.status, "waiting"))
    .orderBy(asc(pressReleases.createdAt), asc(pressReleases.id))
    .limit(limit);

  const items: AddOnToContact[] = [
    ...subscriptionRows.flatMap(({ activatedAt, ...row }) =>
      // The filter above makes the activation time present.
      activatedAt === null ? [] : [{ kind: "subscription" as const, ...row, at: activatedAt }],
    ),
    ...bundledRows.flatMap(({ activatedAt, ...row }) =>
      activatedAt === null ? [] : [{ kind: "bundled" as const, ...row, at: activatedAt }],
    ),
    ...releaseRows.map(({ createdAt, ...row }) => ({ kind: "press-release" as const, ...row, addOn: "press-release", at: createdAt })),
  ];
  return items.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id)).slice(0, limit);
}

/** The add-ons whose first-checkout purchase carries the 5% lifetime offer, by catalogue id. */
export interface LifetimeOfferStanding {
  readonly claimed: readonly string[];
}

/**
 * Which add-ons the business claimed the 5% lifetime offer on, read from the purchases alone, so there is no flag to drift
 * from the money. An add-on is claimed when a row of it was activated (its first payment recorded) with the offer in its
 * price; a cancelled row counts, because the discount is for life. Staff connection, or the owner's own scope.
 */
export async function findLifetimeOfferStanding(db: Runner, businessId: string): Promise<LifetimeOfferStanding> {
  if (!isUuid(businessId)) return { claimed: [] };
  const separate = await db
    .selectDistinct({ addOn: addOnSubscriptions.addOn })
    .from(addOnSubscriptions)
    .where(
      and(
        eq(addOnSubscriptions.businessId, businessId),
        isNotNull(addOnSubscriptions.activatedAt),
        sql`${addOnSubscriptions.offerDiscountAmountCents} > 0`,
      ),
    );
  // An add-on taken at the first checkout is billed inside the plan; once active (or later removed) it has claimed the offer too.
  const bundled = await db
    .selectDistinct({ addOn: bundledAddOns.addOn })
    .from(bundledAddOns)
    .where(
      and(
        eq(bundledAddOns.businessId, businessId),
        isNotNull(bundledAddOns.activatedAt),
        sql`${bundledAddOns.offerDiscountAmountCents} > 0`,
      ),
    );
  return { claimed: [...new Set([...separate, ...bundled].map((row) => row.addOn))] };
}
