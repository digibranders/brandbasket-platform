import "server-only";
import { PRIVACY_REQUEST_KIND_LABELS, type PrivacyRequestKind } from "@brandbasket/db";
import { createAppEmailTransport } from "@brandbasket/email";
import { formatIstTime, teamsCard } from "@brandbasket/shared/lib/teams-webhook";
import { privacyAlertRecipient, privacyRequestsConsoleUrl, sendNewPrivacyRequestAlert } from "@/lib/privacy-request-alerts";
import { getStaffDb } from "./db";
import { serverEnv } from "./env";
import { alertTeams } from "./teams";

/**
 * Emails the privacy mailbox that a request was just filed. Written by the staff connection, like the support alerts: the
 * customer connection cannot insert into the email outbox. Never throws: the request is already saved.
 */
export async function notifyNewPrivacyRequest(request: { readonly reference: string; readonly kind: PrivacyRequestKind; readonly dueAt: Date }): Promise<void> {
  try {
    // The card names the reference and the kind only, as the email does; the person's details stay in the console.
    void alertTeams(
      "customers",
      teamsCard({
        title: `New privacy request: ${request.reference}`,
        facts: [
          { name: "Kind", value: PRIVACY_REQUEST_KIND_LABELS[request.kind] },
          { name: "Reply due", value: formatIstTime(request.dueAt) },
        ],
        open: { label: "Open privacy requests", url: privacyRequestsConsoleUrl(serverEnv().ADMIN_ORIGIN) },
      }),
    );
    await sendNewPrivacyRequestAlert(createAppEmailTransport(getStaffDb()), request, { to: privacyAlertRecipient(process.env), adminOrigin: serverEnv().ADMIN_ORIGIN });
  } catch (error) {
    console.error("[privacy-request-alert] Could not set up the new request alert.", { reference: request.reference, error: error instanceof Error ? error.name : "unknown" });
  }
}
