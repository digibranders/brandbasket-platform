"use server";

import {
  approveProjectPreview,
  consumeRateLimit,
  createSupportTicketWithOutcome,
  findLatestProject,
  linkFeedbackTicket,
  ProjectNotAwaitingResponseError,
  requestProjectRevisions,
  RevisionRoundsUsedUpError,
  SupportQueryError,
  withCustomerRole,
  withTenantScope,
} from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionFail, type ActionResult } from "@/lib/action-result";
import { getAppDb, getStaffDb } from "@/lib/db";
import { requireWebsite } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { notifyTeamPreviewResponse, sendFeedbackTicketAlert, sendPreviewChangesReceived } from "./alerts";
import { feedbackSubject, parsePreviewFeedback, supportSubmissionsEnabled } from "./rules/feedback";
import { VIEWER_MESSAGE, websiteNoticeHref } from "./rules/notices";
import { WEBSITE_PATH } from "./rules/paths";
import { ROUNDS_USED_UP, roundsUsedUp } from "./rules/progress";

/*
 * Answering a preview, ported from apps/platform app/app-host/(protected)/website/actions.ts. The business and the person
 * come only from the session; nothing in a form names them.
 *
 * Staff connection (getStaffDb): the database reserves every project move but onboarding to submitted for bb_staff
 * (projects_guard_customer_transition), and the rate-limit table is staff-only. requireWebsite({ write: true }) is what
 * proves the request is the business's own, and the business id it returns is the only one written.
 */

const UNAVAILABLE_MESSAGE = "New requests are temporarily unavailable. Please try again later.";
const CHECK_MESSAGE = "Check what you wrote and your screenshots, then try again.";
const FAILED_MESSAGE = "Your changes could not be sent. What you wrote is still here; try again.";

/** Approves the waiting preview. Only a project in `preview` moves; anything else says there is no preview waiting. */
export async function approvePreviewAction(): Promise<ActionResult> {
  const context = await requireWebsite({ write: true });
  if (context.role === "viewer") return actionFail(VIEWER_MESSAGE);
  try {
    await approveProjectPreview(getStaffDb(), { businessId: context.businessId, now: new Date() });
  } catch (error) {
    if (error instanceof ProjectNotAwaitingResponseError) redirect(websiteNoticeHref("not-ready"));
    throw error;
  }
  await notifyTeamPreviewResponse("approve", { id: context.businessId, name: context.businessName });
  revalidatePath(WEBSITE_PATH);
  redirect(websiteNoticeHref("approved"));
}

/** How often one person may send support requests: 5 in 10 minutes and 20 a day, shared with Requests. */
async function supportRateLimit(userId: string): Promise<string | null> {
  for (const rule of [
    { key: "create-short", limit: 5, windowSeconds: 600 },
    { key: "create-day", limit: 20, windowSeconds: 86_400 },
  ]) {
    const result = await consumeRateLimit(getStaffDb(), `support:${rule.key}:${userId}`, rule);
    if (!result.allowed) return `Please wait ${result.retryAfterSeconds} seconds before sending another request.`;
  }
  return null;
}

type SendOutcome =
  | { readonly kind: "sent" }
  | { readonly kind: "not-ready" }
  | { readonly kind: "refused"; readonly message: string };

/**
 * Sends the customer's feedback on the preview. It is project work, not a maintenance change: a plain `website_change` ticket,
 * never a change request, so it does not count against the month's included edits.
 *
 * The round is counted, the ticket saved and the two linked in ONE transaction on the staff connection, the ticket written as
 * the customer (withCustomerRole). The round's UPDATE comes first and locks the project row, so of two racing sends the loser
 * finds no preview waiting (or no round left) and rolls back with no ticket. The old app saved the ticket first, so the loser
 * left a ticket with its alert sent (PARITY website 15). Alerts and emails go only after the commit, and only for a ticket
 * created now; the submission key makes a double press one ticket.
 */
export async function sendPreviewFeedbackAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const context = await requireWebsite({ write: true });
  const { user, businessId, businessName } = context;
  if (context.role === "viewer") return actionFail(VIEWER_MESSAGE);
  if (!supportSubmissionsEnabled(process.env.BRANDBASKET_SUPPORT_MODE, process.env.BRANDBASKET_SUPPORT_INTERNAL_ACCOUNT_IDS, user.id)) return actionFail(UNAVAILABLE_MESSAGE);
  const parsed = parsePreviewFeedback(formData);
  if (!parsed.success) return actionFail(parsed.message, { [parsed.field]: parsed.message });
  const limited = await supportRateLimit(user.id);
  if (limited !== null) return actionFail(limited);
  const { body, attachmentIds, submissionKey } = parsed.data;

  const project = await withTenantScope(getAppDb(), context.tenant, findLatestProject);
  if (project === null || project.status !== "preview") redirect(websiteNoticeHref("not-ready"));
  // Checked before anything is written; the UPDATE in the transaction checks again, so two sends cannot both take the last round.
  if (roundsUsedUp(project.revisionRoundsIncluded, project.revisionRoundsGranted)) return actionFail(ROUNDS_USED_UP);

  const now = new Date();
  const outcome = await (async (): Promise<SendOutcome> => {
    try {
      const saved = await getStaffDb().transaction(async (tx) => {
        const moved = await requestProjectRevisions(tx, { businessId, now });
        const round = moved.revisionRoundsGranted;
        const subject = feedbackSubject(body, round);
        const { ticket, created } = await withCustomerRole(tx, { userId: user.id, businessId }, (customerTx) =>
          createSupportTicketWithOutcome(customerTx, { userId: user.id, businessId, category: "website_change", subject, description: body, attachmentIds, submissionKey }),
        );
        await linkFeedbackTicket(tx, { ticketId: ticket.id, projectId: moved.id, businessId, round });
        return { ticket, created, round, rounds: moved.revisionRoundsIncluded, subject };
      });
      if (saved.created) {
        await Promise.all([
          sendFeedbackTicketAlert({ ticket: saved.ticket, subject: saved.subject, description: body, attachmentCount: attachmentIds.length, user, business: { id: businessId, name: businessName } }),
          sendPreviewChangesReceived({ user, body, round: saved.round, rounds: saved.rounds, now }),
        ]);
      }
      await notifyTeamPreviewResponse("revisions", { id: businessId, name: businessName });
      return { kind: "sent" };
    } catch (error) {
      if (error instanceof ProjectNotAwaitingResponseError) return { kind: "not-ready" };
      if (error instanceof RevisionRoundsUsedUpError) return { kind: "refused", message: ROUNDS_USED_UP };
      if (error instanceof SupportQueryError) return { kind: "refused", message: CHECK_MESSAGE };
      reportError(error, { area: "website.feedback" });
      return { kind: "refused", message: FAILED_MESSAGE };
    }
  })();

  if (outcome.kind === "refused") return actionFail(outcome.message);
  if (outcome.kind === "not-ready") redirect(websiteNoticeHref("not-ready"));
  // The page redraws in Revisions, which takes the form away, so the thank-you is the notice on the page.
  revalidatePath("/requests");
  revalidatePath("/");
  revalidatePath(WEBSITE_PATH);
  redirect(websiteNoticeHref("changes-sent"));
}
