import { discountCentsFor, firstYearDiscountCents, isChargeableDiscount } from "@brandbasket/billing/referral";
import type { BillingInterval, BillingProviderName, ReferralDiscount } from "@brandbasket/db";
import { MONTHLY_ADD_ON_IDS, PAUSED_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { planFirstPayment } from "@brandbasket/shared/lib/billing/first-payment";
import { packageLines } from "@brandbasket/shared/lib/billing/packages";
import { parsePercent } from "@brandbasket/shared/lib/billing/referral-value";
import { type BuildDiscountInput, type SetupFee, buildDiscountCents, setupFeeFor } from "@brandbasket/shared/lib/billing/setup-fee";
import type { WebsiteKind } from "@brandbasket/shared/lib/billing/website-kind";
import { type MoneyCurrency, parseMoney } from "@brandbasket/shared/lib/money";

/**
 * What a payment link costs the customer, worked out with the shared billing rules and nothing else. The console's live summary and
 * the server's check of the form both call this, so a price is never typed on a screen and the two can never disagree.
 */

/** The services a link can sell today: the catalogue less what is paused for sale. */
export const LINK_SERVICE_IDS: readonly MonthlyAddOnId[] = MONTHLY_ADD_ON_IDS.filter((id) => !PAUSED_ADD_ON_IDS.includes(id));

/** The longest staff note on a build discount. */
export const NOTE_MAX_LENGTH = 200;

export type BuildDiscountKind = "none" | "amount" | "percent" | "final";

export type BuildDiscountRead = { readonly ok: true; readonly cents: number } | { readonly ok: false; readonly reason: "unreadable" | "too-much" };

/**
 * What staff typed for the build discount, as cents off a list fee. "none" is 0. Used by the form's live summary and by the server's
 * check, so both read the three kinds the same way. A percentage rounds down to a whole rupee or dollar (buildDiscountCents).
 */
export function readBuildDiscount(kind: BuildDiscountKind, typed: string, listCents: number): BuildDiscountRead {
  if (kind === "none") return { ok: true, cents: 0 };
  const value = kind === "percent" ? parsePercent(typed) : parseMoney(typed);
  if (value === null) return { ok: false, reason: "unreadable" };
  const input: BuildDiscountInput = kind === "percent" ? { kind, basisPoints: value } : { kind, cents: value };
  try {
    return { ok: true, cents: buildDiscountCents(listCents, input) };
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, reason: "too-much" };
    throw error;
  }
}

/** The coupon a link carries, reduced to what the arithmetic needs. */
export interface LinkCoupon {
  readonly discount: ReferralDiscount;
  readonly discountMonths: number | null;
}

export interface LinkDealInput {
  readonly services: readonly MonthlyAddOnId[];
  readonly interval: BillingInterval;
  readonly currency: MoneyCurrency;
  /** Null when the basket holds no Website Management. */
  readonly websiteKind: WebsiteKind | null;
  /** What the deal takes off the build fee, in minor units. 0 when none. */
  readonly buildDiscountCents: number;
  readonly coupon: LinkCoupon | null;
  /** The billing provider: the first-month offer is not given on bank transfer. */
  readonly provider: BillingProviderName;
}

export type LinkSummary =
  | { readonly kind: "refused"; readonly reason: "coupon-on-yearly-fee" | "coupon-not-chargeable" }
  | {
      readonly kind: "priced";
      readonly fee: SetupFee | null;
      /** What the customer pays when they open the link and pay. */
      readonly payTodayCents: number;
      /** The basket's price from `chargeInMonths` on, every cycle. */
      readonly thenCents: number;
      /** Months after the payment to the first full charge: 1, 12 for an ordinary yearly checkout, 13 for a yearly build-fee deal. */
      readonly chargeInMonths: number;
      /** The coupon's amount off the next charge, 0 with none. */
      readonly couponCents: number;
    };

/** What a coupon takes off a basket that nets `netCents` a cycle, or null when it takes nothing or leaves nothing to charge. */
export function couponCentsFor(coupon: LinkCoupon, interval: BillingInterval, netCents: number): number | null {
  const cents = interval === "year" ? firstYearDiscountCents(coupon.discount, netCents, coupon.discountMonths) : discountCentsFor(coupon.discount, netCents);
  return isChargeableDiscount(netCents, cents) ? cents : null;
}

export function summariseLink(input: LinkDealInput): LinkSummary {
  const lines = packageLines({ services: input.services, forfeited: true }, input.currency, input.interval, input.websiteKind ?? "b2b");
  const netCents = lines.reduce((total, line) => total + line.netCents, 0);
  const fee = input.websiteKind === null ? null : setupFeeFor(input.websiteKind, input.currency, input.buildDiscountCents);

  let couponCents = 0;
  if (input.coupon !== null) {
    const worked = couponCentsFor(input.coupon, input.interval, netCents);
    if (worked === null) return { kind: "refused", reason: "coupon-not-chargeable" };
    couponCents = worked;
  }

  const plan = planFirstPayment({
    lines: lines.map((line) => ({ addOn: line.addOn, netCents: line.netCents, hadService: false })),
    interval: input.interval,
    provider: input.provider,
    currency: input.currency,
    discountCents: couponCents,
    ...(fee === null ? {} : { setupFeeNetCents: fee.netCents }),
  });
  if (plan.kind === "code-refused") {
    return { kind: "refused", reason: fee !== null && fee.netCents > 0 && input.interval === "year" ? "coupon-on-yearly-fee" : "coupon-not-chargeable" };
  }
  if (plan.kind === "ordinary") {
    return { kind: "priced", fee, payTodayCents: netCents - couponCents, thenCents: netCents - couponCents, chargeInMonths: input.interval === "year" ? 12 : 1, couponCents };
  }
  // A yearly build-fee deal takes no coupon (refused above), and a monthly one starts it with the first full charge.
  return {
    kind: "priced",
    fee,
    payTodayCents: plan.firstPaymentCents,
    thenCents: netCents - (input.interval === "year" ? 0 : couponCents),
    chargeInMonths: plan.firstChargeMonths,
    couponCents,
  };
}

export const SUMMARY_REFUSALS: Readonly<Record<Extract<LinkSummary, { kind: "refused" }>["reason"], string>> = {
  "coupon-on-yearly-fee": "A coupon cannot go on a yearly link that has a build fee. Take the discount off the build fee instead.",
  "coupon-not-chargeable": "That coupon takes nothing off this basket, or more than it costs.",
};
