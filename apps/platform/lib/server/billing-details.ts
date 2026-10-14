import "server-only";
import { findBillingProfile, findBusinessCurrency, getBusinessProfile, withTenantScope } from "@firstfold/db";
import { billingDetailsStart, savedBillingDetails } from "@firstfold/shared/lib/billing/billing-details-start";
import { savedPhoneStart } from "@firstfold/shared/server/phone-defaults";
import { billsInRupees, type BillingDetailsView } from "@/lib/billing/billing-details-view";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb } from "./db";

/**
 * Whether this business is billed in rupees. The plan's currency answers it for a business with a plan; a free listing
 * account has none, so its own currency is read through its tenant scope.
 */
async function billedInRupees(customer: Pick<GrantedCustomer, "tenant" | "billing">): Promise<boolean> {
  const planCurrency = customer.billing.plan?.currency ?? null;
  if (planCurrency !== null) return billsInRupees(planCurrency, null);
  const { tenant } = customer;
  const currency = await withTenantScope(getAppDb(), tenant, (tx) => findBusinessCurrency(tx, tenant.businessId));
  return billsInRupees(null, currency);
}

/**
 * Billing details for the card and the inline form, or null for a business that gets no tax invoices. Read through
 * the business's own tenant scope, so row-level security keeps it to that business.
 */
export async function loadBillingDetailsView(
  customer: Pick<GrantedCustomer, "tenant" | "billing">,
): Promise<BillingDetailsView | null> {
  if (!(await billedInRupees(customer))) return null;
  const { tenant } = customer;
  const { profile, onboarding } = await withTenantScope(getAppDb(), tenant, async (tx) => ({
    profile: await findBillingProfile(tx, tenant.businessId),
    onboarding: await getBusinessProfile(tx),
  }));
  return {
    saved: profile === null ? null : savedBillingDetails(profile),
    businessName: tenant.businessName,
    start: billingDetailsStart({
      profile,
      businessName: tenant.businessName,
      onboarding,
      phone: savedPhoneStart(profile?.phone ?? null),
    }),
  };
}
