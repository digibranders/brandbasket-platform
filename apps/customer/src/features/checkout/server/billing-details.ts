import "server-only";
import { findBillingProfile, findBusinessCurrency, findPincode, getBusinessProfile, hasPincodeDirectory, saveBillingProfile, withTenantScope } from "@brandbasket/db";
import { firstCustomerBillingProblem, parseCustomerBillingDetails, pincodeStateProblem } from "@brandbasket/shared/lib/billing/billing-details-form";
import { stateName } from "@brandbasket/shared/lib/directory/india-states";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { billingDetailsStart, savedBillingDetails } from "@brandbasket/shared/lib/billing/billing-details-start";
import { savedPhoneStart } from "@brandbasket/shared/server/phone-defaults";
import { billsInRupees, type BillingDetailsView } from "../rules/billing-details-view";
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

/**
 * Whether this business is billed in rupees and has saved no billing details yet. Its first tax invoice is made out from
 * them and cannot be changed once issued, so a checkout waits for them. A business that gets no tax invoice never lacks them.
 */
export async function billingDetailsMissing(customer: Pick<GrantedCustomer, "tenant" | "billing">): Promise<boolean> {
  if (!(await billedInRupees(customer))) return false;
  const { tenant } = customer;
  return (await withTenantScope(getAppDb(), tenant, (tx) => findBillingProfile(tx, tenant.businessId))) === null;
}

/**
 * Saves the business's billing details for its tax invoices, from the checkout or from Plan & billing. Ported from apps/platform
 * app/app-host/(protected)/billing/actions.ts saveBillingDetailsAction. Writing one's own details needs only a signed-in
 * member, and row-level security keeps the write to that business. Without a GSTIN the chosen state decides the invoice's tax
 * split, so it must agree with the pincode; a pincode the directory does not list is let through (it is new, not wrong). The
 * billing contact and a legal name staff saved without a GSTIN are kept: this form has no fields for them.
 */
export async function saveBillingDetailsFor(customer: Pick<GrantedCustomer, "tenant">, formData: FormData): Promise<ActionResult> {
  const { tenant } = customer;
  const existing = await withTenantScope(getAppDb(), tenant, (tx) => findBillingProfile(tx, tenant.businessId));
  const parsed = parseCustomerBillingDetails(formData, {
    businessName: tenant.businessName,
    keep: {
      legalName: existing !== null && existing.gstin === null ? existing.legalName : null,
      email: existing?.email ?? null,
      phone: existing?.phone ?? null,
    },
  });
  if (!parsed.ok) {
    const first = firstCustomerBillingProblem(parsed.errors);
    return actionFail(first.message, parsed.errors);
  }
  const { details } = parsed;
  if (details.gstin === null) {
    const place = await findPincode(getAppDb(), details.postalCode);
    const problem = place === null ? null : pincodeStateProblem(place.stateCode, details.stateCode);
    if (problem !== null) return actionFail(problem, { stateCode: problem });
  }
  await withTenantScope(getAppDb(), tenant, (tx) => saveBillingProfile(tx, { businessId: tenant.businessId, ...details }));
  return actionOk();
}

/** What a pincode tells the billing form: the state to select, and the district as a start for the city. */
export type BillingPincodeLookup =
  | { readonly kind: "found"; readonly stateCode: string; readonly stateName: string; readonly district: string }
  /** The directory has this pincode's neighbours but not it: a new one, or a typo. */
  | { readonly kind: "not-found" }
  /** No pincode directory is loaded on this deployment (Brandbasket's has none): the form says nothing. */
  | { readonly kind: "no-directory" };

/** Looks a pincode up in India Post's directory, when this deployment has it. Anything not a short string is simply not found. */
export async function lookupBillingPincode(pincode: string): Promise<BillingPincodeLookup> {
  if (pincode.length > 12) return { kind: "not-found" };
  const place = await findPincode(getAppDb(), pincode.replace(/\s+/g, ""));
  if (place === null) return (await hasPincodeDirectory(getAppDb())) ? { kind: "not-found" } : { kind: "no-directory" };
  return { kind: "found", stateCode: place.stateCode, stateName: stateName(place.stateCode) ?? place.stateCode, district: place.districtName };
}
