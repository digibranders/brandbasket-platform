import "server-only";
import { listBoughtSetupServices, type Database, type SetupService } from "@brandbasket/db";

/** The services whose monthly numbers staff can enter for this business: the same rule the customer's pages use. Staff connection. */
export function listBoughtServices(db: Database, businessId: string): Promise<SetupService[]> {
  return listBoughtSetupServices(db, businessId);
}
