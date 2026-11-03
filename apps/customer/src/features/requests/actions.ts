"use server";

import {
  appendSupportReplyWithOutcome,
  ChangeRequestError,
  createSupportTicketWithOutcome,
  findTicketIdOfChangeRequest,
  markSupportTicketRead,
  moveChangeAsCustomer,
  SupportQueryError,
  withTenantScope,
  type CustomerMove,
} from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { startCustomerChargePayment } from "@/features/checkout/server/charges";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { getAppDb } from "@/lib/db";
import { requireBilling, requireCustomer, type CustomerContext } from "@/lib/guards";
import { reportError } from "@/lib/report";
import {
  canWrite,
  chargePath,
  intentOptions,
  intentRule,
  parseAsk,
  parseReadReceipt,
  parseReply,
  parseRequestId,
  refusalMessage,
  refusalOf,
  supportSubmissionsEnabled,
  titleFromText,
} from "./rules";
import { openQuoteCharge, sendReplyAlert, sendTicketAlert, supportRateLimit } from "./server";

/*
 * The writes of Requests. Each calls its own guard, takes the business and the person from the session and reads only ids,
 * text and the idempotency key from the form. A viewer is refused here as well as being shown no button.
 */

const VIEWER_MESSAGE = "Your role can read requests but not change them. Ask the owner of the account.";
const NOT_SAVED = "Your request could not be saved. What you wrote is still here; try again.";

function refresh(): void {
  revalidatePath("/requests");
  revalidatePath("/");
}

function supportFailure(error: unknown, area: string, fallback: string): ReturnType<typeof actionFail> {
  unstable_rethrow(error);
  console.error(`[requests] ${area}`, errorLogInfo(error));
  if (error instanceof SupportQueryError) {
    if (error.code === "closed") return actionFail("This request is closed. Open a new request to continue.");
    if (error.code === "conflict") return actionFail("This request changed. Refresh the page and try again.");
    return actionFail("Check your request and your screenshots, then try again.");
  }
  reportError(error, { area });
  return actionFail(fallback);
}

/**
 * Sends a new request. Only a change to a service the customer has opens a change request (a quote and a state); a question,
 * a note, a fault or a billing query is a plain conversation. The ticket and its change details are made in one
 * transaction, and the same submission key returns the saved ticket, so the team is told once however often it is sent.
 */
export async function sendRequestAction(_previous: ActionResult<{ ticketId: string }> | null, formData: FormData): Promise<ActionResult<{ ticketId: string }>> {
  // A live paid period: a form opened before access lapsed must not send.
  const customer = await requireBilling();
  if (!canWrite(customer.role)) return actionFail(VIEWER_MESSAGE);
  const { user, tenant } = customer;
  if (!supportSubmissionsEnabled(process.env.BRANDBASKET_SUPPORT_MODE, process.env.BRANDBASKET_SUPPORT_INTERNAL_ACCOUNT_IDS, user.id)) {
    return actionFail("New requests are temporarily unavailable. Please try again later.");
  }
  const parsed = parseAsk(formData, intentOptions(customer.services).map((option) => option.value));
  if (!parsed.ok) return parsed;
  const limit = await supportRateLimit(user.id, false);
  if (limit !== null) return actionFail(limit);
  const { intent, page, body, attachmentIds, submissionKey } = parsed.data;
  const rule = intentRule(intent);
  const subject = titleFromText(body);
  const details = page === null ? undefined : { pageUrl: page };
  try {
    const { ticket, created } = await createSupportTicketWithOutcome(getAppDb(), {
      userId: user.id,
      businessId: tenant.businessId,
      category: rule.category,
      subject,
      description: body,
      ...(details === undefined ? {} : { details }),
      attachmentIds,
      submissionKey,
      ...(rule.change === null ? {} : { changeRequest: { kind: rule.change, page } }),
    });
    // A retried submission returns the saved ticket; the team was told the first time.
    if (created) {
      void sendTicketAlert(
        ticket,
        { category: rule.category, subject, description: body, ...(details === undefined ? {} : { details }), attachmentIds },
        { user, businessId: tenant.businessId, businessName: tenant.businessName },
      ).catch((error: unknown) => console.error("[requests] team alert", errorLogInfo(error)));
    }
    refresh();
    return actionOk({ ticketId: ticket.id });
  } catch (error) {
    return supportFailure(error, "requests.send", NOT_SAVED);
  }
}

/** A reply in the conversation. Works while the account is lapsed: the customer can always answer the team. */
export async function replyAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const customer = await requireCustomer();
  if (!canWrite(customer.role)) return actionFail(VIEWER_MESSAGE);
  const parsed = parseReply(formData);
  if (!parsed.ok) return parsed;
  const { user } = customer;
  const limit = await supportRateLimit(user.id, true);
  if (limit !== null) return actionFail(limit);
  const { ticketId, body, attachmentIds, submissionKey } = parsed.data;
  try {
    const { created } = await appendSupportReplyWithOutcome(getAppDb(), { userId: user.id, ticketId, body, attachmentIds, submissionKey });
    if (created) {
      void sendReplyAlert(getAppDb(), ticketId, { body, attachmentIds }, user).catch((error: unknown) => console.error("[requests] team alert", errorLogInfo(error)));
    }
    revalidatePath(`/requests/${ticketId}`);
    refresh();
    return actionOk();
  } catch (error) {
    return supportFailure(error, "requests.reply", "Your reply could not be saved. Your draft is still here; try again.");
  }
}

/** Runs one of the customer's own moves through the database function that checks the business, the state and the 14 days. */
async function moveAs(customer: CustomerContext, formData: FormData, move: CustomerMove): Promise<ActionResult> {
  if (!canWrite(customer.role)) return actionFail(VIEWER_MESSAGE);
  const ids = parseRequestId(formData);
  if (!ids.ok) return ids;
  try {
    await withTenantScope(getAppDb(), customer.tenant, (tx) => moveChangeAsCustomer(tx, ids.requestId, move));
  } catch (error) {
    unstable_rethrow(error);
    const refusal = refusalOf(error instanceof ChangeRequestError ? error.code : null);
    if (refusal === "failed") {
      console.error("[requests] could not move a request", errorLogInfo(error));
      reportError(error, { area: `requests.${move}` });
    }
    return actionFail(refusalMessage(refusal));
  }
  refresh();
  return actionOk();
}

/** "Not now" on a quote: the quote closes and can be reopened for 14 days. Only possible before the customer has accepted it. */
export async function declineQuoteAction(formData: FormData): Promise<ActionResult> {
  return moveAs(await requireCustomer(), formData, "decline");
}

/** "Looks good" on a change that is ready to check. */
export async function approveChangeAction(formData: FormData): Promise<ActionResult> {
  return moveAs(await requireCustomer(), formData, "approve");
}

/** Reopen a finished change as a fix, or a quote they said not now to, within 14 days. */
export async function reopenRequestAction(formData: FormData): Promise<ActionResult> {
  return moveAs(await requireCustomer(), formData, "reopen");
}

/**
 * "Accept and pay": the customer's yes to a quote. Opens the charge for it (the same charge if it is pressed twice), opens
 * the payment on it (one Razorpay order per charge, recorded before the customer is sent on, because the pay page only reads
 * the stored order) and returns where to pay it; the work starts when the money is recorded. The quote's id comes from the form, the business it
 * must belong to from the session.
 */
export async function acceptQuoteAction(formData: FormData): Promise<ActionResult<{ href: string }>> {
  const customer = await requireBilling();
  if (!canWrite(customer.role)) return actionFail(VIEWER_MESSAGE);
  const ids = parseRequestId(formData);
  if (!ids.ok) return ids;
  try {
    // Never trust the posted id alone: the request must be one of this business's.
    const ticketId = await withTenantScope(getAppDb(), customer.tenant, (tx) => findTicketIdOfChangeRequest(tx, customer.businessId, ids.requestId));
    if (ticketId === null) return actionFail(refusalMessage("changed"));
    const { chargeId } = await openQuoteCharge(customer, ids.requestId, new Date());
    const started = await startCustomerChargePayment(customer, chargeId);
    refresh();
    // The fake provider (local and staging) has its own test page; Razorpay opens on the charge's pay page.
    if (started.kind === "redirect") return actionOk({ href: started.url });
    if (started.kind === "razorpay") return actionOk({ href: chargePath(chargeId) });
    return actionFail(refusalMessage("changed"));
  } catch (error) {
    unstable_rethrow(error);
    const refusal = refusalOf(error instanceof ChangeRequestError ? error.code : null);
    if (refusal === "failed") {
      console.error("[requests] could not accept a quote", errorLogInfo(error));
      reportError(error, { area: "requests.accept" });
    }
    return actionFail(refusalMessage(refusal));
  }
}

/** Marks the newest message the customer has seen as read, which clears the reply from the bell. Called once, when the tab is visible. */
export async function markReadAction(ticketId: string, messageId: string): Promise<ActionResult> {
  const customer = await requireCustomer();
  if (!parseReadReceipt(ticketId, messageId)) return actionFail("This request could not be found.");
  try {
    await markSupportTicketRead(getAppDb(), customer.user.id, ticketId, messageId);
    // Reading a reply clears its line in the bell, which the layout draws.
    revalidatePath("/requests");
    return actionOk();
  } catch (error) {
    unstable_rethrow(error);
    console.error("[requests] read receipt unavailable", errorLogInfo(error));
    return actionFail("Could not mark this as read.");
  }
}
