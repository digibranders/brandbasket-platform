import "server-only";
import { paidCustomerOrNull } from "./blog-access";
import { getCustomerBusinessKind, requireCustomerAccess, type GrantedCustomer } from "./customer-access";
import { getCustomerTenant } from "./customer-tenant";

/**
 * Who may add and remove holidays. A free listing account keeps its opening hours and holidays on its Business profile
 * and pays nothing, so it is let through as the Details save is; every other account must have paid, and an unpaid one
 * gets null (the caller answers "pay first") rather than a redirect. No session is sent on to sign-in, as everywhere.
 */
export async function holidayAccessOrNull(): Promise<GrantedCustomer | null> {
  const tenant = await getCustomerTenant();
  if (tenant === null) return requireCustomerAccess();
  const kind = await getCustomerBusinessKind(tenant.userId, tenant.businessId);
  if (kind === "listing") return requireCustomerAccess({ listingAccount: "allow" });
  return paidCustomerOrNull();
}
