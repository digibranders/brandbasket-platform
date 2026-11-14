"use server";

import { readBundleSelection } from "@brandbasket/shared/lib/billing/bundle";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { parseForm } from "@/lib/form";
import { requireOwner } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { chargeNoticeHref, chargePayPath } from "../checkout/rules/charge-notices";
import { saveBillingDetailsFor } from "../checkout/server/billing-details";
import { startCustomerChargePayment } from "../checkout/server/charges";
import { startReactivationFor } from "../checkout/server/checkout";
import { AddServiceForm, BILLING_PATH, CancelServiceForm, PAYMENT_PATH } from "./rules";
import { addBundledAddOnFor, removeBundledAddOnFor, type AddOnAddResult, type BundledRemovalResult } from "./server/add-ons";
import { getPaymentMethodUpdateUrlFor } from "./server/billing";

/*
 * Plan & billing's actions, ported from apps/platform app/app-host/(protected)/services/actions.ts and billing/actions.ts. The
 * old app let any member change the services; v4 keeps billing changes to the owner (plan 60: owners manage billing), and a
 * change to the plan needs a paid period running now. No form carries a price: the service is the only thing read, and it is
 * priced again under the business's billing lock. A double press finds the same open charge, or a service already going, so
 * each change happens once (the old app's protection; it used no separate idempotency key).
 */

const TRY_AGAIN = "Something went wrong on our side. Please try again in a minute.";

/**
 * Add a service, or keep one that is ending. Adding opens a charge for the rest of the paid month and sends the customer
 * straight to pay it; keeping costs nothing and redraws the page.
 */
export async function addServiceAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const customer = await requireOwner({ write: true });
  const parsed = parseForm(AddServiceForm, formData);
  if (!parsed.ok) return parsed;
  let result: AddOnAddResult;
  try {
    result = await addBundledAddOnFor(customer, parsed.data.addOn, new Date());
  } catch (error) {
    reportError(error, { area: "billing.add" });
    return actionFail(TRY_AGAIN);
  }
  revalidatePath(BILLING_PATH);
  if (result.kind === "refused") return actionFail(result.message);
  if (result.kind === "done") return actionOk();
  // Outside the try: a redirect is thrown, and must not be caught as a failure.
  if (result.kind === "approve") redirect(result.url);
  const started = await startCustomerChargePayment(customer, result.chargeId);
  switch (started.kind) {
    case "not-found":
      return actionFail("We couldn't add that just now. Reload the page to see where it stands.");
    case "not-open":
      redirect(chargeNoticeHref("not-open"));
    case "redirect":
      redirect(started.url);
    case "razorpay":
      redirect(chargePayPath(started.charge.id));
    default: {
      const unhandled: never = started;
      throw new Error(`Unhandled charge payment start: ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * Cancel a service from the next billing date, with the customer's reason kept on it. Refused for the only service (that is
 * closing the account, in Settings), while the account is closing, and while a kept plan waits to start. The page redraws
 * either way, because a refusal usually means it changed under the customer's feet.
 */
export async function cancelServiceAction(_previous: ActionResult<{ message: string }> | null, formData: FormData): Promise<ActionResult<{ message: string }>> {
  const customer = await requireOwner({ write: true });
  const parsed = parseForm(CancelServiceForm, formData);
  if (!parsed.ok) return parsed;
  let result: BundledRemovalResult;
  try {
    result = await removeBundledAddOnFor(customer, parsed.data.addOn, new Date(), parsed.data.reason);
  } catch (error) {
    reportError(error, { area: "billing.cancel" });
    return actionFail(TRY_AGAIN);
  }
  revalidatePath(BILLING_PATH);
  return result.kind === "scheduled" ? actionOk({ message: result.message }) : actionFail(result.message);
}

/**
 * Reactivate a lapsed plan through the checkout's reactivation path. The only thing read from the form is the services a
 * customer who cancelled themselves chose (catalogue ids; anything else is dropped). Whether the business may reactivate, on
 * which plan and for how much is worked out under the billing lock. On success the customer goes to pay.
 */
export async function reactivateAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const customer = await requireOwner();
  const chosen = readBundleSelection(formData.getAll("service").filter((value): value is string => typeof value === "string"));
  const outcome = await startReactivationFor(customer, new Date(), chosen);
  if (outcome.kind === "refused") return actionFail(outcome.problem.message);
  redirect(outcome.url);
}

/** The billing details for tax invoices. Open in every billing state, so an unpaid or lapsed owner can set them too. */
export async function saveBillingDetailsAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const customer = await requireOwner();
  try {
    const saved = await saveBillingDetailsFor(customer, formData);
    if (saved.ok) revalidatePath(PAYMENT_PATH);
    return saved;
  } catch (error) {
    reportError(error, { area: "billing.details" });
    return actionFail("We couldn't save your billing details just now. Please try again in a minute.");
  }
}

/**
 * Update payment method through the provider (Razorpay hosted short_url flow).
 * Open to the business owner to update their card or UPI on Razorpay.
 */
export async function changePaymentMethodAction(): Promise<ActionResult> {
  const customer = await requireOwner();
  let url: string;
  try {
    url = await getPaymentMethodUpdateUrlFor(customer);
  } catch (error) {
    reportError(error, { area: "billing.change-payment-method" });
    return actionFail(TRY_AGAIN);
  }
  redirect(url);
}
