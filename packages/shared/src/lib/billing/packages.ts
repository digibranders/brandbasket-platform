import type { MoneyCurrency } from "../money";
import { addOnById, addOnPrice, MONTHLY_ADD_ON_IDS, type AddOnPrice, type MonthlyAddOnId } from "./add-ons";

/**
 * Package offers (owner decisions, 2026-10-21; docs/plans/16-platform-pricing-offers.md). Two or more services on one
 * subscription are priced off every line, and the package total is rounded down to a whole rupee or dollar (the floor rule
 * in packageDiscountsFor); a package bought together at the first checkout also earns monthly ad credit. Pure and
 * browser-safe. brandbasket-website holds the same numbers in lib/pricing.ts.
 */
interface PackageOffer {
  readonly services: readonly MonthlyAddOnId[];
  readonly basisPoints: number;
  readonly adCreditCents: Readonly<Record<MoneyCurrency, number>>;
}

/** What a package is asked about: the services on the subscription, and whether the business has given the offer up. */
export interface PackageInput {
  readonly services: readonly MonthlyAddOnId[];
  readonly forfeited: boolean;
}

/** One service's line in a package, with the price worked out for it. */
export type PackageLine = AddOnPrice & { readonly addOn: MonthlyAddOnId };

const BASIS_POINTS_DENOMINATOR = 10_000;
/** A package is priced in whole rupees and whole dollars: its total is a multiple of this many minor units. */
const PACKAGE_ROUNDING_CENTS = 100;

export const PACKAGE_OFFERS: readonly PackageOffer[] = [
  { services: ["managed-website", "digital-growth"], basisPoints: 2000, adCreditCents: { INR: 200000, USD: 2500 } },
  { services: ["managed-website", "local-seo-aeo"], basisPoints: 2000, adCreditCents: { INR: 0, USD: 0 } },
  { services: ["digital-growth", "local-seo-aeo"], basisPoints: 3000, adCreditCents: { INR: 200000, USD: 2500 } },
  { services: ["managed-website", "digital-growth", "local-seo-aeo"], basisPoints: 3000, adCreditCents: { INR: 500000, USD: 6000 } },
];

/** The services once each, in the catalogue's order. */
function distinctServices(services: readonly MonthlyAddOnId[]): readonly MonthlyAddOnId[] {
  const picked = new Set(services);
  return MONTHLY_ADD_ON_IDS.filter((id) => picked.has(id));
}

function offerFor(services: readonly MonthlyAddOnId[]): PackageOffer | null {
  const picked = new Set(services);
  return PACKAGE_OFFERS.find((o) => o.services.length === picked.size && o.services.every((id) => picked.has(id))) ?? null;
}

/** Basis points off each line for this set of services; 0 for one service or once the business has forfeited. */
export function packageBasisPointsFor(input: PackageInput): number {
  return input.forfeited ? 0 : (offerFor(input.services)?.basisPoints ?? 0);
}

/** One line's share before the package is rounded down: `basisPoints` of its list price, half a minor unit rounding up. A package is priced only by packageDiscountsFor. */
export function packageDiscountCentsFor(listCents: number, basisPoints: number): number {
  if (!Number.isSafeInteger(listCents) || listCents < 0) throw new RangeError(`A list price must be whole, non-negative minor units, received ${listCents}`);
  return Math.floor((listCents * basisPoints * 2 + BASIS_POINTS_DENOMINATOR) / (BASIS_POINTS_DENOMINATOR * 2));
}

/** A line of a basket as the package rule sees it: which service, at which list price (the catalogue's, or the one a row was sold at). */
export interface PackageListLine {
  readonly addOn: MonthlyAddOnId;
  readonly listCents: number;
}

/**
 * The discount on each line of a package, in the order the lines are given: every line takes `basisPoints` of its own list
 * price (packageDiscountCentsFor), then the package total is rounded down to a whole rupee or dollar
 * (PACKAGE_ROUNDING_CENTS) and the minor units that takes off are added to the discount of the most expensive line (the
 * first in the catalogue's order among equals). So every line still has net = list - discount, a discount from 0 to its
 * list price, and the nets add up to the package price to the minor unit. With no percentage at all (a single service, or
 * the offer given up) there is no package, so no rounding: the lines stay at list.
 *
 * The one place a package is priced: the checkout, the quote for adding a service, the repricing when one is dropped,
 * the order summary, the invoice and the console all take their discounts from here.
 */
export function packageDiscountsFor(lines: readonly PackageListLine[], basisPoints: number): number[] {
  const discounts = lines.map((line) => packageDiscountCentsFor(line.listCents, basisPoints));
  if (basisPoints === 0 || lines.length === 0) return discounts;
  const netCents = lines.reduce((total, line, index) => total + line.listCents - (discounts[index] ?? 0), 0);
  const leftoverCents = netCents % PACKAGE_ROUNDING_CENTS;
  if (leftoverCents === 0) return discounts;
  const catalogueRank = (line: PackageListLine): number => MONTHLY_ADD_ON_IDS.indexOf(line.addOn);
  const dearest = lines.reduce((best, line, index) => {
    const bestLine = lines[best];
    if (bestLine === undefined) return index;
    return line.listCents > bestLine.listCents || (line.listCents === bestLine.listCents && catalogueRank(line) < catalogueRank(bestLine)) ? index : best;
  }, 0);
  return discounts.map((discount, index) => (index === dearest ? discount + leftoverCents : discount));
}

/** Every line of the basket with its package discount, once each, in catalogue order. */
export function packageLines(input: PackageInput, currency: MoneyCurrency): PackageLine[] {
  const services = distinctServices(input.services);
  const listed = services.map((id) => ({ addOn: id, listCents: addOnById(id).prices[currency] }));
  const discounts = packageDiscountsFor(listed, packageBasisPointsFor(input));
  return services.map((id, index) => ({ addOn: id, ...addOnPrice(addOnById(id), currency, discounts[index] ?? 0) }));
}

/**
 * The line `service` would have once it joins the `held` lines of a basket: priced as part of the enlarged set, whose package
 * percentage and whole-unit rounding it shares with every line already there (their new discounts are
 * packageDiscountsFor over the same lines). A held line keeps the list price it was sold at; the new one has the catalogue's.
 */
export function packageLineWith(held: readonly PackageListLine[], forfeited: boolean, service: MonthlyAddOnId, currency: MoneyCurrency): PackageLine {
  const addOn = addOnById(service);
  const members: PackageListLine[] = [...held.filter((line) => line.addOn !== service), { addOn: service, listCents: addOn.prices[currency] }];
  const basisPoints = packageBasisPointsFor({ services: members.map((line) => line.addOn), forfeited });
  const discounts = packageDiscountsFor(members, basisPoints);
  return { addOn: service, ...addOnPrice(addOn, currency, discounts[members.length - 1] ?? 0) };
}

/** The monthly list prices of these lines added up: what they cost together with no package offer. */
export function listTotalCents(lines: readonly { readonly listAmountCents: number }[]): number {
  return lines.reduce((total, line) => total + line.listAmountCents, 0);
}

/** Ad credit a month for services bought together at the first checkout. Never recomputed after it. */
export function adCreditCentsFor(services: readonly MonthlyAddOnId[], currency: MoneyCurrency): number {
  return offerFor(services)?.adCreditCents[currency] ?? 0;
}

/**
 * The ad credit a checkout freezes onto the subscription: the package's own credit for a business that has never paid and
 * has not given the offer up, otherwise 0. The one rule the checkout and the page that quotes it both read.
 */
export function adCreditCentsAtCheckout(input: PackageInput & { readonly hasEverPaid: boolean }, currency: MoneyCurrency): number {
  return input.hasEverPaid || input.forfeited ? 0 : adCreditCentsFor(input.services, currency);
}
