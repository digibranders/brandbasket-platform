import "server-only";
import {
  chargedAmountCents,
  discountCentsFor,
  isChargeableDiscount,
  MAX_DISCOUNT_BASIS_POINTS,
  normaliseReferralCode,
} from "@firstfold/billing";
import {
  billingCurrency,
  createReferralCode,
  deleteReferralCode,
  findActivePlan,
  findAffiliateById,
  findReferralCodeById,
  updateReferralCode,
  type BillingCurrency,
  type Database,
  type Plan,
  type ReferralCode,
  type ReferralDiscount,
} from "@firstfold/db";
import { formatPercent, parsePercent } from "@firstfold/shared/lib/billing/referral-value";
import { formatMoney, parseMoney } from "@firstfold/shared/lib/money";
import { getStaffDb } from "./db";

/**
 * Creating and retiring codes: coupons, and the codes an affiliate earns from. Every field is validated here, on the
 * server, whatever the form allowed: a discount that leaves nothing to charge would not fail until a member tried to
 * pay.
 */

/** Which form field a refusal belongs to, so the console can mark and focus it. */
export type ReferralField =
  | "code"
  | "currency"
  | "discountKind"
  | "discountValue"
  | "expiresAt"
  | "maxRedemptions"
  | "confirm";

export interface ReferralRefusal {
  readonly message: string;
  readonly field: ReferralField | null;
}

export type ReferralAdminOutcome =
  | { readonly kind: "created"; readonly code: ReferralCode }
  | { readonly kind: "updated"; readonly code: ReferralCode }
  /** `clearedApplications` is how many customers had applied it without paying and have just lost it. */
  | { readonly kind: "deleted"; readonly clearedApplications: number }
  | { readonly kind: "refused"; readonly refusal: ReferralRefusal };

function refused(message: string, field: ReferralField | null): ReferralAdminOutcome {
  return { kind: "refused", refusal: { message, field } };
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isCurrency(value: string): value is BillingCurrency {
  return (billingCurrency.enumValues as readonly string[]).includes(value);
}

/**
 * A whole number typed into an optional field: null when left blank, undefined when it is not a whole number at
 * all. The two are different answers and the caller must not confuse "no cap" with "a cap I could not read".
 */
function optionalWholeNumber(raw: string): number | null | undefined {
  if (raw === "") return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/** What the discount control chose. "none" is offered only on an affiliate's code, and checked again below. */
type DiscountChoice = "amount" | "percent" | "none";

function readDiscountKind(formData: FormData): DiscountChoice | undefined {
  const raw = text(formData, "discountKind");
  if (raw === "" || raw === "amount") return "amount";
  return raw === "percent" || raw === "none" ? raw : undefined;
}

type Read<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: ReferralAdminOutcome };

/**
 * The discount as typed, before it is measured against a plan: a positive amount, a percentage from 0.01% to 99%,
 * or, for an affiliate's code only, none at all. Whether it leaves anything to charge is the caller's next check,
 * because that needs the plan.
 */
function readDiscount(formData: FormData, forAffiliate: boolean): Read<ReferralDiscount | null> {
  const kind = readDiscountKind(formData);
  if (kind === undefined || (kind === "none" && !forAffiliate)) {
    return { ok: false, refusal: refused("Choose an amount or a percentage.", "discountKind") };
  }
  if (kind === "none") return { ok: true, value: null };
  const raw = text(formData, "discountValue");
  if (kind === "amount") {
    const amountCents = parseMoney(raw);
    return amountCents === null
      ? { ok: false, refusal: refused("How much comes off each month, as an amount like 500 or 12.50.", "discountValue") }
      : { ok: true, value: { kind, amountCents } };
  }
  const basisPoints = parsePercent(raw);
  return basisPoints === null || basisPoints < 1 || basisPoints > MAX_DISCOUNT_BASIS_POINTS
    ? {
        ok: false,
        refusal: refused(
          `How much comes off each month, as a percentage from 0.01% to ${formatPercent(MAX_DISCOUNT_BASIS_POINTS)} with at most two decimals, like 10 or 12.5.`,
          "discountValue",
        ),
      }
    : { ok: true, value: { kind, basisPoints } };
}

/** A date typed as `YYYY-MM-DD`, read as the end of that day in UTC so the code lasts all of it. */
function optionalExpiry(raw: string): Date | null | undefined {
  if (raw === "") return null;
  const parsed = new Date(`${raw}T23:59:59.999Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

export interface NewReferralCodeInput {
  readonly formData: FormData;
  /** The signed-in superadmin creating it. */
  readonly staffUserId: string;
  /** The affiliate the code earns for, from the page's own params; null makes a coupon. */
  readonly affiliateId: string | null;
  readonly now: Date;
}

/**
 * Creates a coupon, or a code for an affiliate, from the console's form. The discount is checked against the
 * currency's **active plan**: a code worth as much as the plan would leave nothing for Razorpay to authorise, and that
 * would only be discovered at the worst possible moment, while a member is paying. A percentage is resolved to money
 * first, the same way checkout will resolve it, so a share that rounds to nothing is refused here too.
 *
 * An affiliate on a flat reward is paid in one currency, so their codes must be in it: a payment in another currency
 * could not earn them anything.
 */
export async function createReferralCodeFor(input: NewReferralCodeInput): Promise<ReferralAdminOutcome> {
  const { formData, staffUserId, affiliateId, now } = input;

  const code = normaliseReferralCode(text(formData, "code"));
  if (code === null) {
    return refused("A code is 3 to 24 letters, numbers or hyphens, starting with a letter or number.", "code");
  }

  const currencyRaw = text(formData, "currency");
  if (!isCurrency(currencyRaw)) return refused("Choose the currency this code is for.", "currency");
  const currency = currencyRaw;

  const staffDb = getStaffDb();
  if (affiliateId !== null) {
    const affiliate = await findAffiliateById(staffDb, affiliateId);
    if (affiliate === null) return refused("That affiliate no longer exists.", null);
    // A code for an affiliate who is off could never be used: refuse it now rather than let it fail quietly later.
    if (!affiliate.active) return refused(`${affiliate.name} is turned off. Turn them on first, then add the code.`, null);
    if (affiliate.rewardCurrency !== null && affiliate.rewardCurrency !== currency) {
      return refused(
        `${affiliate.name} earns a fixed amount in ${affiliate.rewardCurrency}, so their codes must be in ${affiliate.rewardCurrency} too.`,
        "currency",
      );
    }
  }

  const discountRead = readDiscount(formData, affiliateId !== null);
  if (!discountRead.ok) return discountRead.refusal;
  const discount = discountRead.value;

  // A code may be used on either plan, so it is held to the cheaper one: it must leave something to charge on both.
  const plan = await cheapestActivePlan(staffDb, currency);
  if (plan === null) return refused(`There is no active ${currency} plan to discount.`, "currency");
  if (
    discount !== null &&
    !isChargeableDiscount(plan.initialAmountCents, discountCentsFor(discount, plan.initialAmountCents))
  ) {
    return refused(
      `The discount has to be more than nothing and less than the ${currency} plan's ${formatMoney(plan.initialAmountCents, currency)} a month, or there is nothing left to charge.`,
      "discountValue",
    );
  }

  const expiresAt = optionalExpiry(text(formData, "expiresAt"));
  if (expiresAt === undefined) return refused("That expiry date could not be read.", "expiresAt");
  // A new code that has already expired could never be used. Editing an existing one to a past date is allowed:
  // that is one way of retiring it.
  if (expiresAt !== null && expiresAt <= now) return refused("That date has already passed. Pick a later one, or leave it blank.", "expiresAt");

  const maxRedemptions = optionalWholeNumber(text(formData, "maxRedemptions"));
  if (maxRedemptions === undefined || (maxRedemptions !== null && maxRedemptions < 1)) {
    return refused("Leave the limit blank for no cap, or give a whole number of redemptions.", "maxRedemptions");
  }

  try {
    const created = await createReferralCode(staffDb, {
      code,
      currency,
      affiliateId,
      discount,
      expiresAt,
      maxRedemptions,
      createdByStaffId: staffUserId,
    });
    return { kind: "created", code: created };
  } catch (error) {
    // The unique index is the only refusal a well-formed submission can still hit.
    if (error instanceof Error && error.message.includes("referral_codes_code_unique")) {
      return refused(`${code} already exists. Codes cannot be reused.`, "code");
    }
    throw error;
  }
}

export interface ReferralRetirementInput {
  readonly codeId: string;
  readonly formData: FormData;
}

/**
 * Changes what may still change about a code: whether, until when and how often it may be used.
 *
 * The discount, the currency and the affiliate are fixed for life and never reach this function: anyone already
 * paying carries a frozen copy of the discount, on a Razorpay plan priced for it, and the code is the record of where
 * that came from. Retire it and make another. What an affiliate earns is set on the affiliate, not the code.
 */
export async function retireReferralCodeFor(input: ReferralRetirementInput): Promise<ReferralAdminOutcome> {
  const { codeId, formData } = input;
  const staffDb = getStaffDb();
  const existing = await findReferralCodeById(staffDb, codeId);
  if (existing === null) return refused("That code no longer exists.", null);

  const expiresAt = optionalExpiry(text(formData, "expiresAt"));
  if (expiresAt === undefined) return refused("That expiry date could not be read.", "expiresAt");

  const maxRedemptions = optionalWholeNumber(text(formData, "maxRedemptions"));
  if (maxRedemptions === undefined || (maxRedemptions !== null && maxRedemptions < 1)) {
    return refused("Leave the limit blank for no cap, or give a whole number of redemptions.", "maxRedemptions");
  }

  const updated = await updateReferralCode(staffDb, {
    id: codeId,
    active: formData.get("active") === "on",
    expiresAt,
    maxRedemptions,
  });
  if (updated === null) return refused("That code no longer exists.", null);
  return { kind: "updated", code: updated };
}

/** What a code means in money against today's plan, for the console's summary. */
export interface ReferralWorth {
  /** What the plan charges each month without the code, tax included. */
  readonly planChargeCents: number;
  /** What the code takes off each month before tax: a flat amount, a percentage resolved against the plan, or 0. */
  readonly discountCents: number;
  /** What the customer is charged each month with it, tax included. */
  readonly customerPaysCents: number;
  /** The plan's tax rate, so the console can say whether these figures include GST. */
  readonly taxRateBasisPoints: number;
}

/** The cheaper of the two plans on sale in a currency, or null when neither is. Care and Premium are the only two. */
async function cheapestActivePlan(db: Database, currency: BillingCurrency): Promise<Plan | null> {
  const plans = (await Promise.all([findActivePlan(db, currency, "care"), findActivePlan(db, currency, "premium")])).filter(
    (plan): plan is Plan => plan !== null,
  );
  return plans.reduce<Plan | null>((cheapest, plan) => (cheapest === null || plan.initialAmountCents < cheapest.initialAmountCents ? plan : cheapest), null);
}

/**
 * The code measured against the currency's **current** Premium plan, purely so the console can show what it means today.
 * Nothing is stored from this: a customer's own discount is frozen when they pay, and the reward is accrued per
 * payment. Null when there is no active plan, or when the plan's price has fallen to or below the code's discount
 * since it was made, which is a code that can no longer be charged and should be retired.
 */
export async function referralWorth(code: ReferralCode): Promise<ReferralWorth | null> {
  const plan = await findActivePlan(getStaffDb(), code.currency, "premium");
  if (plan === null) return null;
  const net = plan.initialAmountCents;
  const discountCents = code.discount === null ? 0 : discountCentsFor(code.discount, net);
  if (code.discount !== null && !isChargeableDiscount(net, discountCents)) return null;
  const tax = plan.taxRateBasisPoints;
  return {
    planChargeCents: chargedAmountCents(net, 0, tax),
    discountCents,
    customerPaysCents: chargedAmountCents(net, discountCents, tax),
    taxRateBasisPoints: tax,
  };
}

export interface ReferralDeletionInput {
  readonly codeId: string;
  readonly formData: FormData;
}

/**
 * Deletes a code outright. Permanent, so it asks for the tick first and checks it here rather than trusting the
 * form, and it is refused for any code a subscription points at: that code is part of the billing record of
 * everyone paying on it, and their frozen discount would be left with nothing explaining where it came from.
 * Turning such a code off is the answer instead, which is what the refusal says.
 *
 * A business that applied the code without ever paying loses only a pending discount, so those applications are
 * cleared with it and counted back, for a console that can then say how many customers were affected.
 */
export async function deleteReferralCodeFor(input: ReferralDeletionInput): Promise<ReferralAdminOutcome> {
  const { codeId, formData } = input;
  if (formData.get("confirm") !== "on") {
    return refused("Tick the box to confirm, because deleting a code cannot be undone.", "confirm");
  }

  const outcome = await deleteReferralCode(getStaffDb(), codeId);
  switch (outcome.kind) {
    case "deleted":
      return { kind: "deleted", clearedApplications: outcome.clearedApplications };
    case "in-use":
      return refused(
        outcome.subscriptions === 1
          ? "A customer is on this code, so it belongs to their billing record and cannot be deleted. Turn it off instead."
          : `${outcome.subscriptions} customers are on this code, so it belongs to their billing records and cannot be deleted. Turn it off instead.`,
        null,
      );
    case "not-found":
      return refused("That code no longer exists.", null);
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled referral deletion: ${JSON.stringify(unhandled)}`);
    }
  }
}
