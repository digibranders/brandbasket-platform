import "server-only";
import {
  countIncludedEdits,
  findDeliverableForBusiness,
  getChangeWithEvents,
  getSupportTicket,
  listRequestItems,
  withTenantScope,
  type ChangeEventView,
  type ChangeView,
  type SupportAttachment,
  type SupportMessage,
  type SupportTicket,
} from "@brandbasket/db";
import { includedEditsAllowed, monthBoundsIst } from "@brandbasket/shared/lib/change-requests";
import { getAppDb } from "@/lib/db";
import type { CustomerContext } from "@/lib/guards";
import { load, type Loaded } from "@/lib/loaded";
import { aboutLine, includedHeaderLine, requestRows, type RequestRow } from "./rules";

/** The list's rows: every conversation of the person for this business, Waiting for you first. */
export function loadRequestRows(customer: CustomerContext): Promise<Loaded<readonly RequestRow[]>> {
  const { tenant, user, businessId } = customer;
  return load("requests.list", async () => requestRows(await withTenantScope(getAppDb(), tenant, (tx) => listRequestItems(tx, user.id, businessId))));
}

/** "Small edits included this month: 1 of 2 used.", or null when the plan has none. Its own read: a failure leaves the sentence out and is reported. */
export function loadIncludedLine(customer: CustomerContext): Promise<Loaded<string | null>> {
  const { tenant, businessId, billing } = customer;
  return load("requests.included", async () => {
    const allowed = includedEditsAllowed(billing.hasWebsite);
    if (allowed === 0) return null;
    const used = await withTenantScope(getAppDb(), tenant, (tx) => countIncludedEdits(tx, businessId, monthBoundsIst(new Date())));
    return includedHeaderLine(used, allowed);
  });
}

/** What the box starts with when the dialog is opened from a post. Another business's post, or none, reads as nothing. */
export function loadAboutLine(customer: CustomerContext, postId: string): Promise<Loaded<string | null>> {
  const { tenant, businessId } = customer;
  return load("requests.about", async () => {
    const post = await withTenantScope(getAppDb(), tenant, (tx) => findDeliverableForBusiness(tx, businessId, postId));
    return post === null || post.kind !== "post" || post.dueOn === null ? null : aboutLine(post.title, post.dueOn);
  });
}

/** The conversation: its ticket, public messages and attached screenshots. Null when the person has no such conversation here. */
export interface ThreadData {
  readonly ticket: SupportTicket;
  readonly messages: readonly SupportMessage[];
  readonly attachments: readonly SupportAttachment[];
}

export function loadThread(customer: CustomerContext, ticketId: string): Promise<Loaded<ThreadData | null>> {
  return load("requests.thread", () => getSupportTicket(getAppDb(), customer.user.id, ticketId, customer.businessId));
}

/** The change details with the dates it moved on, for the stepper and NextStep. Null for a plain conversation. */
export interface ChangeData {
  readonly change: ChangeView;
  readonly events: readonly ChangeEventView[];
}

export function loadChange(customer: CustomerContext, ticketId: string): Promise<Loaded<ChangeData | null>> {
  return load("requests.change", () => withTenantScope(getAppDb(), customer.tenant, (tx) => getChangeWithEvents(tx, ticketId)));
}
