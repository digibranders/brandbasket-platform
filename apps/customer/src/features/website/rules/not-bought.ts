import { addOnById, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { packageLines } from "@brandbasket/shared/lib/billing/packages";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import type { CustomerContext, Service } from "@/lib/guards";

const ADD_ON_OF: Readonly<Record<Service, MonthlyAddOnId>> = { website: "managed-website", social: "social-media", search: "local-seo-aeo" };

export interface WebsiteOffer {
  readonly title: string;
  /** The catalogue's line on what is included. */
  readonly included: string;
  readonly netCents: number;
  /** The package discount inside `netCents`; 0 when adding it makes no package or the offer was given up. */
  readonly offerCents: number;
  readonly unit: string;
}

/**
 * What the Managed Website would cost this business a month if added to the services it holds: priced by the shared package
 * rule (packageLines), never on the page.
 */
export function websiteOffer(held: readonly Service[], forfeited: boolean, currency: MoneyCurrency): WebsiteOffer {
  const services = [...held.map((service) => ADD_ON_OF[service]), ADD_ON_OF.website];
  const line = packageLines({ services, forfeited }, currency).find((entry) => entry.addOn === "managed-website");
  if (line === undefined) throw new Error("The package lines left out the Managed Website.");
  const addOn = addOnById("managed-website");
  return { title: addOn.title, included: addOn.line, netCents: line.netCents, offerCents: line.offerCents, unit: addOn.unit };
}

/**
 * Whether the business holds the Managed Website for reading, by the guard's own rule (requireWebsite): a paying business
 * follows billing (hasWebsite), an unpaid or lapsed one the services on its plan. The page shows Not bought otherwise.
 */
export function holdsWebsite(context: Pick<CustomerContext, "billing" | "services">): boolean {
  return context.billing.status === "paid" ? context.billing.hasWebsite : context.services.includes("website");
}
