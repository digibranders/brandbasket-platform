import "server-only";
import { getChangeWithEvents, getSupportRequesterContext, getSupportTicketForStaff, listChangeViewsForTickets, type ChangeView, type Database, type StaffSupportTicketListItem } from "@brandbasket/db";
import { z } from "zod";
import { describeRequest, threadBanner, type RequestRow, type RequestType, type RowChange, type RowChip, type ThreadBanner } from "../requests-model";
import { STAFF_SUPPORT_CATEGORY_LABELS } from "../support-admin-state";
import type { SupportStatus } from "@brandbasket/shared/lib/support";

export function toRowChange(change: ChangeView): RowChange {
  return { state: change.state, coverage: change.coverage, accepted: change.acceptedAt !== null, paid: change.chargeStatus === "paid" };
}

/** The list's rows: each ticket with its queue, clock and chips, and the change details of those that have them. */
export async function loadRequestRows(db: Database, items: readonly StaffSupportTicketListItem[], now: Date): Promise<RequestRow[]> {
  const changes = new Map((await listChangeViewsForTickets(db, items.map((item) => item.id))).map((change) => [change.ticketId, change]));
  return items.map((item) => {
    const change = changes.get(item.id);
    const rowChange = change === undefined ? null : toRowChange(change);
    return {
      id: item.id,
      displayRef: item.displayRef,
      subject: item.subject,
      businessId: item.businessId,
      businessName: item.businessName,
      categoryLabel: STAFF_SUPPORT_CATEGORY_LABELS[item.category],
      status: item.status,
      change: rowChange,
      ...describeRequest({ status: item.status, lastCustomerMessageAt: item.lastCustomerMessageAt, lastStaffReplyAt: item.lastStaffReplyAt, lastActivityAt: item.lastActivityAt, change: rowChange }, now),
    };
  });
}

export interface ThreadMessage {
  readonly id: string;
  readonly who: string;
  readonly staff: boolean;
  readonly internal: boolean;
  readonly createdAtIso: string;
  readonly body: string;
  readonly tag: string | null;
  readonly details: readonly { readonly label: string; readonly value: string }[];
  readonly attachments: readonly { readonly id: string; readonly label: string }[];
}

/** Everything the panel and the page show about one request. Plain data. */
export interface RequestDetail {
  readonly id: string;
  readonly subject: string;
  readonly displayRef: string;
  readonly categoryLabel: string;
  readonly status: SupportStatus;
  readonly type: RequestType;
  readonly chips: readonly RowChip[];
  readonly businessId: string | null;
  readonly businessName: string | null;
  readonly requester: { readonly name: string; readonly contact: string | null } | null;
  readonly banner: ThreadBanner;
  /** Oldest first. */
  readonly messages: readonly ThreadMessage[];
}

const DETAIL_LABELS: Readonly<Record<string, string>> = {
  pageUrl: "Page address",
  stepsToReproduce: "Steps to reproduce",
  expectedBehavior: "Expected behavior",
  actualBehavior: "Actual behavior",
  browserDevice: "Browser or device",
  invoiceReference: "Invoice reference",
  requestedChange: "Requested change",
  accountEmail: "Account email",
};

function newest(dates: readonly Date[]): Date | null {
  return dates.reduce<Date | null>((found, date) => (found === null || date > found ? date : found), null);
}

/**
 * One request in full, with its thread oldest first. The banner is worked out from the thread as it stands, so it follows the
 * last message. Null when there is no such ticket. `change` is the change request's own record, for the moves the panel offers.
 */
export async function loadRequestDetail(db: Database, input: { readonly ticketId: string; readonly viewerId: string; readonly now: Date }): Promise<{ readonly detail: RequestDetail; readonly change: ChangeView | null } | null> {
  if (!z.uuid().safeParse(input.ticketId).success) return null;
  const [found, requester, changeFound] = await Promise.all([getSupportTicketForStaff(db, input.ticketId), getSupportRequesterContext(db, input.ticketId), getChangeWithEvents(db, input.ticketId)]);
  if (found === null) return null;
  const { ticket, messages, attachments } = found;
  const lastCustomerMessageAt = newest(messages.filter((message) => message.authorRole === "customer").map((message) => message.createdAt));
  const lastStaffReplyAt = newest(messages.filter((message) => message.authorRole === "staff" && message.visibility === "public").map((message) => message.createdAt));
  const change = changeFound?.change ?? null;
  const rowChange = change === null ? null : toRowChange(change);
  const described = describeRequest({ status: ticket.status, lastCustomerMessageAt, lastStaffReplyAt, lastActivityAt: ticket.lastActivityAt, change: rowChange }, input.now);
  const banner = threadBanner({ status: ticket.status, lastCustomerMessageAt, lastStaffReplyAt }, input.now);
  const lastCustomer = [...messages].reverse().find((message) => message.authorRole === "customer");
  const thread: ThreadMessage[] = messages.map((message, index) => ({
    id: message.id,
    who: message.authorRole === "staff" ? (message.authorUserId === input.viewerId ? "You" : "Staff") : (requester?.name ?? "Requester"),
    staff: message.authorRole === "staff",
    internal: message.visibility === "internal",
    createdAtIso: message.createdAt.toISOString(),
    body: message.body,
    tag: message.id === lastCustomer?.id && described.queue === "needs_reply" ? "Latest, not answered" : index === 0 ? "Opening message" : null,
    details: message.details === null ? [] : Object.entries(message.details).filter(([key, value]) => Object.hasOwn(DETAIL_LABELS, key) && value !== "").map(([key, value]) => ({ label: DETAIL_LABELS[key] ?? key, value: String(value) })),
    attachments: attachments.filter((attachment) => attachment.messageId === message.id).map((attachment, at) => ({ id: attachment.id, label: `Open screenshot ${at + 1}: ${attachment.filename}` })),
  }));
  return {
    detail: {
      id: ticket.id,
      subject: ticket.subject,
      displayRef: ticket.displayRef,
      categoryLabel: STAFF_SUPPORT_CATEGORY_LABELS[ticket.category],
      status: ticket.status,
      type: described.type,
      chips: described.chips,
      businessId: ticket.businessId,
      businessName: requester?.businessName ?? null,
      requester: requester === null ? null : { name: requester.name, contact: requester.contact },
      banner,
      messages: thread,
    },
    change,
  };
}
