import {
  listOpenPrivacyRequests,
  markPrivacyRequestsReminded,
  PRIVACY_REQUEST_KIND_LABELS,
  type Database,
  type PrivacyRequestKind,
} from "@fynix/db";
import { emailTeamInboxDefault, privacyRequestAlertEmail, privacyRequestsDueEmail, type EmailTransport, type PrivacyRequestDueItem, type PrivacyRequestDueStage } from "@fynix/email";
import { daysUntilDue } from "@fynix/shared/lib/privacy-request-deadlines";
import { selectReminders } from "@fynix/shared/lib/privacy-request-reminders";

/*
 * The emails that tell staff a privacy request needs them: one when a request is filed on the website, and one each night
 * listing open requests that have reached day 20 or day 25 of 30, or are overdue. They go to one mailbox and carry no
 * personal data (see packages/email's privacy-request-alert). This file imports nothing server-only, so the nightly
 * maintenance script can use it as well as the routes.
 */

const CONSOLE_PATH = "/privacy-requests";

/** Where the emails go: PRIVACY_ALERT_EMAIL if set, otherwise the support alert mailbox, otherwise the team address. */
export function privacyAlertRecipient(env: Readonly<Record<string, string | undefined>>): string {
  return env.PRIVACY_ALERT_EMAIL?.trim() || env.SUPPORT_ALERT_EMAIL?.trim() || env.FYNIX_TEAM_EMAIL?.trim() || emailTeamInboxDefault();
}

/** The staff console's page for these requests. */
export function privacyRequestsConsoleUrl(adminOrigin: string): string {
  return new URL(CONSOLE_PATH, adminOrigin).toString();
}

/** A date as the staff read it on a calendar, in India's time. */
export function dueDayWords(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}

export interface NewRequestAlert {
  readonly reference: string;
  readonly kind: PrivacyRequestKind;
  readonly dueAt: Date;
}

/** Tells the mailbox a request has been filed. Best-effort: the request is already saved, so a failure here is only logged. */
export async function sendNewPrivacyRequestAlert(
  transport: EmailTransport,
  alert: NewRequestAlert,
  config: { readonly to: string; readonly adminOrigin: string },
): Promise<void> {
  try {
    await transport.send(
      privacyRequestAlertEmail({
        to: config.to,
        reference: alert.reference,
        kindLabel: PRIVACY_REQUEST_KIND_LABELS[alert.kind],
        dueDay: dueDayWords(alert.dueAt),
        consoleUrl: privacyRequestsConsoleUrl(config.adminOrigin),
      }),
    );
  } catch (error) {
    console.error("[privacy-request-alert] Could not send the new request alert.", { reference: alert.reference, error: error instanceof Error ? error.name : "unknown" });
  }
}

const STAGE_NAMES: Readonly<Record<1 | 2 | 3, PrivacyRequestDueStage>> = { 1: "reminder", 2: "urgent", 3: "overdue" };

export interface ReminderRun {
  /** How many requests were listed in tonight's email; 0 means no email was sent. */
  readonly listed: number;
}

/**
 * Sends tonight's email, if any open request has reached a stage staff have not been told about or is overdue, then records
 * the stages so the next night does not repeat them. The stages are recorded only after the email is sent: if sending
 * fails this throws and tomorrow's run tries again.
 */
export async function sendPrivacyRequestReminders(
  db: Database,
  transport: EmailTransport,
  config: { readonly to: string; readonly adminOrigin: string; readonly now: Date },
): Promise<ReminderRun> {
  const due = selectReminders(await listOpenPrivacyRequests(db), config.now);
  if (due.length === 0) return { listed: 0 };

  const items: PrivacyRequestDueItem[] = due.map(({ request, stage }) => ({
    reference: request.reference,
    kindLabel: PRIVACY_REQUEST_KIND_LABELS[request.kind],
    dueDay: dueDayWords(request.dueAt),
    stage: STAGE_NAMES[stage],
    daysLeft: daysUntilDue(request.dueAt, config.now),
  }));
  await transport.send(privacyRequestsDueEmail({ to: config.to, items, consoleUrl: privacyRequestsConsoleUrl(config.adminOrigin) }));
  await markPrivacyRequestsReminded(
    db,
    due.map(({ request, stage }) => ({ id: request.id, stage })),
  );
  return { listed: due.length };
}
