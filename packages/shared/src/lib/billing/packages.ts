import type { MoneyCurrency } from "../money";
import { addOnById, addOnPrice, MONTHLY_ADD_ON_IDS, type AddOnPrice, type MonthlyAddOnId } from "./add-ons";

/**
 * Package offers (owner decisions, 2026-10-21; docs/plans/16-platform-pricing-offers.md). Two or more services on one
 * subscription are priced off every line; a package bought together at the first checkout also earns monthly ad
 * credit. Pure and browser-safe. brandbasket-website holds the same numbers in lib/pricing.ts.
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

/** One line's discount: `basisPoints` of its list price, half a minor unit rounding up. */
export function packageDiscountCentsFor(listCents: number, basisPoints: number): number {
  if (!Number.isSafeInteger(listCents) || listCents < 0) throw new RangeError(`A list price must be whole, non-negative minor units, received ${listCents}`);
  return Math.floor((listCents * basisPoints * 2 + BASIS_POINTS_DENOMINATOR) / (BASIS_POINTS_DENOMINATOR * 2));
}

/** Every line of the basket with its package discount, once each, in catalogue order. */
export function packageLines(input: PackageInput, currency: MoneyCurrency): PackageLine[] {
  const basisPoints = packageBasisPointsFor(input);
  return distinctServices(input.services).map((id) => {
    const addOn = addOnById(id);
    return { addOn: id, ...addOnPrice(addOn, currency, packageDiscountCentsFor(addOn.prices[currency], basisPoints)) };
  });
}

/** The line `service` would have once it joins the basket: priced at the percentage the enlarged set earns. */
export function packageLineWith(input: PackageInput, service: MonthlyAddOnId, currency: MoneyCurrency): PackageLine {
  const line = packageLines({ ...input, services: [...input.services, service] }, currency).find((candidate) => candidate.addOn === service);
  if (line === undefined) throw new Error(`Service ${service} is not in the catalogue, so it has no line to price`);
  return line;
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
