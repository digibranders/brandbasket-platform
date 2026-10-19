import "server-only";
import { createAppEmailTransport, emailTeamInboxDefault, supportReplyAlertEmail, supportTicketAlertEmail, systemErrorAlertEmail, type EmailTransport } from "@brandbasket/email";
import { SUPPORT_CATEGORY_LABELS, SUPPORT_STATUS_LABELS, type SupportCategory } from "@brandbasket/shared/lib/support";
import type { Database } from "@brandbasket/db";
import { getSupportTicket } from "@brandbasket/db";
import { serverEnv } from "@/lib/server/env";
import { getStaffDb } from "./db";

function getAlertRecipient(): string {
  return process.env.SUPPORT_ALERT_EMAIL?.trim() || process.env.FYNIX_TEAM_EMAIL?.trim() || emailTeamInboxDefault();
}

/**
 * Alerts are written by the staff connection. The customer (app) connection has no INSERT on the email outbox, so using
 * it would lose the outbox copy and, with no Brevo key, the whole alert. The outbox copy of a support alert holds only
 * a reference, category, status and link (see packages/email), never the request text or the requester's details.
 */
function alertTransport(): EmailTransport {
  return createAppEmailTransport(getStaffDb());
}

function getAdminUrl(path: string): string {
  try {
    return new URL(path, serverEnv().ADMIN_ORIGIN).toString();
  } catch {
    return path;
  }
}

/**
 * Sends an email alert to staff when a new support or feedback request is submitted.
 * Designed to run in background (best-effort): errors are logged and never fail the user's action.
 */
export async function sendSupportTicketAlert(
  ticket: { readonly id: string; readonly displayRef: string },
  input: {
    readonly category: SupportCategory;
    readonly subject: string;
    readonly description: string;
    readonly details?: Readonly<Record<string, string>> | null;
    readonly attachmentIds?: readonly string[];
    readonly browserDevice?: string | null;
  },
  access: {
    readonly user: {
      readonly id: string;
      readonly name: string;
      readonly email: string;
      readonly phone?: string | null;
    };
    readonly businessId?: string | null;
    readonly businessName?: string | null;
  },
): Promise<void> {
  try {
    const to = getAlertRecipient();
    const adminUrl = getAdminUrl(`/support/${ticket.id}`);

    const message = supportTicketAlertEmail({
      to,
      reference: ticket.displayRef,
      ticketId: ticket.id,
      category: input.category,
      categoryLabel: SUPPORT_CATEGORY_LABELS[input.category] ?? input.category,
      subject: input.subject,
      description: input.description,
      requesterEmail: access.user.email,
      requesterName: access.user.name,
      requesterPhone: access.user.phone,
      businessId: access.businessId,
      businessName: access.businessName,
      statusLabel: SUPPORT_STATUS_LABELS.new,
      details: input.details,
      attachmentCount: input.attachmentIds?.length ?? 0,
      browserDevice: input.browserDevice,
      adminUrl,
    });

    await alertTransport().send(message);
    console.info(`[support-alert] New ticket alert sent to ${to} (${ticket.displayRef})`);
  } catch (error) {
    console.error(`[support-alert] Failed to send ticket alert for ${ticket.displayRef}`, error);
  }
}

/**
 * Sends an email alert to staff when a customer replies to an existing support ticket.
 * Designed to run in background (best-effort).
 */
export async function sendSupportReplyAlert(
  readDb: Database,
  ticketId: string,
  reply: {
    readonly body: string;
    readonly attachmentIds?: readonly string[];
  },
  access: {
    readonly user: {
      readonly id: string;
      readonly name: string;
      readonly email: string;
      readonly phone?: string | null;
    };
  },
): Promise<void> {
  try {
    const to = getAlertRecipient();
    const detail = await getSupportTicket(readDb, access.user.id, ticketId);
    if (!detail) {
      console.warn(`[support-alert] Could not load ticket ${ticketId} to send reply alert.`);
      return;
    }

    const adminUrl = getAdminUrl(`/support/${ticketId}`);

    const message = supportReplyAlertEmail({
      to,
      reference: detail.ticket.displayRef,
      ticketId,
      subject: detail.ticket.subject,
      body: reply.body,
      authorName: access.user.name,
      authorEmail: access.user.email,
      attachmentCount: reply.attachmentIds?.length ?? 0,
      categoryLabel: SUPPORT_CATEGORY_LABELS[detail.ticket.category],
      statusLabel: SUPPORT_STATUS_LABELS[detail.ticket.status],
      adminUrl,
    });

    await alertTransport().send(message);
    console.info(`[support-alert] Reply alert sent to ${to} (${detail.ticket.displayRef})`);
  } catch (error) {
    console.error(`[support-alert] Failed to send reply alert for ${ticketId}`, error);
  }
}

// In-memory rate limiting / deduplication for system error alerts (max 1 per fingerprint per 5 minutes)
const errorAlertsSeen = new Map<string, number>();
const ERROR_ALERT_DEBOUNCE_MS = 5 * 60 * 1000;

/**
 * Sends an automated system error alert to staff.
 * Deduplicated per error class + route to prevent alert storms.
 */
export async function sendSystemErrorAlert(
  report: {
    readonly app: string;
    readonly operation: string;
    readonly errorClass: string;
    readonly route: string;
    readonly severity: string;
    readonly release?: string | null;
    readonly browser?: string | null;
    readonly eventId?: string | null;
  },
): Promise<void> {
  try {
    const dedupeKey = `${report.app}:${report.errorClass}:${report.route}`;
    const now = Date.now();
    const lastSent = errorAlertsSeen.get(dedupeKey);
    if (lastSent && now - lastSent < ERROR_ALERT_DEBOUNCE_MS) {
      return; // Debounced
    }
    errorAlertsSeen.set(dedupeKey, now);

    const to = getAlertRecipient();
    const adminUrl = getAdminUrl("/support/errors");

    const message = systemErrorAlertEmail({
      to,
      app: report.app,
      operation: report.operation,
      errorClass: report.errorClass,
      route: report.route,
      severity: report.severity,
      release: report.release,
      browser: report.browser,
      eventId: report.eventId,
      adminUrl,
    });

    await alertTransport().send(message);
    console.info(`[support-alert] System error alert sent to ${to}: ${report.errorClass} on ${report.route}`);
  } catch (error) {
    console.error("[support-alert] Failed to send system error alert", error);
  }
}
