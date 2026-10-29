"use server";

import { createSupportTicketWithOutcome, SupportQueryError } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { intentOptions, intentRule, parseAskForm, titleFromText } from "@/lib/requests/form";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { reportServerError } from "@/lib/server/error-report";
import { loadSetupServices } from "@/lib/server/first-look";
import { sendSupportTicketAlert } from "@/lib/server/support-alerts";
import { supportRateLimit } from "@/lib/server/support-limits";
import { canCreateSupportRequest } from "@/lib/server/support-rollout";
import { INITIAL_SUPPORT_STATE, supportFormError, type SupportFormState } from "@/lib/support-form-state";

async function failure(error: unknown): Promise<SupportFormState> {
  unstable_rethrow(error);
  console.error("[requests] could not send a request", errorLogInfo(error));
  if (error instanceof SupportQueryError) {
    return supportFormError(error.code === "conflict" ? "This request changed. Refresh the page and try again." : "Check your request and your screenshots, then try again.");
  }
  await reportServerError(error, { app: "platform", operation: "server_action", route: "/requests/new" });
  return supportFormError("Your request could not be saved. What you wrote is still here; try again.");
}

/**
 * Sends a new request. The business and the person come from the session, never from the form; the intents on offer are
 * the ones about a service the customer has bought, plus the questions and notes anyone may send. Only a change to a
 * service opens a change request (a quote and a state); a question, a note, a fault or a billing query is a plain
 * conversation. The ticket and its change details are made in one transaction (createSupportTicketWithOutcome), and the
 * team is told once, however often the form is sent.
 */
export async function askForChangeAction(_previous: SupportFormState, formData: FormData): Promise<SupportFormState> {
  const { user, tenant } = await requireCustomerAccess();
  if (!canCreateSupportRequest(user.id)) return supportFormError("New requests are temporarily unavailable. Please try again later.");
  const services = (await loadSetupServices(tenant)) ?? [];
  const parsed = parseAskForm(formData, intentOptions(services).map((option) => option.value));
  if (!parsed.success) return supportFormError(parsed.message, parsed.field);
  const limit = await supportRateLimit(user.id, false);
  if (limit !== null) return supportFormError(limit);
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
      void sendSupportTicketAlert(
        ticket,
        { category: rule.category, subject, description: body, ...(details === undefined ? {} : { details }), attachmentIds },
        { user, businessId: tenant.businessId, businessName: tenant.businessName },
      ).catch((error: unknown) => console.error("[support-alert]", error));
    }
    revalidatePath("/requests");
    revalidatePath("/");
    return { ...INITIAL_SUPPORT_STATE, status: "saved", ticketId: ticket.id, reference: ticket.displayRef, message: "Sent. We will reply here." };
  } catch (error) {
    return failure(error);
  }
}
