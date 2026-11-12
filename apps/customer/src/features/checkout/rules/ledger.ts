import { discountCentsFor, firstYearDiscountCents, isChargeableDiscount } from "@brandbasket/billing/referral";
import type { BillingInterval, ReferralDiscount } from "@brandbasket/db";
import { addOnById, ANNUAL_DISCOUNT_BASIS_POINTS, annualListCents, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
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
export function ledgerRows(summary: OrderSummary, currency: MoneyCurrency, code: LedgerCode | null): readonly LedgerRow[] {
  const money = (cents: number): string => formatMoney(cents, currency);
  const yearly = summary.annual !== null;
  const months = yearly ? ", 12 months" : "";
  const listOf = (line: OrderSummary["lines"][number]): string => money(yearly ? annualListCents(addOnById(line.addOn).prices[currency]) : line.listCents);
  const rows: LedgerRow[] = summary.lines.flatMap((line): LedgerRow[] =>
    line.addOn === "managed-website"
      ? [
          { key: "website", label: "Website", amount: "Free", tone: "free" },
          { key: "maintenance", label: `Maintenance${months}`, amount: listOf(line), tone: "plain" },
        ]
      : [{ key: line.addOn, label: `${line.title}${months}`, amount: listOf(line), tone: "plain" }],
  );
  if (summary.annual !== null) {
    rows.push({ key: "annual", label: `Paid yearly, ${percentOf(ANNUAL_DISCOUNT_BASIS_POINTS)}% off`, amount: `-${money(summary.annual.savingCents)}`, tone: "save" });
  }
  if (summary.offer !== null) {
    // An offer on the summary means the business has not given it up, so the percentage is the basket's own.
    const basisPoints = packageBasisPointsFor({ services: summary.lines.map((line) => line.addOn), forfeited: false });
    rows.push({ key: "offer", label: `${percentOf(basisPoints)}% off`, amount: `-${money(summary.offer.discountCents)}`, tone: "save" });
  }
  if (code !== null && summary.discountCents > 0) {
    rows.push({ key: "code", label: `Code ${code.code}${yearly ? ", first year" : ""}`, amount: `-${money(summary.discountCents)}`, tone: "save" });
  }
  return rows;
}
