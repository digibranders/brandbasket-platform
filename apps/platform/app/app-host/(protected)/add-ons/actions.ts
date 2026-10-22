"use server";

import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { refresh } from "next/cache";
import { z } from "zod";
import { MONTHLY_ADD_ON_IDS } from "@brandbasket/shared/lib/billing/add-ons";
import { panelFormErrorState, panelFormSavedState, type PanelFormState } from "@/lib/panel-form-state";
import { addBundledAddOnFor, removeBundledAddOnFor, type AddOnAddResult, type BundledRemovalResult } from "@/lib/server/add-ons";
import { redirectForChargePayment } from "@/lib/server/charge-redirect";
import { startCustomerChargePayment } from "@/lib/server/charges";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { unexpectedErrorState } from "@/lib/server/panel-form-errors";

const UNREADABLE_FORM = "We couldn't tell what you asked for. Reload the page and try again.";

const addOnSchema = z.object({ addOn: z.enum(MONTHLY_ADD_ON_IDS) });

/**
 * Remove on an add-on that was taken with the plan: it stops at the next billing date. The
 * form carries only which add-on; the row, the date and the new amount come from the server (removeBundledAddOnFor). The page
 * is refreshed whether or not it worked, because a refusal usually means it changed under the customer's feet.
 */
export async function removeBundledAddOnAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  const parsed = addOnSchema.safeParse({ addOn: formData.get("addOn") });
  if (!parsed.success) return panelFormErrorState({ message: UNREADABLE_FORM, field: null }, formData);
  let result: BundledRemovalResult;
  try {
    result = await removeBundledAddOnFor(customer, parsed.data.addOn, new Date());
  } catch (error) {
    console.error("[add-ons] removeBundledAddOnAction failed", errorLogInfo(error));
    return unexpectedErrorState(error, formData);
  }
  refresh();
  return result.kind === "scheduled" ? panelFormSavedState : panelFormErrorState({ message: result.message, field: null }, formData);
}

/**
 * Add on an add-on that is not in the plan's payment, or one that is ending. Adding opens a charge for the rest of the paid
 * month and sends the customer straight to pay it; keeping one that is ending costs nothing and redraws the page. The form
 * carries only which add-on; the price is worked out again on the server (addBundledAddOnFor).
 */
export async function addBundledAddOnAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  const parsed = addOnSchema.safeParse({ addOn: formData.get("addOn") });
  if (!parsed.success) return panelFormErrorState({ message: UNREADABLE_FORM, field: null }, formData);
  let result: AddOnAddResult;
  try {
    result = await addBundledAddOnFor(customer, parsed.data.addOn, new Date());
  } catch (error) {
    console.error("[add-ons] addBundledAddOnAction failed", errorLogInfo(error));
    return unexpectedErrorState(error, formData);
  }
  // Outside the try: a redirect is thrown, and must not be caught as a failure.
  if (result.kind === "pay") redirectForChargePayment(await startCustomerChargePayment(customer, result.chargeId));
  refresh();
  return result.kind === "done" ? panelFormSavedState : panelFormErrorState({ message: result.message, field: null }, formData);
}
