import { addOnById, MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { PACKAGE_OFFERS } from "@brandbasket/shared/lib/billing/packages";
import { formatMoney } from "@brandbasket/shared/lib/money";

/** What staff call each service in a list or a line: short, since a package names two or three of them. */
const SHORT_NAMES: Readonly<Record<MonthlyAddOnId, string>> = {
  "managed-website": "Website",
  "digital-growth": "Social",
  "local-seo-aeo": "SEO",
};

/** The services as staff say them, in the catalogue's order: "Website + Social". */
export function packageLabel(services: readonly string[]): string {
  return MONTHLY_ADD_ON_IDS.filter((id) => services.includes(id))
    .map((id) => SHORT_NAMES[id])
    .join(" + ");
}

export interface CatalogueRow {
  readonly id: MonthlyAddOnId;
  readonly title: string;
  readonly inr: string;
  readonly usd: string;
}

/** The services on sale with their list prices a month, GST included: what the Pricing page shows. */
export function catalogueRows(): CatalogueRow[] {
  return MONTHLY_ADD_ON_IDS.map((id) => {
    const service = addOnById(id);
    return { id, title: service.title, inr: formatMoney(service.prices.INR, "INR"), usd: formatMoney(service.prices.USD, "USD") };
  });
}

export interface PackageRow {
  readonly services: string;
  readonly offer: string;
  readonly adCredit: string;
}

/** The package offers as the Pricing page shows them: the services, the percentage off each, the ad credit a month. */
export function packageRows(): PackageRow[] {
  return PACKAGE_OFFERS.map((offer) => ({
    services: offer.services.map((id) => addOnById(id).title).join(" + "),
    offer: `${offer.basisPoints / 100}% off each service`,
    adCredit: offer.adCreditCents.INR === 0 ? "None" : `${formatMoney(offer.adCreditCents.INR, "INR")} or ${formatMoney(offer.adCreditCents.USD, "USD")} a month`,
  }));
}
