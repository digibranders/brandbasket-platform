import "server-only";
import { findClaimForBusiness, readDirectoryStatuses, withTenantScope } from "@fynix/db";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";

/*
 * Whether a business is marked Verified in the directory, for the line the Review tab shows. Staff mark a business
 * Verified in the console (upsertDirectoryVerification); an owner can no longer do it themselves, since the way they did
 * was a code sent to the business's number. The claim comes only from the session's tenant, never from the request.
 */

type Customer = Pick<GrantedCustomer, "tenant">;

/** When the business was verified, or null when it has not been (or has no place in the directory yet). */
export async function verifiedSince(customer: Customer): Promise<Date | null> {
  const { tenant } = customer;
  const claim = await withTenantScope(getAppDb(), tenant, (tx) => findClaimForBusiness(tx, tenant.businessId));
  if (claim === null || claim.placeId === null) return null;
  const statuses = await readDirectoryStatuses(getStaffDb(), { placeIds: [claim.placeId], unplacedKeys: [] });
  return statuses.get(claim.placeId)?.verifiedAt ?? null;
}
