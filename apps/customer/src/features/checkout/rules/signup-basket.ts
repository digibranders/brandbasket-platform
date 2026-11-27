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
import { websiteBuildFeeCents, WEBSITE_KINDS, type WebsiteKind } from "@brandbasket/shared/lib/billing/website-kind";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { formatMoney, formatPercent } from "@/lib/format";
import { buildRows, feeRenewalTerms } from "./build-fee";
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

/** What the website costs for one kind of site (plan 65): its monthly and yearly price and the one-time build fee, all in minor units. */
export interface WebsiteKindPrices {
  readonly monthlyCents: number;
  readonly yearlyListCents: number;
  readonly yearlyCents: number;
  readonly feeCents: number;
}

export interface SignupBasketTable {
  readonly currency: MoneyCurrency;
  /** 1800 in rupees, 0 in dollars. */
  readonly taxRateBasisPoints: number;
  readonly services: readonly SignupBasketService[];
  readonly website: {
    /** A build fee comes with the website for a buyer who has never had it. */
    readonly feeOwed: boolean;
    readonly kinds: Readonly<Record<WebsiteKind, WebsiteKindPrices>>;
  };
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
  const website = addOnById("managed-website");
  const kinds = Object.fromEntries(
    WEBSITE_KINDS.map((kind) => {
      const monthly = addOnPrice(website, currency, 0, "month", kind);
      const yearly = addOnPrice(website, currency, 0, "year", kind);
      return [kind, { monthlyCents: monthly.netCents, yearlyListCents: annualListCents(monthly.netCents), yearlyCents: yearly.netCents, feeCents: websiteBuildFeeCents(kind, currency) }] as const;
    }),
  ) as Record<WebsiteKind, WebsiteKindPrices>;
  return { currency, taxRateBasisPoints: addOnTaxRateBasisPoints(currency), services, website: { feeOwed: hadService["managed-website"] !== true, kinds } };
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
  /** The label of the amount paid now: "Due today", or "Advance to pay now" for a paid deal (plan 66). */
  readonly dueLabel: string;
  /** The line beside the Pay button of a paid deal (the advance is not refunded); null for every other basket. New copy for the owner. */
  readonly advanceNote: string | null;
}

/** New copy for the owner (plan 66, decisions O3 and O9). */
export const ADVANCE_COPY = {
  dueLabel: "Advance to pay now",
  balanceLabel: "Balance at go-live",
  afterBalance: "Maintenance and your other services are charged with the balance when your website is ready.",
  nonRefundable: "The advance is non-refundable.",
} as const;

/** New copy for the owner (plan 66, step 5): the pay screen of a paid deal's balance. */
export const BALANCE_COPY = {
  balanceLabel: "Balance for your website build",
  dueLabel: "Total to pay now",
  /** The line under the title once the website is built: the sign-up lead ("Choose the services you want.") no longer fits. */
  lead: "Your website is ready. Review what you pay today.",
  /** "Your monthly plan starts today. Next charge on 27 Dec 2026." */
  planStarts: (interval: BillingInterval, nextCharge: string): string => `Your ${interval === "year" ? "yearly" : "monthly"} plan starts today. Next charge on ${nextCharge}.`,
} as const;

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

/** What shapes the website's part of the summary beyond the services ticked (plan 65). */
export interface BasketOptions {
  /** The kind of website chosen. B2B when absent. */
  readonly kind?: WebsiteKind;
  /** A staff payment link's discount on the build fee and the note beside it. Absent for the public checkout, which charges the list fee. */
  readonly deal?: {
    readonly discountCents: number;
    readonly note: string | null;
    /** The finalised build price of a paid link (plan 66), when it is not the catalogue's. */
    readonly listCents?: number;
    /** The advance of a paid link: the one amount paid now, the rest of the build being paid when the website is ready. */
    readonly advanceCents?: number;
    /**
     * A paid deal whose website is ready (plan 66, payment 2): what is left of the build, the code taken off the first payment (its label
     * and amount) and the date the plan's next charge falls. Present means the summary is the balance, never the advance.
     */
    readonly balance?: { readonly cents: number; readonly codeLabel: string | null; readonly codeCents: number; readonly nextCharge: string };
  } | null;
}

/**
 * The table with a staff deal's custom prices in it (plan 66): each is for the deal's own period, so a monthly deal replaces the
 * month's price (the first month too, unless the service is on the first-month offer) and a yearly one the year's, with no annual
 * saving beside it. Browser-safe and pure; a service without a custom price is left as it was.
 */
export function withCustomPrices(table: SignupBasketTable, customPrices: Readonly<Partial<Record<MonthlyAddOnId, number>>>, interval: BillingInterval): SignupBasketTable {
  const priced = <T extends { readonly monthlyCents: number; readonly yearlyListCents: number; readonly yearlyCents: number }>(service: T, custom: number): T =>
    interval === "year" ? { ...service, yearlyListCents: custom, yearlyCents: custom } : { ...service, monthlyCents: custom };
  return {
    ...table,
    services: table.services.map((service) => {
      const custom = customPrices[service.id];
      if (custom === undefined || service.id === "managed-website") return service;
      return { ...priced(service, custom), firstMonthCents: service.onOffer || interval === "year" ? service.firstMonthCents : custom };
    }),
    website: {
      ...table.website,
      kinds: Object.fromEntries(
        WEBSITE_KINDS.map((kind) => {
          const custom = customPrices["managed-website"];
          const prices = table.website.kinds[kind];
          return [kind, custom === undefined ? prices : { ...priced(prices, custom), feeCents: prices.feeCents }] as const;
        }),
      ) as Record<WebsiteKind, WebsiteKindPrices>,
    },
  };
}

/**
 * A paid deal's summary (plan 66): the agreed build price, any discount, the advance as the one amount to pay and the balance of the
 * build left for go-live. The services are not priced here: they are charged with the balance (the sentence under Pay says so).
 */
function advanceView(table: SignupBasketTable, services: readonly MonthlyAddOnId[], kind: WebsiteKind, deal: NonNullable<BasketOptions["deal"]>, advanceCents: number): BasketView {
  const money = (cents: number): string => formatMoney(cents, table.currency);
  const listCents = deal.listCents ?? table.website.kinds[kind].feeCents;
  const netCents = Math.max(0, listCents - deal.discountCents);
  const rows: BasketRow[] = [
    ...buildRows({ kind, fee: { listCents, discountCents: deal.discountCents, netCents }, note: deal.note }, table.currency).map((row): BasketRow => ({ key: row.key, label: row.label, note: null, amount: row.amount, tone: row.tone })),
    { key: "balance", label: ADVANCE_COPY.balanceLabel, note: null, amount: money(Math.max(0, netCents - advanceCents)), tone: "plain" },
  ];
  const taxed = table.taxRateBasisPoints > 0;
  return {
    services,
    rows,
    dueCents: advanceCents,
    due: money(advanceCents),
    gstLine: taxed ? `Includes ${money(gstInsideCents(advanceCents, table.taxRateBasisPoints))} of GST at ${formatPercent(table.taxRateBasisPoints / 100)}` : null,
    renewal: ADVANCE_COPY.afterBalance,
    dueLabel: ADVANCE_COPY.dueLabel,
    advanceNote: ADVANCE_COPY.nonRefundable,
  };
}

/**
 * A paid deal's payment 2 (plan 66): the balance of the build, then the first period of each service (the website's maintenance, Social
 * and Ads at their first-month price where eligible), less the code, as the checkout takes it (planFirstPayment, dealBalanceCents).
 */
function balanceView(
  table: SignupBasketTable,
  services: readonly MonthlyAddOnId[],
  kind: WebsiteKind,
  interval: BillingInterval,
  balance: NonNullable<NonNullable<BasketOptions["deal"]>["balance"]>,
): BasketView {
  const money = (cents: number): string => formatMoney(cents, table.currency);
  const yearly = interval === "year";
  const months = yearly ? ", 12 months" : "";
  const web = table.website.kinds[kind];
  const chosen = table.services.filter((service) => services.includes(service.id));
  const priceOf = (service: SignupBasketService): number => (service.id === "managed-website" ? (yearly ? web.yearlyCents : web.monthlyCents) : yearly ? service.yearlyCents : service.firstMonthCents);
  const rows: BasketRow[] = [];
  if (balance.cents > 0) rows.push({ key: "balance", label: BALANCE_COPY.balanceLabel, note: null, amount: money(balance.cents), tone: "plain" });
  for (const service of chosen) {
    if (service.id === "managed-website") rows.push({ key: "maintenance", label: `Maintenance${months}`, note: null, amount: money(priceOf(service)), tone: "plain" });
    else if (service.onOffer && !yearly) rows.push({ key: service.id, label: `${service.title}, first month`, note: `${money(service.monthlyCents)} a month from next month`, amount: money(service.firstMonthCents), tone: "plain" });
    else rows.push({ key: service.id, label: `${service.title}${months}`, note: null, amount: money(priceOf(service)), tone: "plain" });
  }
  if (balance.codeCents > 0) rows.push({ key: "code", label: balance.codeLabel ?? "Code", note: null, amount: `-${money(balance.codeCents)}`, tone: "save" });
  const dueCents = balance.cents + sum(chosen.map(priceOf)) - balance.codeCents;
  return {
    services,
    rows,
    dueCents,
    due: money(dueCents),
    gstLine: table.taxRateBasisPoints > 0 ? `Includes ${money(gstInsideCents(dueCents, table.taxRateBasisPoints))} of GST at ${formatPercent(table.taxRateBasisPoints / 100)}` : null,
    renewal: BALANCE_COPY.planStarts(interval, balance.nextCharge),
    dueLabel: BALANCE_COPY.dueLabel,
    advanceNote: null,
  };
}

/** The summary for the services ticked and how often they are paid: the rows, the amount due today and what follows. */
export function basketView(table: SignupBasketTable, ticked: readonly string[], interval: BillingInterval, options: BasketOptions = {}): BasketView {
  const services = purchasableServices(table, ticked);
  const advanceCents = options.deal?.advanceCents;
  const balance = options.deal?.balance;
  if (balance !== undefined && services.includes("managed-website")) return balanceView(table, services, options.kind ?? "b2b", interval, balance);
  if (options.deal != null && advanceCents !== undefined && services.includes("managed-website")) return advanceView(table, services, options.kind ?? "b2b", options.deal, advanceCents);
  const chosen = table.services.filter((service) => services.includes(service.id));
  const money = (cents: number): string => formatMoney(cents, table.currency);
  const yearly = interval === "year";
  const months = yearly ? ", 12 months" : "";
  const kind = options.kind ?? "b2b";
  const web = table.website.kinds[kind];
  const hasWebsite = services.includes("managed-website");
  // The build fee (plan 65): owed on a first purchase of the website, at its list price less the deal's discount, if any.
  const feeOwed = hasWebsite && table.website.feeOwed;
  const feeCents = feeOwed ? Math.max(0, (options.deal?.listCents ?? web.feeCents) - (options.deal?.discountCents ?? 0)) : 0;
  // A monthly deal that pays something for the build leaves the website's own first month to the first monthly charge.
  const monthlyDeal = feeOwed && feeCents > 0 && !yearly;
  const monthlyOf = (service: SignupBasketService): number => (service.id === "managed-website" ? web.monthlyCents : service.monthlyCents);
  const yearlyOf = (service: SignupBasketService): number => (service.id === "managed-website" ? web.yearlyCents : service.yearlyCents);
  const yearlyListOf = (service: SignupBasketService): number => (service.id === "managed-website" ? web.yearlyListCents : service.yearlyListCents);

  const rows: BasketRow[] = chosen.flatMap((service): BasketRow[] => {
    const list = money(yearly ? yearlyListOf(service) : monthlyOf(service));
    if (service.id === "managed-website") {
      if (!feeOwed) {
        return [
          { key: "website", label: "Website", note: null, amount: "Free", tone: "free" },
          { key: "maintenance", label: `Maintenance${months}`, note: null, amount: list, tone: "plain" },
        ];
      }
      const build = buildRows({ kind, fee: { listCents: options.deal?.listCents ?? web.feeCents, discountCents: options.deal?.discountCents ?? 0, netCents: feeCents }, note: options.deal?.note ?? null }, table.currency);
      return [
        ...build.map((row): BasketRow => ({ key: row.key, label: row.label, note: null, amount: row.amount, tone: row.tone })),
        monthlyDeal
          ? { key: "maintenance", label: "Maintenance", note: `${money(web.monthlyCents)} a month, from one month after you pay`, amount: "Not charged today", tone: "plain" }
          : { key: "maintenance", label: `Maintenance${months}`, note: null, amount: list, tone: "plain" },
      ];
    }
    if (service.onOffer && !yearly) {
      return [{ key: service.id, label: `${service.title}, first month`, note: `${money(service.monthlyCents)} a month from next month`, amount: money(service.firstMonthCents), tone: "plain" }];
    }
    return [{ key: service.id, label: `${service.title}${months}`, note: null, amount: list, tone: "plain" }];
  });
  const servicesDueCents = yearly
    ? sum(chosen.map(yearlyOf))
    : sum(chosen.map((service) => (service.id === "managed-website" ? (monthlyDeal ? 0 : web.monthlyCents) : service.firstMonthCents)));
  const dueCents = servicesDueCents + feeCents;
  const savingCents = sum(chosen.map(yearlyListOf)) - servicesDueCents;
  if (yearly && chosen.length > 0 && savingCents > 0) {
    rows.push({ key: "annual", label: `Paid yearly, ${percentOf(ANNUAL_DISCOUNT_BASIS_POINTS)}% off`, note: null, amount: `-${money(savingCents)}`, tone: "save" });
  }

  const taxed = table.taxRateBasisPoints > 0;
  const gst = taxed ? " (GST included)" : "";
  const word = chosen.length === 1 ? "service" : "services";
  const monthlyCents = sum(chosen.map(monthlyOf));
  const renewal =
    chosen.length === 0
      ? null
      : feeOwed && feeCents > 0
        ? feeRenewalTerms({ currency: table.currency, taxed, interval, cycleCents: yearly ? sum(chosen.map(yearlyOf)) : monthlyCents, services: chosen.length, codeMonths: null, cycleWithoutCodeCents: monthlyCents })
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
    dueLabel: "Due today",
    advanceNote: null,
  };
}

/** "Pay ₹2,999", or "Pay" with nothing to pay for. */
export function payLabel(view: Pick<BasketView, "services" | "due">): string {
  return view.services.length === 0 ? "Pay" : `Pay ${view.due}`;
}

/** The first-month badge on a card: "First month ₹1" while paid monthly, nothing paid yearly. The website carries its own. */
export function cardBadge(service: SignupBasketService, table: SignupBasketTable, interval: BillingInterval, balance = false): string | null {
  // The build is done when its balance is paid: "One-time build fee" describes a sign-up, not this.
  if (service.id === "managed-website") return table.website.feeOwed && !balance ? CHECKOUT_COPY.websiteBadge : null;
  return service.onOffer && interval === "month" ? `First month ${formatMoney(service.firstMonthCents, table.currency)}` : null;
}
