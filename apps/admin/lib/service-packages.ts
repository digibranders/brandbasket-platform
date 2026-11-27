import { addOnById, cyclePriceCents, MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { WEBSITE_KIND_LABELS, WEBSITE_KINDS, type WebsiteKind, websiteBuildFeeCents } from "@brandbasket/shared/lib/billing/website-kind";
import { formatMoney } from "@brandbasket/shared/lib/money";

/** What staff call each service in a list or a line: short, since a package names two or three of them. */
const SHORT_NAMES: Readonly<Record<MonthlyAddOnId, string>> = {
  "managed-website": "Website",
  "social-media": "Social",
  "paid-ads": "Ads",
  "expert-monitoring": "Monitoring",
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

export interface WebsiteKindRow {
  readonly kind: WebsiteKind;
  readonly label: string;
  /** Website Management a month, GST included. */
  readonly monthlyInr: string;
  readonly monthlyUsd: string;
  /** The one-time build fee before any deal discount, GST included. */
  readonly buildFeeInr: string;
  readonly buildFeeUsd: string;
}

/** Each kind of website with its monthly price and its build fee, from the shared price functions (plan 65). */
export function websiteKindRows(): WebsiteKindRow[] {
  const website = addOnById("managed-website");
  return WEBSITE_KINDS.map((kind) => ({
    kind,
    label: WEBSITE_KIND_LABELS[kind],
    monthlyInr: formatMoney(cyclePriceCents(website, "INR", "month", kind), "INR"),
    monthlyUsd: formatMoney(cyclePriceCents(website, "USD", "month", kind), "USD"),
    buildFeeInr: formatMoney(websiteBuildFeeCents(kind, "INR"), "INR"),
    buildFeeUsd: formatMoney(websiteBuildFeeCents(kind, "USD"), "USD"),
  }));
}
