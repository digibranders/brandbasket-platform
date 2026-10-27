import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import {
  assertMinorUnits,
  findPaymentByProviderId,
  manualColumns,
  PAYMENT_COLUMNS,
  PaymentReadBackError,
  paymentMethodValues,
  type ManualPaymentRecord,
  type Payment,
  type PaymentMethodDetails,
  type UnappliedPaymentReason,
} from "./billing";
import { startPaidChangeRequest } from "./change-request-payment";
import { markDirectoryAdWinPaid } from "./directory-ads";
import { startDirectoryPromotionForCharge } from "./directory-promotions";
import { applyPaidBundledAddOn, bundledAddOnStillApplies, dropBundledAddOnOfCharge } from "./bundled-add-ons";
import { applyPaidPlanUpgrade, cancelStalePlanUpgrade, planUpgradeStillApplies } from "./plan-upgrades";
import {
  charges,
  payments,
  planUpgrades,
  pressReleases,
  type BillingCurrency,
  type BillingProviderName,
  type ChargeKind,
  type ChargeStatus,
} from "../schema";

type Runner = Database | ScopedTransaction;

const MAX_DESCRIPTION_LENGTH = 200;

/** A charge that breaks one of the rules below. The message names the rule, never the customer. */
export class InvalidChargeError extends Error {
  constructor(reason: string) {
    super(`The charge is not valid: ${reason}.`);
    this.name = "InvalidChargeError";
  }
}

/** A charge id that does not exist, or belongs to another business. */
export class ChargeNotFoundError extends Error {
  readonly chargeId: string;

  constructor(chargeId: string) {
    super(`Charge ${chargeId} does not exist for this business.`);
    this.name = "ChargeNotFoundError";
    this.chargeId = chargeId;
  }
}

/** A one-off amount a business owes beside its plan. See the `charges` table. */
export interface Charge {
  readonly id: string;
  readonly businessId: string;
  readonly kind: ChargeKind;
  readonly description: string;
  readonly quantity: number;
  /** Net price of one unit, in minor units of `currency`. */
  readonly unitAmountCents: number;
  readonly taxRateBasisPoints: number;
  /** What is charged: net times quantity, with the tax on top. */
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly status: ChargeStatus;
  readonly createdByStaffId: string | null;
  readonly provider: BillingProviderName | null;
  readonly providerOrderId: string | null;
  readonly paymentId: string | null;
  readonly paidAt: Date | null;
  readonly waivedAt: Date | null;
  readonly createdAt: Date;
}

const CHARGE_COLUMNS = {
  id: charges.id,
  businessId: charges.businessId,
  kind: charges.kind,
  description: charges.description,
  quantity: charges.quantity,
  unitAmountCents: charges.unitAmountCents,
  taxRateBasisPoints: charges.taxRateBasisPoints,
  amountCents: charges.amountCents,
  currency: charges.currency,
  status: charges.status,
  createdByStaffId: charges.createdByStaffId,
  provider: charges.provider,
  providerOrderId: charges.providerOrderId,
  paymentId: charges.paymentId,
  paidAt: charges.paidAt,
  waivedAt: charges.waivedAt,
  createdAt: charges.createdAt,
} as const;

export interface NewCharge {
  readonly businessId: string;
  readonly kind: ChargeKind;
  readonly description: string;
  readonly quantity: number;
  readonly unitAmountCents: number;
  readonly taxRateBasisPoints: number;
  /** Worked out by the caller with chargedAmountCents; checked here to be at least the net total. */
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  /** The staff user adding it, or null when the dashboard adds it for the customer (a blog unlock). */
  readonly createdByStaffId: string | null;
}

function assertValidCharge(input: NewCharge): void {
  if (input.description !== input.description.trim() || input.description === "") {
    throw new InvalidChargeError("the description must be non-empty with no surrounding spaces");
  }
  if (input.description.length > MAX_DESCRIPTION_LENGTH) {
    throw new InvalidChargeError(`the description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) {
    throw new InvalidChargeError("the quantity must be a whole number, at least 1");
  }
  if (!Number.isSafeInteger(input.unitAmountCents) || input.unitAmountCents < 1) {
    throw new InvalidChargeError("the unit price must be a whole number of minor units, at least 1");
  }
  if (!Number.isSafeInteger(input.taxRateBasisPoints) || input.taxRateBasisPoints < 0) {
    throw new InvalidChargeError("the tax rate must be a whole, non-negative number of basis points");
  }
  assertMinorUnits(input.amountCents);
  if (input.amountCents < input.unitAmountCents * input.quantity) {
    throw new InvalidChargeError("the amount charged cannot be less than the net total");
  }
}

/** Adds an open charge. Staff connection only. */
export async function insertCharge(db: Runner, input: NewCharge): Promise<Charge> {
  assertValidCharge(input);
  const rows = await db.insert(charges).values(input).returning(CHARGE_COLUMNS);
  const charge = rows[0];
  if (charge === undefined) throw new Error("Inserting a charge returned no row");
  return charge;
}

/**
 * The open blog-post unlock for a business, adding it from `input` when there is none. A partial unique index
 * allows only one open unlock per business, so asking twice (a double click, two tabs) reuses the first rather than
 * charging for two blocks. Staff connection only.
 */
export async function openBlogPostsCharge(db: Runner, input: NewCharge): Promise<Charge> {
  if (input.kind !== "blog_posts") throw new InvalidChargeError("only a blog_posts charge can be an unlock");
  assertValidCharge(input);
  await db.insert(charges).values(input).onConflictDoNothing();
  const rows = await db
    .select(CHARGE_COLUMNS)
    .from(charges)
    .where(and(eq(charges.businessId, input.businessId), eq(charges.kind, "blog_posts"), eq(charges.status, "open")))
    .limit(1);
  const charge = rows[0];
  if (charge === undefined) throw new Error(`No open blog_posts charge for business ${input.businessId} after inserting one`);
  return charge;
}

/** The business's charges, newest first. Works through row-level security. */
export async function listChargesForBusiness(
  db: Runner,
  businessId: string,
  options: { readonly status?: ChargeStatus; readonly limit: number },
): Promise<Charge[]> {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1) throw new RangeError("limit must be a positive integer");
  const where =
    options.status === undefined
      ? eq(charges.businessId, businessId)
      : and(eq(charges.businessId, businessId), eq(charges.status, options.status));
  return db
    .select(CHARGE_COLUMNS)
    .from(charges)
    .where(where)
    .orderBy(desc(charges.createdAt), desc(charges.id))
    .limit(options.limit);
}

/**
 * The newest open charge of one kind for the business, or null. A customer who abandons a payment and starts again can
 * be sent back to it rather than given another unpaid line. Works through row-level security.
 */
export async function findOpenChargeOfKind(db: Runner, businessId: string, kind: ChargeKind): Promise<Charge | null> {
  const rows = await db
    .select(CHARGE_COLUMNS)
    .from(charges)
    .where(and(eq(charges.businessId, businessId), eq(charges.kind, kind), eq(charges.status, "open")))
    .orderBy(desc(charges.createdAt), desc(charges.id))
    .limit(1);
  return rows[0] ?? null;
}

/** One of the business's charges, or null. Scoped by business so a guessed id from another business finds nothing. */
export async function findChargeForBusiness(db: Runner, businessId: string, chargeId: string): Promise<Charge | null> {
  const rows = await db
    .select(CHARGE_COLUMNS)
    .from(charges)
    .where(and(eq(charges.id, chargeId), eq(charges.businessId, businessId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The charge a payment settled, or null. Scoped by business like findChargeForBusiness. Staff connection: a staff member
 * issuing a missing invoice starts from the payment and needs the charge it paid for.
 */
export async function findChargeByPaymentId(db: Runner, businessId: string, paymentId: string): Promise<Charge | null> {
  const rows = await db
    .select(CHARGE_COLUMNS)
    .from(charges)
    .where(and(eq(charges.businessId, businessId), eq(charges.paymentId, paymentId)))
    .limit(1);
  return rows[0] ?? null;
}

/** The charge an online payment attempt belongs to, from the provider's own id for it. Staff connection only. */
export async function findChargeByProviderOrder(
  db: Runner,
  provider: BillingProviderName,
  providerOrderId: string,
): Promise<Charge | null> {
  const rows = await db
    .select(CHARGE_COLUMNS)
    .from(charges)
    .where(and(eq(charges.provider, provider), eq(charges.providerOrderId, providerOrderId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Records the provider's id for a new online payment attempt on an open charge, replacing any earlier attempt's.
 * False when the charge is not open any more (paid or waived meanwhile), so the caller does not send the customer
 * to pay it. Staff connection only.
 */
export async function setChargeProviderOrder(
  db: Runner,
  input: {
    readonly chargeId: string;
    readonly businessId: string;
    readonly provider: BillingProviderName;
    readonly providerOrderId: string;
  },
): Promise<boolean> {
  const rows = await db
    .update(charges)
    .set({ provider: input.provider, providerOrderId: input.providerOrderId })
    .where(and(eq(charges.id, input.chargeId), eq(charges.businessId, input.businessId), eq(charges.status, "open")))
    .returning({ id: charges.id });
  return rows.length > 0;
}

/** Waives an open charge. False when it was not open (already paid or waived). Staff connection only. */
export async function waiveCharge(
  db: Runner,
  input: { readonly chargeId: string; readonly businessId: string; readonly staffId: string; readonly now: Date },
): Promise<boolean> {
  const rows = await db
    .update(charges)
    .set({ status: "waived", waivedAt: input.now, waivedByStaffId: input.staffId })
    .where(and(eq(charges.id, input.chargeId), eq(charges.businessId, input.businessId), eq(charges.status, "open")))
    .returning({ id: charges.id, kind: charges.kind });
  // Waiving the charge of a move up that has not been paid ends the move: nothing is left to pay for it.
  if (rows[0]?.kind === "plan_upgrade") {
    await db
      .update(planUpgrades)
      .set({ status: "cancelled", cancelledAt: input.now, updatedAt: input.now })
      .where(and(eq(planUpgrades.chargeId, input.chargeId), eq(planUpgrades.status, "open")));
  }
  // Waiving the charge of an add-on that has not been paid drops the add-on: nothing is left to pay for it.
  if (rows[0]?.kind === "add_on") await dropBundledAddOnOfCharge(db, input.chargeId, input.now);
  return rows.length > 0;
}

/** How many blocks of blog posts the business has paid for. Works through row-level security. */
export async function countPaidBlogBlocks(db: Runner, businessId: string): Promise<number> {
  const rows = await db
    .select({ blocks: sql<number>`coalesce(sum(${charges.quantity}), 0)`.mapWith(Number) })
    .from(charges)
    .where(and(eq(charges.businessId, businessId), eq(charges.kind, "blog_posts"), eq(charges.status, "paid")));
  return rows[0]?.blocks ?? 0;
}

export interface ChargePayment {
  readonly chargeId: string;
  readonly businessId: string;
  readonly provider: BillingProviderName;
  /** The provider's id for the payment: what makes recording it idempotent. */
  readonly providerPaymentId: string;
  /** What the provider says it took, in minor units of `currency`. */
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly paidAt: Date;
  readonly now: Date;
  readonly method?: PaymentMethodDetails | null;
  /** Required when `provider` is `manual`: who recorded the bank transfer, its reference and date. */
  readonly manual?: ManualPaymentRecord;
}

/**
 * What recording did: `paid` settled the charge; `not-open`, `amount-mismatch`, `upgrade-not-applied` and
 * `add-on-not-applied` kept the money on record but flagged it for staff (a payment for a charge already paid or waived
 * is a duplicate to refund; a wrong amount or currency is never treated as payment in full; a payment for a move up or an
 * add-on whose quote no longer stood buys nothing, see planUpgradeStillApplies and bundledAddOnStillApplies).
 */
export type ChargePaymentOutcome = "paid" | "not-open" | "amount-mismatch" | "upgrade-not-applied" | "add-on-not-applied";

export interface RecordedChargePayment {
  readonly payment: Payment;
  readonly outcome: ChargePaymentOutcome;
  /** True when this provider payment had already been recorded; nothing was written a second time. */
  readonly alreadyRecorded: boolean;
}

function flagFor(outcome: ChargePaymentOutcome): UnappliedPaymentReason | null {
  if (outcome === "not-open") return "already_paid";
  if (outcome === "amount-mismatch") return "amount_mismatch";
  if (outcome === "upgrade-not-applied") return "upgrade_not_applied";
  if (outcome === "add-on-not-applied") return "add_on_not_applied";
  return null;
}

/**
 * Records money taken for a charge and, when it matches, marks the charge paid, in one transaction: a paid charge
 * always has exactly one payment, and a payment never pays a charge it does not match. The charge row is locked
 * first, so two deliveries of the same payment (or a webhook racing a staff "mark paid") cannot both settle it.
 * Idempotent on `(provider, providerPaymentId)`, like recordPaymentAndActivate. Staff connection only.
 *
 * This records the payment and nothing else: it issues no tax invoice. Application code calls
 * `recordChargePaymentWithInvoice` in `@brandbasket/shared`, which invoices a charge this settled in the same transaction.
 * The raw function is for that wrapper and for tests.
 */
export async function recordChargePayment(db: Runner, input: ChargePayment): Promise<RecordedChargePayment> {
  assertMinorUnits(input.amountCents);
  const manual = manualColumns(input.provider, input.manual);
  return db.transaction(async (tx) => {
    const locked = await tx
      .select({
        status: charges.status,
        kind: charges.kind,
        promotionTag: charges.promotionTag,
        amountCents: charges.amountCents,
        currency: charges.currency,
      })
      .from(charges)
      .where(and(eq(charges.id, input.chargeId), eq(charges.businessId, input.businessId)))
      .limit(1)
      .for("update");
    const charge = locked[0];
    if (charge === undefined) throw new ChargeNotFoundError(input.chargeId);

    const existing = await findPaymentByProviderId(tx, input.provider, input.providerPaymentId);
    if (existing !== null) {
      const outcome: ChargePaymentOutcome =
        existing.attentionReason === "already_paid"
          ? "not-open"
          : existing.attentionReason === "amount_mismatch"
            ? "amount-mismatch"
            : existing.attentionReason === "upgrade_not_applied"
              ? "upgrade-not-applied"
              : existing.attentionReason === "add_on_not_applied"
                ? "add-on-not-applied"
                : "paid";
      return { payment: existing, outcome, alreadyRecorded: true };
    }

    const matched: ChargePaymentOutcome =
      charge.status !== "open"
        ? "not-open"
        : charge.amountCents !== input.amountCents || charge.currency !== input.currency
          ? "amount-mismatch"
          : "paid";
    // A move up or an add-on is only bought while the subscription is in the state the quote was for.
    const outcome: ChargePaymentOutcome =
      matched === "paid" && charge.kind === "plan_upgrade" && !(await planUpgradeStillApplies(tx, input.chargeId))
        ? "upgrade-not-applied"
        : matched === "paid" && charge.kind === "add_on" && !(await bundledAddOnStillApplies(tx, input.chargeId))
          ? "add-on-not-applied"
          : matched;
    const reason = flagFor(outcome);

    const inserted = await tx
      .insert(payments)
      .values({
        businessId: input.businessId,
        subscriptionId: null,
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        kind: "charge",
        amountCents: input.amountCents,
        currency: input.currency,
        status: "captured",
        paidAt: input.paidAt,
        ...(reason === null ? {} : { attentionReason: reason, attentionRaisedAt: input.now }),
        ...manual,
        ...paymentMethodValues(input.method),
      })
      .onConflictDoNothing({ target: [payments.provider, payments.providerPaymentId] })
      .returning(PAYMENT_COLUMNS);
    const payment = inserted[0];
    if (payment === undefined) {
      // A concurrent delivery committed the same payment after the read above; report it rather than doubling it.
      const raced = await findPaymentByProviderId(tx, input.provider, input.providerPaymentId);
      if (raced === null) throw new PaymentReadBackError(input.provider, input.providerPaymentId);
      return { payment: raced, outcome, alreadyRecorded: true };
    }

    if (outcome === "paid") {
      await tx
        .update(charges)
        .set({ status: "paid", paymentId: payment.id, paidAt: input.paidAt })
        .where(eq(charges.id, input.chargeId));
      // A paid listing promotion is its week: started here, in the same transaction, so the two never disagree.
      if (charge.kind === "listing_promotion") {
        if (charge.promotionTag === null) throw new InvalidChargeError("a listing promotion charge must name its tag");
        await startDirectoryPromotionForCharge(tx, {
          chargeId: input.chargeId,
          businessId: input.businessId,
          tag: charge.promotionTag,
          now: input.now,
        });
      }
      // A paid ad spot is its ad: marked paid here, in the same transaction, so the ad and the money never disagree.
      if (charge.kind === "directory_ad") await markDirectoryAdWinPaid(tx, input.chargeId, input.paidAt);
      // A paid move up is Premium from this moment: the subscription's pending plan is set in the same transaction.
      if (charge.kind === "plan_upgrade") await applyPaidPlanUpgrade(tx, input.chargeId, input.paidAt);
      // A paid add-on is on from this moment, and the next renewal's amount is raised in the same transaction.
      if (charge.kind === "add_on") await applyPaidBundledAddOn(tx, input.chargeId, input.paidAt);
      // A paid change quote starts its change request in the same transaction, so the money and the start never disagree.
      if (charge.kind === "change_hours") await startPaidChangeRequest(tx, input.chargeId);
      // A paid press release starts its status row, waiting for the team, in the same transaction as the money.
      if (charge.kind === "press_release") {
        await tx
          .insert(pressReleases)
          .values({ businessId: input.businessId, chargeId: input.chargeId })
          .onConflictDoNothing({ target: pressReleases.chargeId });
      }
    }
    // The quote went stale before the money arrived: nothing is applied, and the charge is closed so it cannot be paid
    // again; the payment stays on record, flagged for a refund.
    if (outcome === "upgrade-not-applied" || outcome === "add-on-not-applied") {
      if (outcome === "upgrade-not-applied") await cancelStalePlanUpgrade(tx, input.chargeId, input.now);
      else await dropBundledAddOnOfCharge(tx, input.chargeId, input.now);
      await tx
        .update(charges)
        .set({ status: "waived", waivedAt: input.now })
        .where(and(eq(charges.id, input.chargeId), eq(charges.status, "open")));
    }
    return { payment, outcome, alreadyRecorded: false };
  });
}
