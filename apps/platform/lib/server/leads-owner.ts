import "server-only";
import { countNewLeads, findClaimForBusiness, findOwnListing, withTenantScope } from "@firstfold/db";
import type { TenantContext } from "@firstfold/shared/lib/access";
import { errorLogInfo } from "@firstfold/shared/server/error-log-info";
import { leadsSource, type LeadsSource } from "@/lib/leads";
import { getCustomerBusinessKind } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";

/** The business's own listing and claim, read through its tenant scope, and from them whose leads the page opens. */
export async function resolveLeadsSource(tenant: TenantContext): Promise<{ readonly source: LeadsSource; readonly hasClaim: boolean }> {
  const [kind, owned] = await Promise.all([
    getCustomerBusinessKind(tenant.userId, tenant.businessId),
    withTenantScope(getAppDb(), tenant, async (tx) => ({
      listing: await findOwnListing(tx),
      claim: await findClaimForBusiness(tx, tenant.businessId),
    })),
  ]);
  return {
    source: leadsSource({ kind, ownListing: owned.listing?.placement ?? null, claim: owned.claim }),
    hasClaim: owned.claim !== null,
  };
}

/**
 * How many enquiries the owner has not replied to, for the sidebar's count on Leads. Zero for a business that has no
 * leads page yet. A failed read is logged and shows no count rather than taking the whole dashboard down with it.
 */
export async function readNewLeadCount(tenant: TenantContext): Promise<number> {
  try {
    const { source } = await resolveLeadsSource(tenant);
    return source.state === "open" ? await countNewLeads(getStaffDb(), source.business) : 0;
  } catch (error) {
    console.error("[leads] could not read the new-leads count for the sidebar", errorLogInfo(error));
    return 0;
  }
}
