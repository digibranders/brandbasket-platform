import { discountCentsFor, firstYearDiscountCents, isChargeableDiscount } from "@brandbasket/billing/referral";
import type { BillingInterval, BillingProviderName, ReferralDiscount } from "@brandbasket/db";
import { addOnById, ANNUAL_DISCOUNT_BASIS_POINTS, annualListCents, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { planFirstPayment } from "@brandbasket/shared/lib/billing/first-payment";
import { packageBasisPointsFor, percentOf } from "@brandbasket/shared/lib/billing/packages";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import { basketNetCents, orderSummary, type OrderSummary, type OrderSummaryInput } from "./membership";

/*
 * The sums behind the checkout's summary, for the browser as well as the server: choosing a plan updates the figures at once
 * with these, and the server prices the same basket again with the same functions when Pay is pressed. Pure and browser-safe:
 * nothing here may import server code.
 */

/** What the page's summary needs of the code in force: the figures it is worth are worked out per basket by codeDiscountCents. */
export interface LedgerCode {
  readonly code: string;
  readonly stated: ReferralDiscount | null;
  readonly months: number | null;
}

/** The business facts the basket is priced with: everything in an order summary's input but the basket. */
export type LedgerPricing = Omit<OrderSummaryInput, "services">;

/**
 * What a code takes off a basket, worked out as the server does (discountFrom in server/referrals.ts): a flat amount whole,
 * a percentage of the basket's package net, and nothing when the result would leave nothing to charge. Paid yearly, the code
 * comes off the year's payment (firstYearDiscountCents).
 */
export function codeDiscountCents(code: LedgerCode | null, services: readonly MonthlyAddOnId[], currency: MoneyCurrency, interval: BillingInterval = "month"): number {
  if (code === null || code.stated === null) return 0;
  const netCents = basketNetCents(services, currency, interval);
  const amountCents = interval === "year" ? firstYearDiscountCents(code.stated, netCents, code.months) : discountCentsFor(code.stated, netCents);
  return isChargeableDiscount(netCents, amountCents) ? amountCents : 0;
}

/** Today's payment for a basket and the code in force. */
export function ledgerSummary(pricing: LedgerPricing, services: readonly MonthlyAddOnId[], code: LedgerCode | null): OrderSummary {
  return orderSummary({ ...pricing, services }, codeDiscountCents(code, services, pricing.currency, pricing.interval));
}

/** What the page knows for the first-month offer (plan 63): the provider that will take the payment, and the plans the business has had. */
export interface LedgerFirstMonth {
  readonly provider: BillingProviderName;
  /** A plan missing here is treated as had: no offer is shown that the checkout might not give. */
  readonly hadService: Readonly<Partial<Record<MonthlyAddOnId, boolean>>>;
}

/** Today's payment when some plans are on the first-month offer: what is due, and each offer plan's price for the month. */
export interface LedgerOffer {
  readonly firstPaymentCents: number;
  readonly trialPriceByAddOn: Readonly<Record<string, number>>;
}

/**
 * The first-month offer on this basket, by the rule the checkout charges with (planFirstPayment), so the page shows what is
 * taken. Null when no plan is on it, or when the code would be refused with it (the checkout then says so).
 */
export function ledgerOffer(summary: OrderSummary, firstMonth: LedgerFirstMonth | null, currency: MoneyCurrency, interval: BillingInterval): LedgerOffer | null {
  if (firstMonth === null) return null;
  const plan = planFirstPayment({
    lines: summary.lines.map((line) => ({ addOn: line.addOn, netCents: line.netCents, hadService: firstMonth.hadService[line.addOn] ?? true })),
    interval,
    provider: firstMonth.provider,
    currency,
    discountCents: summary.discountCents,
  });
  return plan.kind === "offer" ? { firstPaymentCents: plan.firstPaymentCents, trialPriceByAddOn: plan.trialPriceByAddOn } : null;
}

export interface LedgerRow {
  readonly key: string;
  readonly label: string;
  readonly amount: string;
  readonly tone: "plain" | "free" | "save";
}

/**
 * The summary's lines: the website as a free build and its monthly maintenance, every other plan at its list price, then the
 * package saving and the code, each as one line. Paid yearly, each plan is twelve months at its monthly price and the annual
 * saving is a line of its own, so the lines still add up to the total.
 */
export function ledgerRows(summary: OrderSummary, currency: MoneyCurrency, code: LedgerCode | null, firstMonth: LedgerOffer | null = null): readonly LedgerRow[] {
  const money = (cents: number): string => formatMoney(cents, currency);
  const yearly = summary.annual !== null;
  const months = yearly ? ", 12 months" : "";
  const listOf = (line: OrderSummary["lines"][number]): string => money(yearly ? annualListCents(addOnById(line.addOn).prices[currency]) : line.listCents);
  const trialCents = (line: OrderSummary["lines"][number]): number | null => firstMonth?.trialPriceByAddOn[line.addOn] ?? null;
  const rows: LedgerRow[] = summary.lines.flatMap((line): LedgerRow[] => {
    if (line.addOn === "managed-website") {
      return [
        { key: "website", label: "Website", amount: "Free", tone: "free" },
        { key: "maintenance", label: `Maintenance${months}`, amount: listOf(line), tone: "plain" },
      ];
    }
    const trial = trialCents(line);
    return [trial === null ? { key: line.addOn, label: `${line.title}${months}`, amount: listOf(line), tone: "plain" } : { key: line.addOn, label: `${line.title}, first month`, amount: money(trial), tone: "plain" }];
  });
  if (summary.annual !== null) {
    rows.push({ key: "annual", label: `Paid yearly, ${percentOf(ANNUAL_DISCOUNT_BASIS_POINTS)}% off`, amount: `-${money(summary.annual.savingCents)}`, tone: "save" });
  }
  if (summary.offer !== null) {
    // An offer on the summary means the business has not given it up, so the percentage is the basket's own. A plan on the
    // first-month offer costs its offer price whole, so only the plans at full price give a saving today.
    const basisPoints = packageBasisPointsFor({ services: summary.lines.map((line) => line.addOn), forfeited: false });
    const savingCents = summary.lines.reduce((total, line) => (trialCents(line) === null ? total + line.offerCents : total), 0);
    if (savingCents > 0) rows.push({ key: "offer", label: `${percentOf(basisPoints)}% off`, amount: `-${money(savingCents)}`, tone: "save" });
  }
  if (code !== null && summary.discountCents > 0) {
    rows.push({ key: "code", label: `Code ${code.code}${yearly ? ", first year" : ""}`, amount: `-${money(summary.discountCents)}`, tone: "save" });
  }
  return rows;
}
