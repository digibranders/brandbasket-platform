import "server-only";
import { attachAccountToNewBusiness, type AccountAttachment, type Database } from "@firstfold/db";
import { syncTenantForBusiness } from "./payload-tenant-sync";

/**
 * Wraps `attachAccountToNewBusiness` (the staff "attach account" repair — see
 * app/(protected)/leads/[leadId]/actions.ts) with the Payload tenant sync that every business creation
 * needs. This is one of two places a business is created; the other is `redeemSetupInvite` in ./setup.ts, which
 * does the same right after `redeemInviteIntoBusiness`.
 */
export async function attachAccountAndSyncTenant(
  db: Database,
  attachment: AccountAttachment,
): Promise<{ readonly businessId: string }> {
  const { businessId, businessName } = await attachAccountToNewBusiness(db, attachment);
  await syncTenantForBusiness({ businessId, name: businessName });
  return { businessId };
}
