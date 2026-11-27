import type { SetupFee } from "@brandbasket/shared/lib/billing/setup-fee";
import { WEBSITE_KIND_LABELS, type WebsiteKind } from "@brandbasket/shared/lib/billing/website-kind";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import type { BillingInterval } from "@brandbasket/db";

/*
 * The website build fee as the checkout words it (docs/plans/65). Pure and browser-safe: the amounts come from the shared rules
 * (setupFeeFor, planFirstPayment); nothing here works out a price of its own.
 */

/** What the checkout was agreed to be for the website: its kind, the build fee less the deal's discount, and the staff note beside it. */
export interface BuildDeal {
  readonly kind: WebsiteKind;
  /** Null when no fee is owed: a business that has had the website before, a basket with no website, or a website client invited by staff. */
  readonly fee: SetupFee | null;
  /** The staff note on the discount, or null. */
  readonly note: string | null;
}

/** The rows that stand for the website's build in a summary: the fee at its list price, then what the deal took off it. */
export interface BuildRow {
  readonly key: string;
  readonly label: string;
  readonly amount: string;
  readonly tone: "plain" | "save";
}

export function buildRows(deal: BuildDeal & { readonly fee: SetupFee }, currency: MoneyCurrency): readonly BuildRow[] {
  const money = (cents: number): string => formatMoney(cents, currency);
  const rows: BuildRow[] = [{ key: "build", label: `${WEBSITE_KIND_LABELS[deal.kind]} build`, amount: money(deal.fee.listCents), tone: "plain" }];
  if (deal.fee.discountCents > 0) rows.push({ key: "build-discount", label: deal.note ?? "Build discount", amount: `-${money(deal.fee.discountCents)}`, tone: "save" });
  return rows;
}

/** Whether the website's own first month is left out of today's payment: a monthly deal that pays something for the build. */
export function monthlyFeeDeal(deal: BuildDeal | null, interval: BillingInterval): boolean {
  return deal?.fee != null && deal.fee.netCents > 0 && interval === "month";
}

/** The line under the Pay button for a build-fee deal. New copy for the owner (2026-11-27). */
export function feeRenewalTerms(input: {
  readonly currency: MoneyCurrency;
  readonly taxed: boolean;
  readonly interval: BillingInterval;
  /** What the services cost for the cycle the provider bills after today, with any code: a month, or a year. */
  readonly cycleCents: number;
  readonly services: number;
  /** The months a code still runs for from the first monthly charge; null for none or no limit. */
  readonly codeMonths: number | null;
  /** The cycle price without the code. */
  readonly cycleWithoutCodeCents: number;
}): string {
  const money = (cents: number): string => formatMoney(cents, input.currency);
  const gst = input.taxed ? " (GST included)" : "";
  const word = input.services === 1 ? "service" : "services";
  if (input.interval === "year") {
    return `Your payment covers the build and 12 months of your ${word}. They renew each year, starting 13 months after you pay, at ${money(input.cycleCents)}${gst}.`;
  }
  const start = "From one month after you pay,";
  if (input.codeMonths !== null && input.cycleCents < input.cycleWithoutCodeCents) {
    return `Your payment covers the build. ${start} ${money(input.cycleCents)}${gst} is taken each month for ${input.codeMonths} ${input.codeMonths === 1 ? "month" : "months"}, then ${money(input.cycleWithoutCodeCents)} a month.`;
  }
  return `Your payment covers the build. ${start} ${money(input.cycleCents)}${gst} is taken each month for your ${word}.`;
}
