"use server";

import { ChangeRequestError } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { revalidatePath } from "next/cache";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { requestHref } from "@/lib/requests/links";
import { requireBillingAccess } from "@/lib/server/billing";
import { openQuoteCharge } from "@/lib/server/change-quote";
import { redirectForChargePayment } from "@/lib/server/charge-redirect";
import { startCustomerChargePayment } from "@/lib/server/charges";
import { readRequestIds } from "@/lib/server/request-form-ids";
import { loadTicketIdOfRequest } from "@/lib/server/requests";

/**
 * "Accept and pay": the customer's yes to a quote. Opens the charge for it (the same charge if it is pressed twice) and
 * sends the customer to pay through the same payment flow as every other charge. The work starts when the money is recorded.
 * The id of the quote comes from the form, but the business it must belong to comes from the session.
 */
export async function acceptQuoteAction(formData: FormData): Promise<void> {
  const customer = await requireBillingAccess();
  const { requestId } = readRequestIds(formData);
  // The ticket to go back to comes from the request, not the form, so the two cannot disagree.
  const ticketId = await loadTicketIdOfRequest(customer.tenant, requestId);
  if (ticketId === null) notFound();
  let chargeId: string;
  try {
    ({ chargeId } = await openQuoteCharge(customer, requestId, new Date()));
  } catch (error) {
    unstable_rethrow(error);
    const changed = error instanceof ChangeRequestError && (error.code === "wrong_state" || error.code === "not_found");
    if (!changed) console.error("[requests] could not accept a quote", errorLogInfo(error));
    revalidatePath("/requests");
    redirect(requestHref(ticketId, changed ? "changed" : "failed"));
  }
  revalidatePath("/requests");
  redirectForChargePayment(await startCustomerChargePayment(customer, chargeId));
}
