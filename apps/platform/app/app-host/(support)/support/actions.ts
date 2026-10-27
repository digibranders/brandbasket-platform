"use server";

import { appendSupportReplyWithOutcome, markSupportTicketRead, SupportQueryError } from "@brandbasket/db";
import { z } from "zod";
import { supportReplySchema } from "@brandbasket/shared/lib/support-form";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { INITIAL_SUPPORT_STATE, supportFormError, type SupportFormState } from "@/lib/support-form-state";
import { getAppDb } from "@/lib/server/db";
import { getSupportAccess } from "@/lib/server/support-access";
import { reportServerError } from "@/lib/server/error-report";
import { supportRateLimit } from "@/lib/server/support-limits";
import { sendSupportReplyAlert } from "@/lib/server/support-alerts";

async function failure(error: unknown): Promise<SupportFormState> {
  unstable_rethrow(error);
  console.error("[support] request failed", errorLogInfo(error));
  if (error instanceof SupportQueryError) return supportFormError(error.code === "closed" ? "This request is closed. Open a new request to continue." : error.code === "conflict" ? "This request changed. Refresh it and try again." : "Check this request and its screenshots, then try again.");
  await reportServerError(error, { app: "platform", operation: "server_action", route: "/support" });
  return supportFormError("Your request could not be saved. Your draft is still here; try again.");
}

export async function replyToSupportRequest(_previous: SupportFormState, form: FormData): Promise<SupportFormState> {
  const parsed = supportReplySchema.safeParse({ body: form.get("body"), submissionKey: form.get("submissionKey"), attachmentIds: form.getAll("attachmentIds") });
  if (!parsed.success) return supportFormError(parsed.error.issues[0]?.message ?? "Check your reply.", "body");
  const ticketId = form.get("ticketId");
  if (!z.uuid().safeParse(ticketId).success || typeof ticketId !== "string") return supportFormError("This request could not be found.");
  try {
    const access = await getSupportAccess();
    if (access === null) return supportFormError("Your session has ended. Sign in again to send your reply.");
    const limit = await supportRateLimit(access.user.id, true);
    if (limit !== null) return supportFormError(limit);
    const { created } = await appendSupportReplyWithOutcome(getAppDb(), { ...parsed.data, userId: access.user.id, ticketId });
    if (created) void sendSupportReplyAlert(getAppDb(), ticketId, parsed.data, access).catch((err) => console.error("[support-alert]", err));
    revalidatePath(`/support/${ticketId}`); revalidatePath("/support"); revalidatePath("/requests");
    return { ...INITIAL_SUPPORT_STATE, status: "saved", message: "Reply sent.", ticketId };
  } catch (error) { return failure(error); }
}

export async function acknowledgeSupportReplies(ticketId: string, messageId: string): Promise<boolean> {
  if (!z.uuid().safeParse(ticketId).success || !z.uuid().safeParse(messageId).success) return false;
  try {
    const access = await getSupportAccess();
    if (access === null) return false;
    await markSupportTicketRead(getAppDb(), access.user.id, ticketId, messageId);
    revalidatePath("/support");
    // Reading a reply clears its line in the bell, which is drawn by the dashboard's layout.
    revalidatePath("/requests");
    return true;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[support] read receipt unavailable", errorLogInfo(error));
    return false;
  }
}
