"use server";

import { findBillingProfile, findPincode, hasPincodeDirectory, saveBillingProfile, withTenantScope } from "@brandbasket/db";
import {
  firstCustomerBillingProblem,
  parseCustomerBillingDetails,
  pincodeStateProblem,
} from "@brandbasket/shared/lib/billing/billing-details-form";
import { readBundleSelection } from "@brandbasket/shared/lib/billing/bundle";
import { stateName } from "@brandbasket/shared/lib/directory/india-states";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import type { ReactivateFormState } from "@/lib/billing/reactivate-form";
import { panelFormErrorState, panelFormSavedState, type PanelFormState } from "@/lib/panel-form-state";
import { redirectForChargePayment } from "@/lib/server/charge-redirect";
import { startCustomerChargePayment } from "@/lib/server/charges";
import { startReactivationFor } from "@/lib/server/checkout";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { unexpectedErrorState } from "@/lib/server/panel-form-errors";

const chargeIdSchema = z.uuid();

/**
 * Pay on the Billing page. A form post, so opening a payment only ever happens on purpose, never on a page load or a
 * link prefetch. The charge id comes from the form and is checked against the signed-in customer's own charges.
 */
export async function payChargeAction(formData: FormData): Promise<void> {
  const parsed = chargeIdSchema.safeParse(formData.get("chargeId"));
  if (!parsed.success) notFound();
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  redirectForChargePayment(await startCustomerChargePayment(customer, parsed.data));
}

/**
 * Reactivate on Billing. A form post, so opening a payment only ever happens on purpose. The only thing read from the form
 * is the services a customer who cancelled themselves chose (catalogue ids; anything else is dropped, and none is refused by
 * startReactivationFor). Whether this business may reactivate, whether it chooses its services or comes back as it was, on which
 * plan and for how much is worked out on the server, under the business's billing lock. On success the customer goes to pay.
 */
export async function reactivateAction(_previous: ReactivateFormState, formData: FormData): Promise<ReactivateFormState> {
  const customer = await requireCustomerAccess();
  const chosen = readBundleSelection(formData.getAll("service").filter((value): value is string => typeof value === "string"));
  const outcome = await startReactivationFor(customer, new Date(), chosen);
  if (outcome.kind === "refused") return { status: "error", message: outcome.problem.message };
  redirect(outcome.url);
}

/**
 * Saves the business's billing details for its tax invoices, from Billing or from a checkout page. Open to listing
 * accounts and to one still buying its membership: writing one's own details needs only a signed-in member, and
 * row-level security keeps the write to that business. Details apply to invoices issued after this (D6). `refresh`
 * redraws whichever page the form sits on, so its facts and any prompt update in place. The billing contact saved
 * earlier (staff can set it) is kept: this form has no fields for it.
 */
export async function saveBillingDetailsAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" });
  const { tenant } = customer;
  try {
    const existing = await withTenantScope(getAppDb(), tenant, (tx) => findBillingProfile(tx, tenant.businessId));
    const parsed = parseCustomerBillingDetails(formData, {
      businessName: tenant.businessName,
      keep: {
        legalName: existing !== null && existing.gstin === null ? existing.legalName : null,
        email: existing?.email ?? null,
        phone: existing?.phone ?? null,
      },
    });
    if (!parsed.ok) return panelFormErrorState(firstCustomerBillingProblem(parsed.errors), formData);
    const { details } = parsed;
    // Without a GSTIN the chosen state decides the invoice's tax split, so it must agree with the pincode. A pincode the
    // directory does not list is let through: it is new, not wrong.
    if (details.gstin === null) {
      const place = await findPincode(getAppDb(), details.postalCode);
      const problem = place === null ? null : pincodeStateProblem(place.stateCode, details.stateCode);
      if (problem !== null) return panelFormErrorState({ message: problem, field: "stateCode" }, formData);
    }
    await withTenantScope(getAppDb(), tenant, (tx) => saveBillingProfile(tx, { businessId: tenant.businessId, ...details }));
  } catch (error) {
    console.error("[billing] saveBillingDetailsAction failed", errorLogInfo(error));
    return unexpectedErrorState(error, formData);
  }
  refresh();
  return panelFormSavedState;
}

/** What a pincode tells the billing form: the state to select, and the district as a start for the city. */
export type BillingPincodeLookup =
  | { readonly kind: "found"; readonly stateCode: string; readonly stateName: string; readonly district: string }
  /** The directory has this pincode's neighbours but not it: a new one, or a typo. */
  | { readonly kind: "not-found" }
  /** No pincode directory is loaded on this deployment (Brandbasket's has none): the lookup has nothing to say, so the form says nothing. */
  | { readonly kind: "no-directory" };

/**
 * Looks a pincode up in India Post's directory (when this deployment has loaded it) so the billing form can fill the state and suggest the city. Its argument
 * comes straight from the browser, so anything that is not a six digit pincode is simply not found. Needs a signed-in
 * customer like the form it serves; reads no business data.
 */
export async function lookupBillingPincodeAction(pincode: string): Promise<BillingPincodeLookup> {
  await requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" });
  if (typeof pincode !== "string" || pincode.length > 12) return { kind: "not-found" };
  const place = await findPincode(getAppDb(), pincode.replace(/\s+/g, ""));
  if (place === null) return (await hasPincodeDirectory(getAppDb())) ? { kind: "not-found" } : { kind: "no-directory" };
  return { kind: "found", stateCode: place.stateCode, stateName: stateName(place.stateCode) ?? place.stateCode, district: place.districtName };
}
