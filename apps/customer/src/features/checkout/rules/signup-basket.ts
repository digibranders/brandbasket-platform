import { gstInsideCents } from "@brandbasket/billing/tax";
import type { BillingInterval, BillingProviderName } from "@brandbasket/db";
import {
  addOnById,
  addOnPrice,
  addOnTaxRateBasisPoints,
  ANNUAL_DISCOUNT_BASIS_POINTS,
  annualListCents,
  MONITORING_ID,
  SOLD_PLAN_ADD_ON_IDS,
  type MonthlyAddOnId,
} from "@brandbasket/shared/lib/billing/add-ons";
import { readBundleSelection } from "@brandbasket/shared/lib/billing/bundle";
import { planFirstPayment } from "@brandbasket/shared/lib/billing/first-payment";
import { percentOf } from "@brandbasket/shared/lib/billing/packages";
import { initialTermPhrase } from "@brandbasket/shared/lib/billing/terms";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { formatMoney, formatPercent } from "@/lib/format";
import { CHECKOUT_COPY, CHECKOUT_PLAN_COPY } from "./plans";

/*
 * What the one-screen checkout (plan 64) shows and adds up. The server builds a table of every service on sale, in the
 * visitor's currency, from the pricing the checkout itself uses (addOnPrice for each cycle, planFirstPayment for the
 * first-month offer); the browser only picks the rows of the services ticked and adds the integers it was given. Nothing here
 * works out a price of its own. Browser-safe and pure.
 */

/** The services this screen sells: the plans on sale, then monitoring. Paid Ads is paused. */
export const SIGNUP_BASKET_IDS: readonly MonthlyAddOnId[] = [...SOLD_PLAN_ADD_ON_IDS, MONITORING_ID];

/** The monitoring card's line, as the approved mock words it. */
const MONITORING_BLURB = "Our experts watch your website, social media and ads, fix what slips and help you grow.";

/** One service on sale: its words and its price for every way of paying. All amounts are minor units, GST included in rupees. */
export interface SignupBasketService {
  readonly id: MonthlyAddOnId;
  readonly title: string;
  /** The line under the title on a card, already worded with the price where it names one. */
  readonly blurb: string;
  /** The list price for a month. */
  readonly monthlyCents: number;
  /** What the first month costs: the offer price when the service is on it (plan 63), else the monthly price. */
  readonly firstMonthCents: number;
  readonly onOffer: boolean;
  /** Twelve months at the monthly price, the "usually" beside a yearly price. */
  readonly yearlyListCents: number;
  /** A year's price: twelve months less the annual discount (annualPriceCents). */
  readonly yearlyCents: number;
}

export interface SignupBasketTable {
  readonly currency: MoneyCurrency;
  /** 1800 in rupees, 0 in dollars. */
  readonly taxRateBasisPoints: number;
  readonly services: readonly SignupBasketService[];
}

/**
 * The table for a buyer billed in `currency`, paid through `provider` (a payment by hand has no first-month offer, as in the
 * checkout). A new visitor has never had a service; a signed-in business says which it has had.
 */
export function buildSignupBasketTable(
  currency: MoneyCurrency,
  provider: BillingProviderName,
  /** The services a signed-in business has had before, which never get the first-month offer again. A new visitor has had none. */
  hadService: Readonly<Partial<Record<MonthlyAddOnId, boolean>>> = {},
): SignupBasketTable {
  const services = SIGNUP_BASKET_IDS.map((id): SignupBasketService => {
    const addOn = addOnById(id);
    const monthly = addOnPrice(addOn, currency, 0, "month");
    const yearly = addOnPrice(addOn, currency, 0, "year");
    const first = planFirstPayment({ lines: [{ addOn: id, netCents: monthly.netCents, hadService: hadService[id] ?? false }], interval: "month", provider, currency, discountCents: 0 });
    const trialCents = first.kind === "offer" ? first.trialPriceByAddOn[id] : undefined;
    return {
      id,
      title: addOn.title,
      blurb: id === MONITORING_ID ? MONITORING_BLURB : CHECKOUT_PLAN_COPY[id].blurb(formatMoney(monthly.netCents, currency)),
      monthlyCents: monthly.netCents,
      firstMonthCents: trialCents ?? monthly.netCents,
      onOffer: trialCents !== undefined,
      yearlyListCents: annualListCents(monthly.netCents),
      yearlyCents: yearly.netCents,
    };
  });
  return { currency, taxRateBasisPoints: addOnTaxRateBasisPoints(currency), services };
}

/** One line of the summary. `note` is the small line under the label. */
export interface BasketRow {
  readonly key: string;
  readonly label: string;
  readonly note: string | null;
  readonly amount: string;
  readonly tone: "plain" | "free" | "save";
}

export interface BasketView {
  /** The services that will be bought, once each in catalogue order (monitoring never alone). */
  readonly services: readonly MonthlyAddOnId[];
  readonly rows: readonly BasketRow[];
  /** What is paid today, in minor units. 0 with an empty basket. */
  readonly dueCents: number;
  readonly due: string;
  /** "Includes ₹4,637 of GST at 18%", or null for a basket with none or a currency with no GST. */
  readonly gstLine: string | null;
  /** What follows the first payment, or null with an empty basket. */
  readonly renewal: string | null;
}

/** The services a ticked set really buys: only catalogue ids on sale, and the shared rule on monitoring (never alone). */
export function purchasableServices(table: SignupBasketTable, ticked: readonly string[]): readonly MonthlyAddOnId[] {
  const onSale = new Set<string>(table.services.map((service) => service.id));
  return readBundleSelection(ticked.filter((id) => onSale.has(id)));
}

/** Whether a service can be ticked now: monitoring watches over plans, so it needs one. */
export function canTick(id: MonthlyAddOnId, services: readonly MonthlyAddOnId[]): boolean {
  return id !== MONITORING_ID || services.some((service) => service !== MONITORING_ID);
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

/** The summary for the services ticked and how often they are paid: the rows, the amount due today and what follows. */
export function basketView(table: SignupBasketTable, ticked: readonly string[], interval: BillingInterval): BasketView {
  const services = purchasableServices(table, ticked);
  const chosen = table.services.filter((service) => services.includes(service.id));
  const money = (cents: number): string => formatMoney(cents, table.currency);
  const yearly = interval === "year";
  const months = yearly ? ", 12 months" : "";

  const rows: BasketRow[] = chosen.flatMap((service): BasketRow[] => {
    const list = money(yearly ? service.yearlyListCents : service.monthlyCents);
    if (service.id === "managed-website") {
      return [
        { key: "website", label: "Website", note: null, amount: "Free", tone: "free" },
        { key: "maintenance", label: `Maintenance${months}`, note: null, amount: list, tone: "plain" },
      ];
    }
    if (service.onOffer && !yearly) {
      return [{ key: service.id, label: `${service.title}, first month`, note: `${money(service.monthlyCents)} a month from next month`, amount: money(service.firstMonthCents), tone: "plain" }];
    }
    return [{ key: service.id, label: `${service.title}${months}`, note: null, amount: list, tone: "plain" }];
  });
  const dueCents = yearly ? sum(chosen.map((service) => service.yearlyCents)) : sum(chosen.map((service) => service.firstMonthCents));
  if (yearly && chosen.length > 0) {
    const savingCents = sum(chosen.map((service) => service.yearlyListCents)) - dueCents;
    rows.push({ key: "annual", label: `Paid yearly, ${percentOf(ANNUAL_DISCOUNT_BASIS_POINTS)}% off`, note: null, amount: `-${money(savingCents)}`, tone: "save" });
  }

  const taxed = table.taxRateBasisPoints > 0;
  const gst = taxed ? " (GST included)" : "";
  const word = chosen.length === 1 ? "service" : "services";
  const monthlyCents = sum(chosen.map((service) => service.monthlyCents));
  const renewal =
    chosen.length === 0
      ? null
      : yearly
        ? `Your payment covers 12 months. Then ${money(dueCents)}${gst} is taken each year for your ${word}.`
        : `Your first payment covers ${initialTermPhrase(1)}, then ${money(monthlyCents)}${gst} is taken each month for your ${word}.`;

  return {
    services,
    rows,
    dueCents,
    due: money(dueCents),
    gstLine: chosen.length > 0 && taxed ? `Includes ${money(gstInsideCents(dueCents, table.taxRateBasisPoints))} of GST at ${formatPercent(table.taxRateBasisPoints / 100)}` : null,
    renewal,
  };
}

/** "Pay ₹2,999", or "Pay" with nothing to pay for. */
export function payLabel(view: Pick<BasketView, "services" | "due">): string {
  return view.services.length === 0 ? "Pay" : `Pay ${view.due}`;
}

/** The first-month badge on a card: "First month ₹1" while paid monthly, nothing paid yearly. The website carries its own. */
export function cardBadge(service: SignupBasketService, table: SignupBasketTable, interval: BillingInterval): string | null {
  if (service.id === "managed-website") return CHECKOUT_COPY.websiteBadge;
  return service.onOffer && interval === "month" ? `First month ${formatMoney(service.firstMonthCents, table.currency)}` : null;
}
