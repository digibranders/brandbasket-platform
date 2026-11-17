import "server-only";
import { createEmailDelivery, drainEmailQueue, type EmailDrainReport } from "@brandbasket/email";
import { LEADS_API_TOKEN_MIN_LENGTH } from "@/platform/lib/leads-api";
import { getStaffDb } from "./db";

/** The secret the scheduled drainer sends as `Authorization: Bearer <token>`. Unset or too short refuses every request. */
export function emailQueueToken(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const token = env.EMAIL_QUEUE_TOKEN?.trim() ?? "";
  return token.length >= LEADS_API_TOKEN_MIN_LENGTH ? token : null;
}

/** Sends the queued emails that are due. Null when Brevo is not configured here, so nothing is claimed. */
export async function drainQueuedEmails(now: Date = new Date()): Promise<EmailDrainReport | null> {
  const brevo = createEmailDelivery();
  if (brevo === null) return null;
  return drainEmailQueue(getStaffDb(), brevo, now);
}
