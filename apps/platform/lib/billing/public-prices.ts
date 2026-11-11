import { ADD_ONS, ANNUAL_DISCOUNT_BASIS_POINTS, annualListCents, annualPriceCents, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { PACKAGE_OFFERS } from "@brandbasket/shared/lib/billing/packages";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";

/** One service as the marketing website reads it: its list price in each currency, GST included, in minor units. */
export interface PublicService {
  readonly id: MonthlyAddOnId;
  readonly title: string;
  /** A month. */
  readonly prices: Readonly<Record<MoneyCurrency, number>>;
  /** A year paid yearly: twelve months less the annual discount, rounded down to a whole rupee or dollar. What checkout charges. */
  readonly annualPrices: Readonly<Record<MoneyCurrency, number>>;
  /** Twelve months at the monthly price, the "usually" beside a yearly price. */
  readonly annualListPrices: Readonly<Record<MoneyCurrency, number>>;
}

/** One package as the marketing website reads it: the services, the percentage off each, and the ad credit a month. */
export interface PublicPackage {
  readonly services: readonly MonthlyAddOnId[];
  readonly basisPoints: number;
  readonly adCreditCents: Readonly<Record<MoneyCurrency, number>>;
}

export interface PublicPricing {
  readonly services: readonly PublicService[];
  readonly packages: readonly PublicPackage[];
  /** What paying yearly takes off twelve months, in basis points: 1000 is 10%. */
  readonly annualDiscountBasisPoints: number;
}

/**
 * What is on sale, straight from the shared catalogue and package offers (the plan rows hold the subscription's terms at a
 * price of 0, so they say nothing about price). The website works the package prices out itself from these.
 */
export function publicPricing(): PublicPricing {
  return {
    services: ADD_ONS.map((addOn) => ({
      id: addOn.id,
      title: addOn.title,
      prices: addOn.prices,
      annualPrices: { INR: annualPriceCents(addOn.prices.INR), USD: annualPriceCents(addOn.prices.USD) },
      annualListPrices: { INR: annualListCents(addOn.prices.INR), USD: annualListCents(addOn.prices.USD) },
    })),
    packages: PACKAGE_OFFERS.map((offer) => ({ services: offer.services, basisPoints: offer.basisPoints, adCreditCents: offer.adCreditCents })),
    annualDiscountBasisPoints: ANNUAL_DISCOUNT_BASIS_POINTS,
  };
}
