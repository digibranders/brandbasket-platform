import "server-only";
import { findClaimForBusiness, findOwnListing, withTenantScope } from "@fynix/db";
import { cache } from "react";
import type { ClientListingState } from "@/lib/listing-sections";
import { getCustomerTenant } from "./customer-tenant";
import { getAppDb } from "./db";

/**
 * Whether staff have created this business's listing, and whether it owns one through a claim it brought from its free
 * listing: what puts the directory sections in a client's nav (lib/listing-sections.ts). Once per request.
 */
export const getClientListingState = cache(async (): Promise<ClientListingState> => {
  const tenant = await getCustomerTenant();
  if (tenant === null) return { ownListing: false, claim: false };
  return withTenantScope(getAppDb(), tenant, async (tx) => ({
    ownListing: (await findOwnListing(tx)) !== null,
    claim: (await findClaimForBusiness(tx, tenant.businessId)) !== null,
  }));
});
