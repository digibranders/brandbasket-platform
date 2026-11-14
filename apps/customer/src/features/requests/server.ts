import "server-only";
import { acceptChangeQuote, ChangeRequestError, consumeRateLimit, getSupportTicket, isPhoneAccountEmail, type Database } from "@brandbasket/db";
import { createAppEmailTransport, emailTeamInboxDefault, requestAcknowledgementEmail, supportReplyAlertEmail, supportTicketAlertEmail, type EmailTransport } from "@brandbasket/email";
import { emailPreferenceAllows } from "@brandbasket/shared/server/email-preference";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { SUPPORT_CATEGORY_LABELS, SUPPORT_STATUS_LABELS, type SupportCategory } from "@brandbasket/shared/lib/support";
import { customerEmailTransport } from "@/features/server-common/email";
import { getStaffDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import type { CustomerContext } from "@/lib/guards";
import { requestPath } from "./rules";

/*
 * The writes Requests makes on the staff connection, and the staff alerts. Ported from apps/platform lib/server/
 * {support-limits,change-quote,support-alerts}.ts. Each use of getStaffDb below is one of the exceptions plan 61 allows,
 * and the justification sits beside it.
 */

/**
 * How often one person may send requests and replies. Returns the sentence to show when they have sent too many, or null.
 * Staff connection: the rate-limit table is not the customer role's. The key holds only the session's user id.
 */
export async function supportRateLimit(userId: string, reply: boolean): Promise<string | null> {
  const rules = reply
    ? [{ key: "reply", limit: 30, windowSeconds: 3600 }]
    : [
        { key: "create-short", limit: 5, windowSeconds: 600 },
        { key: "create-day", limit: 20, windowSeconds: 86400 },
      ];
  for (const rule of rules) {
    const result = await consumeRateLimit(getStaffDb(), `support:${rule.key}:${userId}`, rule);
    if (!result.allowed) return `Please wait ${result.retryAfterSeconds} seconds before sending another request.`;
  }
  return null;
}

/**
 * The customer's yes to a quote: opens the charge for it (or finds the one a double press already opened) and returns its id.
 * Customers never write charges through their own connection, so this runs on the staff connection after the guard has
 * proved who is asking: the person and the business come only from the session, the price only from the stored quote, and
 * the GST rate from the customer's own plan. The work starts when the charge is paid.
 */
export async function openQuoteCharge(customer: Pick<CustomerContext, "tenant" | "billing">, requestId: string, now: Date): Promise<{ readonly chargeId: string }> {
  const { plan } = customer.billing;
  if (plan === null) throw new ChangeRequestError("forbidden", "There is no plan to price this quote from.");
  const { chargeId } = await acceptChangeQuote(getStaffDb(), {
    requestId,
    userId: customer.tenant.userId,
    businessId: customer.tenant.businessId,
    taxRateBasisPoints: plan.taxRateBasisPoints,
    now,
  });
  return { chargeId };
}

function alertRecipient(): string {
  return process.env.SUPPORT_ALERT_EMAIL?.trim() || process.env.BRANDBASKET_TEAM_EMAIL?.trim() || emailTeamInboxDefault();
}

/** The staff link to a ticket, or undefined (the alert then has no link) when ADMIN_ORIGIN is not set. */
function adminUrl(ticketId: string): string | undefined {
  const origin = process.env.ADMIN_ORIGIN?.trim();
  return origin === undefined || origin === "" ? undefined : new URL(`/support/${ticketId}`, origin).toString();
}

/**
 * Alerts are written by the staff connection: the customer connection has no insert on the email outbox. The outbox copy of
 * a support alert holds only a reference, category, status and link, never the request text.
 */
function alertTransport(): EmailTransport {
  return createAppEmailTransport(getStaffDb());
}

interface Requester {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone?: string | null;
}

/** Tells the team about a new request. Best effort: the caller catches and logs, and never fails the customer's action. */
export async function sendTicketAlert(
  ticket: { readonly id: string; readonly displayRef: string },
  input: { readonly category: SupportCategory; readonly subject: string; readonly description: string; readonly details?: Readonly<Record<string, string>>; readonly attachmentIds: readonly string[] },
  access: { readonly user: Requester; readonly businessId: string; readonly businessName: string },
): Promise<void> {
  await alertTransport().send(
    supportTicketAlertEmail({
      to: alertRecipient(),
      reference: ticket.displayRef,
      ticketId: ticket.id,
      category: input.category,
      categoryLabel: SUPPORT_CATEGORY_LABELS[input.category],
      subject: input.subject,
      description: input.description,
      requesterEmail: access.user.email,
      requesterName: access.user.name,
      requesterPhone: access.user.phone,
      businessId: access.businessId,
      businessName: access.businessName,
      statusLabel: SUPPORT_STATUS_LABELS.new,
      details: input.details,
      attachmentCount: input.attachmentIds.length,
      adminUrl: adminUrl(ticket.id),
    }),
  );
}

/** Tells the team about a customer's reply. Best effort, like sendTicketAlert. */
export async function sendReplyAlert(
  readDb: Database,
  ticketId: string,
  reply: { readonly body: string; readonly attachmentIds: readonly string[] },
  user: Requester,
): Promise<void> {
  const detail = await getSupportTicket(readDb, user.id, ticketId);
  if (detail === null) return;
  await alertTransport().send(
    supportReplyAlertEmail({
      to: alertRecipient(),
      reference: detail.ticket.displayRef,
      ticketId,
      subject: detail.ticket.subject,
      body: reply.body,
      authorName: user.name,
      authorEmail: user.email,
      attachmentCount: reply.attachmentIds.length,
      categoryLabel: SUPPORT_CATEGORY_LABELS[detail.ticket.category],
      statusLabel: SUPPORT_STATUS_LABELS[detail.ticket.status],
      adminUrl: adminUrl(ticketId),
    }),
  );
}

/**
 * Acknowledges a customer's new request by email. Sent once when the ticket is created.
 * Best effort: the caller catches and logs, and never fails the customer's action.
 */
export async function sendRequestAcknowledgement(
  db: Database,
  ticket: { readonly id: string },
  request: { readonly subject: string },
  customer: { readonly user: Requester; readonly businessId: string; readonly businessName: string },
): Promise<void> {
  const { user, businessId, businessName } = customer;
  if (isPhoneAccountEmail(user.email)) return;

  const allowed = await emailPreferenceAllows(
    db,
    user.id,
    businessId,
    "request_reply",
    (error) => console.error("[requests] could not read email preference, sending anyway", errorLogInfo(error)),
  );
  if (!allowed) return;

  try {
    const origin = serverEnv().APP_ORIGIN;
    const requestUrl = new URL(requestPath(ticket.id), origin).toString();
    await customerEmailTransport(db).send(
      requestAcknowledgementEmail({
        to: user.email,
        name: user.name,
        title: request.subject,
        requestUrl,
        businessName,
      }),
    );
  } catch (error) {
    console.error("[requests] could not email customer acknowledgement", errorLogInfo(error));
  }
}
