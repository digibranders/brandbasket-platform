import "server-only";
import {
  listAddOnSubscriptionsForStaff,
  listBundledAddOnsForBusiness,
  type AddOnSubscriptionForStaff,
  type BundledAddOn,
  type Database,
  type SetupService,
} from "@brandbasket/db";

const SERVICE_OF_ADD_ON: Readonly<Record<string, SetupService>> = { "digital-growth": "social", "local-seo-aeo": "search" };
const SERVICE_ORDER: readonly SetupService[] = ["social", "search"];
const PAID_SUBSCRIPTION_STATUSES: readonly string[] = ["active", "scheduled", "past_due"];

/** Which of Social & Ads and Search the business has bought, from its add-ons taken with the plan and those bought later. */
export function boughtServicesFrom(
  bundled: readonly Pick<BundledAddOn, "addOn" | "status" | "endRequestedAt">[],
  subscriptions: readonly Pick<AddOnSubscriptionForStaff, "addOn" | "status">[],
): SetupService[] {
  const bought = new Set<SetupService>();
  for (const row of bundled) {
    const service = SERVICE_OF_ADD_ON[row.addOn];
    if (service !== undefined && (row.status === "pending" || row.status === "active") && row.endRequestedAt === null) bought.add(service);
  }
  for (const row of subscriptions) {
    const service = SERVICE_OF_ADD_ON[row.addOn];
    if (service !== undefined && PAID_SUBSCRIPTION_STATUSES.includes(row.status)) bought.add(service);
  }
  return SERVICE_ORDER.filter((service) => bought.has(service));
}

/** The services whose monthly numbers staff can enter for this business. Staff connection. */
export async function listBoughtServices(db: Database, businessId: string): Promise<SetupService[]> {
  const [bundled, subscriptions] = await Promise.all([listBundledAddOnsForBusiness(db, businessId), listAddOnSubscriptionsForStaff(db, businessId)]);
  return boughtServicesFrom(bundled, subscriptions);
}
