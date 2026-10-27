"use server";

import { ChangeRequestError, moveChangeAsCustomer, withTenantScope, type CustomerMove } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requestHref, type RequestNotice } from "@/lib/requests/links";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { readRequestIds } from "@/lib/server/request-form-ids";

/** Runs one of the customer's own moves through the database function that checks the business, the state and the 14 days. */
async function moveAsCustomer(formData: FormData, move: CustomerMove): Promise<never> {
  const { tenant } = await requireCustomerAccess();
  const { requestId, ticketId } = readRequestIds(formData);
  let notice: RequestNotice | undefined;
  try {
    await withTenantScope(getAppDb(), tenant, (tx) => moveChangeAsCustomer(tx, requestId, move));
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ChangeRequestError && (error.code === "wrong_state" || error.code === "not_found")) notice = "changed";
    else if (error instanceof ChangeRequestError && error.code === "window_closed") notice = "window";
    else {
      console.error("[requests] could not move a request", errorLogInfo(error));
      notice = "failed";
    }
  }
  revalidatePath("/requests");
  revalidatePath("/");
  redirect(requestHref(ticketId, notice));
}

/** "Not now" on a quote: the quote closes and can be reopened for 14 days. Only possible before the customer has accepted it. */
export async function declineQuoteAction(formData: FormData): Promise<void> {
  await moveAsCustomer(formData, "decline");
}

/** "Looks good" on a change that is ready to check. */
export async function approveChangeAction(formData: FormData): Promise<void> {
  await moveAsCustomer(formData, "approve");
}

/** Reopen a finished change as a fix, or a quote they said not now to, within 14 days. */
export async function reopenRequestAction(formData: FormData): Promise<void> {
  await moveAsCustomer(formData, "reopen");
}
