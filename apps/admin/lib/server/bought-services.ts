import "server-only";
import {
  listAddOnSubscriptionsForBusiness,
  listBoughtSetupServices,
  listBundledAddOnsForBusiness,
  type Database,
  type SetupService,
} from "@brandbasket/db";
import { isWebsiteBoughtFrom } from "@/lib/purchased-services";

/** The services whose monthly numbers staff can enter for this business: the same rule the customer's pages use. Staff connection. */
export function listBoughtServices(db: Database, businessId: string): Promise<SetupService[]> {
  return listBoughtSetupServices(db, businessId);
}

/** Whether this business pays for the Managed Website now, by the same plan and add-on rows as listBoughtServices. Staff connection. */
export async function isWebsiteBought(db: Database, businessId: string): Promise<boolean> {
  const [bundled, subscriptions] = await Promise.all([listBundledAddOnsForBusiness(db, businessId), listAddOnSubscriptionsForBusiness(db, businessId)]);
  return isWebsiteBoughtFrom(bundled, subscriptions);
}
