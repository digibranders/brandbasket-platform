import "server-only";
import type { PrivacyRequestKind } from "@brandbasket/db";
import { createAppEmailTransport } from "@brandbasket/email";
import { privacyAlertRecipient, sendNewPrivacyRequestAlert } from "@/lib/privacy-request-alerts";
import { getStaffDb } from "./db";
import { serverEnv } from "./env";

/**
 * Emails the privacy mailbox that a request was just filed. Written by the staff connection, like the support alerts: the
 * customer connection cannot insert into the email outbox. Never throws: the request is already saved.
 */
export async function notifyNewPrivacyRequest(request: { readonly reference: string; readonly kind: PrivacyRequestKind; readonly dueAt: Date }): Promise<void> {
  try {
    await sendNewPrivacyRequestAlert(createAppEmailTransport(getStaffDb()), request, { to: privacyAlertRecipient(process.env), adminOrigin: serverEnv().ADMIN_ORIGIN });
  } catch (error) {
    console.error("[privacy-request-alert] Could not set up the new request alert.", { reference: request.reference, error: error instanceof Error ? error.name : "unknown" });
  }
}
