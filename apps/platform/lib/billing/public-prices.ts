import { ADD_ONS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { PACKAGE_OFFERS } from "@brandbasket/shared/lib/billing/packages";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";

/** One service as the marketing website reads it: its list price in each currency, GST included, in minor units. */
export interface PublicService {
  readonly id: MonthlyAddOnId;
  readonly title: string;
  readonly prices: Readonly<Record<MoneyCurrency, number>>;
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
}

/**
 * What is on sale, straight from the shared catalogue and package offers (the plan rows hold the subscription's terms at a
 * price of 0, so they say nothing about price). The website works the package prices out itself from these.
 */
export function publicPricing(): PublicPricing {
  return {
    services: ADD_ONS.map((addOn) => ({ id: addOn.id, title: addOn.title, prices: addOn.prices })),
    packages: PACKAGE_OFFERS.map((offer) => ({ services: offer.services, basisPoints: offer.basisPoints, adCreditCents: offer.adCreditCents })),
  };
}
