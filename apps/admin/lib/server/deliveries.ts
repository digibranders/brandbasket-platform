import "server-only";
import {
  deliveryHealth,
  findEmail,
  listAlertDeliveries,
  listEmailDeliveries,
  listWebhookEvents,
  updateEmailDelivery,
  WEBHOOK_SOURCES,
  type DeliveryHealth,
  type WebhookSource,
} from "@brandbasket/db";
import { createEmailDelivery, emailFailureSummary, type BrevoReceipt, type EmailMessage } from "@brandbasket/email";
import {
  alertRow,
  canResendEmail,
  emailRow,
  mergeDeliveries,
  wantsSource,
  wantsWebhooks,
  webhookRow,
  type DeliveryFilter,
  type DeliveryRow,
} from "@/lib/deliveries-view";
import { getStaffDb } from "./db";
import { resendFailedAlert } from "./teams-admin";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Rows read from each source, and rows shown on the page. */
export const DELIVERY_ROWS = 100;
/** "Resend all failed" sends this many emails and this many alerts at most, from the last 24 hours. */
export const RESEND_ALL_LIMIT = 25;

export type ResendResult = "sent" | "failed" | "refused" | "unavailable";

function webhookSourceOf(filter: DeliveryFilter): WebhookSource | null {
  return WEBHOOK_SOURCES.find((source) => source === filter.source) ?? null;
}

/** The Deliveries page: the last 24 hours' health per source, and the rows the filter asks for. */
export async function loadDeliveries(filter: DeliveryFilter, now: Date): Promise<{ readonly health: DeliveryHealth; readonly rows: readonly DeliveryRow[] }> {
  const db = getStaffDb();
  const base = { failedOnly: filter.failedOnly, search: filter.search, limit: DELIVERY_ROWS };
  const [health, webhooks, emails, alerts] = await Promise.all([
    deliveryHealth(db, new Date(now.getTime() - DAY_MS)),
    wantsWebhooks(filter) ? listWebhookEvents(db, { ...base, source: webhookSourceOf(filter) }) : Promise.resolve([]),
    wantsSource(filter, "brevo") ? listEmailDeliveries(db, base) : Promise.resolve([]),
    wantsSource(filter, "teams") ? listAlertDeliveries(db, base) : Promise.resolve([]),
  ]);
  return { health, rows: mergeDeliveries([webhooks.map(webhookRow), emails.map(emailRow), alerts.map(alertRow)], DELIVERY_ROWS) };
}

/**
 * Sends a failed email again through Brevo and records the result on its row. Refuses one that went, one whose stored
 * body is a redacted copy (the recipient would get a message with its link missing) and one that does not exist; says
 * when Brevo is not set up here (local development).
 */
export async function resendEmail(
  emailId: string,
  now: Date,
  deliver: { readonly send: (message: EmailMessage) => Promise<BrevoReceipt> } | null = createEmailDelivery(),
): Promise<ResendResult> {
  const db = getStaffDb();
  const email = await findEmail(db, emailId);
  if (email === null || !canResendEmail(email)) return "refused";
  if (deliver === null) return "unavailable";
  try {
    const receipt = await deliver.send({ to: email.toAddress, subject: email.subject, template: email.template, bodyText: email.bodyText, bodyHtml: email.bodyHtml });
    await updateEmailDelivery(db, emailId, { status: "sent", providerMessageId: receipt.providerMessageId, error: null, now });
    return "sent";
  } catch (error) {
    await updateEmailDelivery(db, emailId, { status: "failed", providerMessageId: null, error: emailFailureSummary(error), now });
    return "failed";
  }
}

/** Sends every failed email and alert from the last 24 hours again, a few at most. Answers how many went and how many did not. */
export async function resendAllFailed(now: Date): Promise<{ readonly sent: number; readonly failed: number }> {
  const db = getStaffDb();
  const since = now.getTime() - DAY_MS;
  const filter = { failedOnly: true, search: null, limit: RESEND_ALL_LIMIT };
  const [emails, alerts] = await Promise.all([listEmailDeliveries(db, filter), listAlertDeliveries(db, filter)]);
  let sent = 0;
  let failed = 0;
  for (const email of emails.filter((row) => row.createdAt.getTime() >= since && canResendEmail(row))) {
    const result = await resendEmail(email.id, now);
    if (result === "sent") sent += 1;
    else failed += 1;
  }
  for (const alert of alerts.filter((row) => row.createdAt.getTime() >= since && row.card !== null)) {
    const result = await resendFailedAlert(alert.id, now);
    if (result === "sent") sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

/** The rail's Deliveries count: every source's failures in the last 24 hours. */
export async function countFailedDeliveries24h(now: Date): Promise<number> {
  const health = await deliveryHealth(getStaffDb(), new Date(now.getTime() - DAY_MS));
  return Object.values(health).reduce((total, source) => total + source.failed, 0);
}
