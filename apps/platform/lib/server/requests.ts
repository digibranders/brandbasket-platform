import "server-only";
import { cache } from "react";
import {
  countIncludedEdits,
  findTicketIdOfChangeCharge,
  findTicketIdOfChangeRequest,
  getChangeWithEvents,
  getSupportTicket,
  listRequestItems,
  listRequestNeeds,
  listUnreadReplies,
  listWaitingOnYou,
  withTenantScope,
  type ChangeEventView,
  type ChangeView,
  type RequestListItem,
  type RequestNeed,
  type SupportAttachment,
  type SupportMessage,
  type SupportTicket,
  type UnreadReply,
  type WaitingOnYou,
} from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { includedEditsAllowed, monthBoundsIst } from "@brandbasket/shared/lib/change-requests";
import { getAppDb } from "./db";
import { quietly } from "./quietly";

export interface RequestsData {
  /** The person's conversations for this business, newest activity first. */
  readonly items: readonly RequestListItem[];
  /** The business's included edits used in the month, and how many its plan has. Allowed 0 means the line is not shown. */
  readonly includedUsed: number;
  readonly includedAllowed: number;
}

/**
 * Everything the Requests list draws, read once per request. Throws when the list cannot be read: the page says so rather
 * than showing an empty list that looks like having no requests. The tenant object is the key (requireCustomerAccess hands
 * every caller the same one).
 */
export const loadRequests = cache(async (tenant: TenantContext, hasWebsite: boolean): Promise<RequestsData> => {
  const now = new Date();
  const allowed = includedEditsAllowed(hasWebsite);
  const [items, used] = await withTenantScope(getAppDb(), tenant, (tx) =>
    Promise.all([listRequestItems(tx, tenant.userId, tenant.businessId), allowed === 0 ? Promise.resolve(0) : countIncludedEdits(tx, tenant.businessId, monthBoundsIst(now))]),
  );
  return { items, includedUsed: used, includedAllowed: allowed };
});

/**
 * The quotes to answer and the changes to check. The rail's count, the bell and Overview all use it, so a failed read
 * shows none of them (and logs once) rather than taking those pages down.
 */
export const loadRequestNeeds = cache(
  async (tenant: TenantContext): Promise<readonly RequestNeed[]> =>
    quietly("requests", "the requests waiting on you", [] as readonly RequestNeed[], () => withTenantScope(getAppDb(), tenant, (tx) => listRequestNeeds(tx, tenant.userId, tenant.businessId))),
);

/** Conversations where the team has asked the person something and is waiting on the answer. A failed read shows none. */
export const loadWaitingOnYou = cache(
  async (tenant: TenantContext): Promise<readonly WaitingOnYou[]> =>
    quietly("requests", "the conversations waiting on you", [] as readonly WaitingOnYou[], () => withTenantScope(getAppDb(), tenant, (tx) => listWaitingOnYou(tx, tenant.userId, tenant.businessId))),
);

/** What waits on the customer across Requests: quotes to answer, changes to check, and questions from the team. One conversation counts once. */
export const loadRequestsBadge = cache(async (tenant: TenantContext): Promise<number> => {
  const [needs, waiting] = await Promise.all([loadRequestNeeds(tenant), loadWaitingOnYou(tenant)]);
  const counted = new Set(needs.map((need) => need.ticketId));
  return needs.length + waiting.filter((item) => !counted.has(item.ticketId)).length;
});

/** Replies from the team the person has not read, for the bell. A failed read shows none. */
export const loadUnreadReplies = cache(
  async (tenant: TenantContext): Promise<readonly UnreadReply[]> =>
    quietly("requests", "the unread replies", [] as readonly UnreadReply[], () => withTenantScope(getAppDb(), tenant, (tx) => listUnreadReplies(tx, tenant.userId, tenant.businessId))),
);

/** One conversation: its messages and screenshots, and the change details with their dates when it is a request for a change. */
export interface RequestDetail {
  readonly ticket: SupportTicket;
  readonly messages: readonly SupportMessage[];
  readonly attachments: readonly SupportAttachment[];
  readonly change: ChangeView | null;
  readonly events: readonly ChangeEventView[];
}

/** Null when the person has no such conversation here (someone else's, another business's, or an id that is not one). */
export async function loadRequestDetail(tenant: TenantContext, ticketId: string): Promise<RequestDetail | null> {
  const [thread, change] = await Promise.all([
    getSupportTicket(getAppDb(), tenant.userId, ticketId, tenant.businessId),
    withTenantScope(getAppDb(), tenant, (tx) => getChangeWithEvents(tx, ticketId)),
  ]);
  if (thread === null) return null;
  return { ticket: thread.ticket, messages: thread.messages, attachments: thread.attachments, change: change?.change ?? null, events: change?.events ?? [] };
}

/**
 * The ticket a change request really belongs to, read for the signed-in business. A form names both ids, but only the request
 * is acted on, so the ticket it sends the customer back to comes from here, never from the form. Null when the business has
 * no such request.
 */
export async function loadTicketIdOfRequest(tenant: TenantContext, requestId: string): Promise<string | null> {
  return withTenantScope(getAppDb(), tenant, (tx) => findTicketIdOfChangeRequest(tx, tenant.businessId, requestId));
}

/** The ticket of the request a `change_hours` charge was opened for, so a payment returns to that request. Undefined when there is none. */
export async function loadTicketIdOfChangeCharge(tenant: TenantContext, chargeId: string): Promise<string | undefined> {
  return (await withTenantScope(getAppDb(), tenant, (tx) => findTicketIdOfChangeCharge(tx, tenant.businessId, chargeId))) ?? undefined;
}
