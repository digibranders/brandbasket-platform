"use server";

import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { refresh } from "next/cache";
import { z } from "zod";
import { MONTHLY_ADD_ON_IDS } from "@brandbasket/shared/lib/billing/add-ons";
import { panelFormErrorState, panelFormSavedState, type PanelFormState } from "@/lib/panel-form-state";
import { removeBundledAddOnFor, type BundledRemovalResult } from "@/lib/server/add-ons";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { unexpectedErrorState } from "@/lib/server/panel-form-errors";

const UNREADABLE_FORM = "We couldn't tell what you asked for. Reload the page and try again.";

const removeBundledSchema = z.object({ addOn: z.enum(MONTHLY_ADD_ON_IDS) });

/**
 * Remove on an add-on that was taken with the plan: it stops at the next billing date and the monthly payment goes down. The
 * form carries only which add-on; the row, the date and the new amount come from the server (removeBundledAddOnFor). The page
 * is refreshed whether or not it worked, because a refusal usually means it changed under the customer's feet.
 */
export async function removeBundledAddOnAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  const parsed = removeBundledSchema.safeParse({ addOn: formData.get("addOn") });
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
