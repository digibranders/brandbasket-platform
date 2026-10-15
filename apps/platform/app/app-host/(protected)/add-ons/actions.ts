"use server";

import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MONTHLY_ADD_ON_IDS } from "@fynix/shared/lib/billing/add-ons";
import type { AddOnStartState } from "@/lib/billing/add-on-form";
import { panelFormErrorState, panelFormSavedState, type PanelFormState } from "@/lib/panel-form-state";
import {
  removeBundledAddOnFor,
  scheduleAddOnEndFor,
  startAddOnCheckoutFor,
  type AddOnCheckoutOutcome,
  type AddOnEndResult,
  type BundledRemovalResult,
} from "@/lib/server/add-ons";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { GENERIC_ERROR_MESSAGE, unexpectedErrorState } from "@/lib/server/panel-form-errors";

const startSchema = z.object({
  addOn: z.enum(MONTHLY_ADD_ON_IDS),
  intent: z.enum(["buy", "resume", "pay-now", "keep"]),
});

const endSchema = z.object({
  addOnSubscriptionId: z.uuid(),
  kind: z.enum(["cancel", "pause"]),
});

const UNREADABLE_FORM = "We couldn't tell what you asked for. Reload the page and try again.";

function startError(message: string): AddOnStartState {
  return { status: "error", message };
}

/**
 * Where a started purchase goes: to its payment, or back to the dialog with the reason. `redirect` throws, so it is
 * called outside any try block.
 */
function finishStart(outcome: AddOnCheckoutOutcome): AddOnStartState {
  if (outcome.kind === "refused") return startError(outcome.message);
  redirect(outcome.url);
}

/**
 * Get it, Resume, Pay now or Keep it on the Add-ons page. A form post, so a payment only ever opens on purpose. The
 * form carries just the add-on and the intent; whether this business may do that, at what price and from when is
 * worked out on the server under the business's billing lock (startAddOnCheckoutFor). Open to a free listing account.
 */
export async function startAddOnAction(_previous: AddOnStartState, formData: FormData): Promise<AddOnStartState> {
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  const parsed = startSchema.safeParse({ addOn: formData.get("addOn"), intent: formData.get("intent") });
  if (!parsed.success) return startError(UNREADABLE_FORM);
  let outcome: AddOnCheckoutOutcome;
  try {
    outcome = await startAddOnCheckoutFor(customer, parsed.data.addOn, parsed.data.intent, new Date());
  } catch (error) {
    console.error("[add-ons] startAddOnAction failed", errorLogInfo(error));
    return startError(GENERIC_ERROR_MESSAGE);
  }
  return finishStart(outcome);
}

/**
 * Pause or Cancel on the Add-ons page. The form carries only the add-on row's id and the kind; the row is read by id
 * within the signed-in customer's own business, so another business's id finds nothing. The page is refreshed whether
 * or not it worked, because a refusal usually means the add-on changed under the customer's feet.
 */
export async function endAddOnAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  const parsed = endSchema.safeParse({ addOnSubscriptionId: formData.get("addOnSubscriptionId"), kind: formData.get("kind") });
  if (!parsed.success) return panelFormErrorState({ message: UNREADABLE_FORM, field: null }, formData);
  let result: AddOnEndResult;
  try {
    result = await scheduleAddOnEndFor(customer, parsed.data.addOnSubscriptionId, parsed.data.kind, new Date());
  } catch (error) {
    console.error("[add-ons] endAddOnAction failed", errorLogInfo(error));
    return unexpectedErrorState(error, formData);
  }
  refresh();
  return result.kind === "done" ? panelFormSavedState : panelFormErrorState({ message: result.message, field: null }, formData);
}

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
