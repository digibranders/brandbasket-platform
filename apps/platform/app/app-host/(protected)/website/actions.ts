"use server";

import { createSupportTicketWithOutcome, findLatestProject, ProjectNotAwaitingResponseError, SupportQueryError, withTenantScope } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb, getStaffDb } from "@/lib/server/db";
import { reportServerError } from "@/lib/server/error-report";
import { respondToPreview, type PreviewResponse } from "@/lib/server/project-response";
import { sendSupportTicketAlert } from "@/lib/server/support-alerts";
import { supportRateLimit } from "@/lib/server/support-limits";
import { canCreateSupportRequest } from "@/lib/server/support-rollout";
import { supportFormError, type SupportFormState } from "@/lib/support-form-state";
import { feedbackSubject, parsePreviewFeedback } from "@/lib/website/feedback";
import { websiteNoticeHref } from "@/lib/website/notices";

/**
 * Answering a preview. Both run as the platform's staff-privileged connection: the database reserves every project move
 * but onboarding to submitted for staff (see approveProjectPreview), so requireCustomerAccess is what proves this request
 * is the business's own. The business comes only from the session; nothing in the form is read.
 */
async function respond(response: PreviewResponse): Promise<void> {
  const { tenant } = await requireCustomerAccess();
  try {
    await respondToPreview(getStaffDb(), { businessId: tenant.businessId, businessName: tenant.businessName, response }, new Date());
  } catch (error) {
    if (error instanceof ProjectNotAwaitingResponseError) redirect(websiteNoticeHref("not-ready"));
    throw error;
  }
}

export async function approvePreviewAction(): Promise<void> {
  await respond({ kind: "approve" });
  redirect(websiteNoticeHref("approved"));
}

/**
 * Sends the customer's feedback on a preview. It is project work, not a maintenance change, so it opens a plain ticket for
 * the team (its subject says it is preview feedback and which round) and never a change request: it does not count against the month's included
 * edits. The ticket is saved first, and a retry with the same form key finds it again, so a failure after it only repeats
 * the move to Revisions. The business and the person come from the session, never from the form.
 */
export async function sendPreviewFeedbackAction(_previous: SupportFormState, formData: FormData): Promise<SupportFormState> {
  const { user, tenant } = await requireCustomerAccess();
  if (!canCreateSupportRequest(user.id)) return supportFormError("New requests are temporarily unavailable. Please try again later.");
  const parsed = parsePreviewFeedback(formData);
  if (!parsed.success) return supportFormError(parsed.message, parsed.field);
  const limit = await supportRateLimit(user.id, false);
  if (limit !== null) return supportFormError(limit);
  const { body, attachmentIds, submissionKey } = parsed.data;
  const project = await withTenantScope(getAppDb(), tenant, (tx) => findLatestProject(tx));
  if (project === null || project.status !== "preview") redirect(websiteNoticeHref("not-ready"));

  const subject = feedbackSubject(body, project.revisionRoundsGranted + 1);
  try {
    const { ticket, created } = await createSupportTicketWithOutcome(getAppDb(), {
      userId: user.id,
      businessId: tenant.businessId,
      category: "website_change",
      subject,
      description: body,
      attachmentIds,
      submissionKey,
    });
    if (created) {
      void sendSupportTicketAlert(
        ticket,
        { category: "website_change", subject, description: body, attachmentIds },
        { user, businessId: tenant.businessId, businessName: tenant.businessName },
      ).catch((error: unknown) => console.error("[support-alert]", error));
    }
    await respond({ kind: "revisions" });
  } catch (error) {
    unstable_rethrow(error);
    console.error("[website] could not send preview feedback", errorLogInfo(error));
    if (error instanceof SupportQueryError) return supportFormError("Check what you wrote and your screenshots, then try again.");
    await reportServerError(error, { app: "platform", operation: "server_action", route: "/website" });
    return supportFormError("Your changes could not be sent. What you wrote is still here; try again.");
  }
  // The page redraws as Revisions once the project has moved, which takes this form away, so the thank-you is sent from here.
  revalidatePath("/requests");
  revalidatePath("/");
  redirect(websiteNoticeHref("changes-sent"));
}
