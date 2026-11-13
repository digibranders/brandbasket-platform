import "server-only";
import { findBusinessEntry, withTenantScope, type BusinessEntry } from "@brandbasket/db";
import { CustomerBusinessMissingError, type CustomerContext } from "@/lib/guards";
import { getAppDb } from "./db";

/**
 * The business's kind and sign-up choice, through row-level security. A business of kind `listing` is the account a sign-up
 * opened, held on /start and /checkout until its first payment makes it a client (the old app's unpaid hold,
 * apps/platform lib/server/customer-access.ts). The caller has run a guard.
 */
export async function loadBusinessEntry(customer: Pick<CustomerContext, "tenant">): Promise<BusinessEntry> {
  const { tenant } = customer;
  const entry = await withTenantScope(getAppDb(), tenant, (tx) => findBusinessEntry(tx, tenant.businessId));
  if (entry === null) throw new CustomerBusinessMissingError(tenant.businessId);
  return entry;
}

/**
 * A sign-up account that chose Managed Website and has not paid: it has no dashboard, only /start and /checkout (the old
 * isAwaitingMembership). For the workspace layout's hold; /start and /checkout themselves open to any `listing` business.
 */
export function isAwaitingFirstPayment(entry: BusinessEntry): boolean {
  return entry.kind === "listing" && entry.signupChoice === "managed";
}
