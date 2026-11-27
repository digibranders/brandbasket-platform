import { discountCentsFor, firstYearDiscountCents, isChargeableDiscount } from "@brandbasket/billing/referral";
import type { BillingInterval, BillingProviderName, ReferralDiscount } from "@brandbasket/db";
import { MONTHLY_ADD_ON_IDS, PAUSED_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { type DealAmounts, type DealCustomPrices, dealAmounts, dealLines } from "@brandbasket/shared/lib/billing/deal";
import { planFirstPayment } from "@brandbasket/shared/lib/billing/first-payment";
import { parsePercent } from "@brandbasket/shared/lib/billing/referral-value";
import { type BuildDiscountInput, buildDiscountCents } from "@brandbasket/shared/lib/billing/setup-fee";
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

export type DealAdvanceKind = "amount" | "percent";

export type DealAdvanceRead = { readonly ok: true; readonly amounts: DealAmounts } | { readonly ok: false; readonly reason: "unreadable" | "out-of-range" };

/** What staff typed for the advance of a paid deal, worked out with the shared deal rule (a percentage rounds down to a whole rupee or dollar). */
export function readDealAdvance(
  kind: DealAdvanceKind,
  typed: string,
  build: { readonly currency: MoneyCurrency; readonly kind: WebsiteKind; readonly listCents: number; readonly discountCents: number },
): DealAdvanceRead {
  const value = kind === "percent" ? parsePercent(typed) : parseMoney(typed);
  if (value === null) return { ok: false, reason: "unreadable" };
  try {
    return { ok: true, amounts: dealAmounts({ ...build, advance: kind === "percent" ? { kind, basisPoints: value } : { kind, cents: value } }) };
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, reason: "out-of-range" };
    throw error;
  }
}

/** The form field that carries each service's custom recurring price, and the link column it is stored in. */
export const CUSTOM_PRICE_FIELDS = {
  "managed-website": "websitePrice",
  "social-media": "socialPrice",
  "paid-ads": "adsPrice",
  "expert-monitoring": "monitoringPrice",
} as const satisfies Record<MonthlyAddOnId, string>;

/** The four custom price columns of a link or a draft, as the map the deal rules read: only the prices that are set. */
export function customPricesOf(source: {
  readonly websitePriceCents: number | null;
  readonly socialPriceCents: number | null;
  readonly adsPriceCents: number | null;
  readonly monitoringPriceCents: number | null;
}): DealCustomPrices {
  return {
    ...(source.websitePriceCents === null ? {} : { "managed-website": source.websitePriceCents }),
    ...(source.socialPriceCents === null ? {} : { "social-media": source.socialPriceCents }),
    ...(source.adsPriceCents === null ? {} : { "paid-ads": source.adsPriceCents }),
    ...(source.monitoringPriceCents === null ? {} : { "expert-monitoring": source.monitoringPriceCents }),
  };
}

/** The largest custom price, in whole rupees or dollars: keeps the minor-unit figure inside the database's integer column. */
export const CUSTOM_PRICE_MAX_MAJOR = 10_000_000;

export type CustomPriceRead = { readonly ok: true; readonly cents: number | null } | { readonly ok: false };

/** A custom recurring price as typed: blank is the list price (null), otherwise a positive whole number of rupees or dollars, as minor units. */
export function readCustomPrice(typed: string): CustomPriceRead {
  const cleaned = typed.trim().replaceAll(",", "");
  if (cleaned === "") return { ok: true, cents: null };
  if (!/^[0-9]+$/.test(cleaned)) return { ok: false };
  const major = Number(cleaned);
  return major >= 1 && major <= CUSTOM_PRICE_MAX_MAJOR ? { ok: true, cents: major * 100 } : { ok: false };
}

/** The coupon a link carries, reduced to what the arithmetic needs. */
export interface LinkCoupon {
  readonly discount: ReferralDiscount;
  readonly discountMonths: number | null;
}

/** The build of a paid deal: the finalised price, what staff take off it, and the advance paid first. All minor units. */
export interface LinkBuild {
  readonly listCents: number;
  readonly discountCents: number;
  readonly advanceCents: number;
}

export interface LinkDealInput {
  readonly services: readonly MonthlyAddOnId[];
  readonly interval: BillingInterval;
  readonly currency: MoneyCurrency;
  /** Null when the basket holds no Website Management. */
  readonly websiteKind: WebsiteKind | null;
  /** The build of a paid deal, or null for a free deal. */
  readonly build: LinkBuild | null;
  /** Custom recurring prices for the link's period, only for services in the basket. */
  readonly customPrices: DealCustomPrices;
  readonly coupon: LinkCoupon | null;
  /** The billing provider: the first-month offer is not given on bank transfer. */
  readonly provider: BillingProviderName;
}

export type LinkSummary =
  | { readonly kind: "refused"; readonly reason: "coupon-on-yearly-fee" | "coupon-not-chargeable" | "coupon-with-custom-price" }
  | {
      readonly kind: "priced";
      /** The build of a paid deal worked out, or null for a free deal. */
      readonly deal: DealAmounts | null;
      /** What the customer pays when they open the link and pay: the advance of a paid deal, the first payment of a free one. */
      readonly payTodayCents: number;
      /** A paid deal's payment at go-live: the balance and the first period of the services. Null for a free deal. */
      readonly secondPaymentCents: number | null;
      /** The basket's price from `chargeInMonths` on, every cycle. */
      readonly thenCents: number;
      /** Months after the payment that starts the subscription to the first full charge: 1, or 12 for an ordinary yearly checkout. */
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
  const kind = input.websiteKind ?? "b2b";
  const lines = dealLines({ services: input.services, interval: input.interval, currency: input.currency, kind, customPrices: input.customPrices });
  const netCents = lines.reduce((total, line) => total + line.netCents, 0);
  const priced = lines.some((line) => line.isCustom);

  // A coupon or custom prices, never both (plan 66, O6).
  if (input.coupon !== null && priced) return { kind: "refused", reason: "coupon-with-custom-price" };
  // Conservative until plan 66 step 5 re-verifies it: a coupon on a yearly deal that has a build is refused (plan 65).
  if (input.coupon !== null && input.build !== null && input.interval === "year") return { kind: "refused", reason: "coupon-on-yearly-fee" };

  let couponCents = 0;
  if (input.coupon !== null) {
    const worked = couponCentsFor(input.coupon, input.interval, netCents);
    if (worked === null) return { kind: "refused", reason: "coupon-not-chargeable" };
    couponCents = worked;
  }

  const deal = input.build === null ? null : dealAmounts({ currency: input.currency, kind, ...input.build, advance: { kind: "amount", cents: input.build.advanceCents } });
  const plan = planFirstPayment({
    lines: lines.map((line) => ({ addOn: line.addOn, netCents: line.netCents, hadService: false })),
    interval: input.interval,
    provider: input.provider,
    currency: input.currency,
    discountCents: couponCents,
    ...(deal === null ? {} : { dealBalanceCents: deal.balanceCents }),
  });
  if (plan.kind === "code-refused") return { kind: "refused", reason: "coupon-not-chargeable" };

  const paymentCents = plan.kind === "ordinary" ? netCents - couponCents : plan.firstPaymentCents;
  const chargeInMonths = plan.kind === "ordinary" ? (input.interval === "year" ? 12 : 1) : plan.firstChargeMonths;
  return {
    kind: "priced",
    deal,
    payTodayCents: deal === null ? paymentCents : deal.advanceCents,
    secondPaymentCents: deal === null ? null : paymentCents,
    // A monthly coupon starts with the first full charge; a yearly one takes its first year off (couponCentsFor) and is never on a paid deal.
    thenCents: netCents - couponCents,
    chargeInMonths,
    couponCents,
  };
}

export const SUMMARY_REFUSALS: Readonly<Record<Extract<LinkSummary, { kind: "refused" }>["reason"], string>> = {
  "coupon-on-yearly-fee": "A coupon cannot go on a yearly link that has a build fee. Take the discount off the build fee instead.",
  "coupon-not-chargeable": "That coupon takes nothing off this basket, or more than it costs.",
  "coupon-with-custom-price": "A link takes a coupon or custom prices, not both. Clear the coupon or the prices.",
};
