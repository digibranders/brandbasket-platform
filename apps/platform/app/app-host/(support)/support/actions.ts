"use server";

import { appendSupportReplyWithOutcome, createSupportTicketWithOutcome, getSupportTicket, getSupportUnreadCount, listSupportTickets, markSupportTicketRead, SupportQueryError } from "@brandbasket/db";
import { z } from "zod";
import type { SupportCategory, SupportStatus } from "@brandbasket/shared/lib/support";
import { parseSupportTicketForm, supportReplySchema } from "@brandbasket/shared/lib/support-form";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { INITIAL_SUPPORT_STATE, supportFormError, type SupportFormState } from "@/lib/support-form-state";
import { getAppDb } from "@/lib/server/db";
import { getSupportAccess } from "@/lib/server/support-access";
import { requestBrand } from "@/lib/server/request-brand";
import { reportServerError } from "@/lib/server/error-report";
import { supportRateLimit } from "@/lib/server/support-limits";
import { canCreateSupportRequest } from "@/lib/server/support-rollout";
import { sendSupportReplyAlert, sendSupportTicketAlert } from "@/lib/server/support-alerts";

async function failure(error: unknown): Promise<SupportFormState> {
  unstable_rethrow(error);
  console.error("[support] request failed", errorLogInfo(error));
  if (error instanceof SupportQueryError) return supportFormError(error.code === "closed" ? "This request is closed. Open a new request to continue." : error.code === "conflict" ? "This request changed. Refresh it and try again." : "Check this request and its screenshots, then try again.");
  await reportServerError(error, { app: "platform", operation: "server_action", route: "/support" });
  return supportFormError("Your request could not be saved. Your draft is still here; try again.");
}

export async function createSupportRequest(_previous: SupportFormState, form: FormData): Promise<SupportFormState> {
  const parsed = parseSupportTicketForm(form);
  if (!parsed.success) return supportFormError(parsed.message, parsed.field ?? null);
  try {
    const access = await getSupportAccess();
    if (access === null) return supportFormError("Your session has ended. Sign in again to send your request.");
    if (!canCreateSupportRequest(access.user.id)) return supportFormError("New requests are temporarily unavailable. Existing conversations are still available in My requests.");
    const limit = await supportRateLimit(access.user.id, false);
    if (limit !== null) return supportFormError(limit);
    const { ticket, created } = await createSupportTicketWithOutcome(getAppDb(), { ...parsed.data, userId: access.user.id, businessId: access.businessId });
    // A retried submission returns the saved ticket; staff were already told the first time.
    if (created) void sendSupportTicketAlert(ticket, parsed.data, access).catch((err) => console.error("[support-alert]", err));
    revalidatePath("/support");
    revalidatePath("/requests");
    return { ...INITIAL_SUPPORT_STATE, status: "saved", ticketId: ticket.id, reference: ticket.displayRef, message: "Your request has been received." };
  } catch (error) { return failure(error); }
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

export interface MySupportRequestItem {
  readonly id: string;
  readonly reference: string;
  readonly subject: string;
  readonly category: SupportCategory;
  readonly status: SupportStatus;
  readonly unread: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export async function readMySupportRequests(cursor?: string): Promise<{
  readonly items: readonly MySupportRequestItem[];
  readonly nextCursor: string | null;
} | null> {
  const access = await getSupportAccess();
  if (access === null) return null;
  const page = await listSupportTickets(getAppDb(), access.user.id, { cursor, limit: 25 });
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((ticket) => ({
      id: ticket.id,
      reference: ticket.displayRef,
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      unread: ticket.unread,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    })),
  };
}

export interface MySupportTicketDetail {
  readonly ticket: {
    readonly id: string;
    readonly reference: string;
    readonly subject: string;
    readonly category: SupportCategory;
    readonly status: SupportStatus;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly messages: readonly {
    readonly id: string;
    readonly body: string;
    readonly authorRole: "customer" | "staff" | "system";
    readonly author: string;
    readonly at: string;
    readonly details: readonly { readonly label: string; readonly value: string }[];
    readonly attachments: readonly { readonly id: string; readonly filename: string }[];
  }[];
}

export async function readMySupportTicketDetail(ticketId: string): Promise<MySupportTicketDetail | null> {
  if (!z.uuid().safeParse(ticketId).success) return null;
  try {
    const access = await getSupportAccess();
    if (access === null) return null;
    const detail = await getSupportTicket(getAppDb(), access.user.id, ticketId);
    if (detail === null) return null;
    const brand = await requestBrand();

    const lastStaff = detail.messages
      .filter((m) => m.authorRole === "staff" && m.visibility === "public")
      .at(-1);
    if (lastStaff) {
      void markSupportTicketRead(getAppDb(), access.user.id, ticketId, lastStaff.id).catch(() => {});
    }

    return {
      ticket: {
        id: detail.ticket.id,
        reference: detail.ticket.displayRef,
        subject: detail.ticket.subject,
        category: detail.ticket.category,
        status: detail.ticket.status,
        createdAt: detail.ticket.createdAt.toISOString(),
        updatedAt: detail.ticket.updatedAt.toISOString(),
      },
      messages: detail.messages
        .filter((m) => m.visibility === "public")
        .map((m) => ({
          id: m.id,
          body: m.body,
          authorRole: m.authorRole,
          author: m.authorRole === "staff" ? `${brand.shortName} Support` : "You",
          at: m.createdAt.toISOString(),
          details: Object.entries(m.details ?? {}).map(([label, value]) => ({ label, value })),
          attachments: detail.attachments
            .filter((att) => att.messageId === m.id)
            .map((att) => ({ id: att.id, filename: att.filename })),
        })),
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("[support] ticket detail unavailable", errorLogInfo(error));
    return null;
  }
}

export async function readSupportUnreadCount(): Promise<number> {
  try {
    const access = await getSupportAccess();
    return access === null ? 0 : await getSupportUnreadCount(getAppDb(), access.user.id);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[support] unread count unavailable", errorLogInfo(error));
    return 0;
  }
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
