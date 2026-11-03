import "server-only";
import { isPhoneAccountEmail } from "@brandbasket/db";
import {
  createAppEmailTransport,
  domainConnectedEmail,
  domainRequestedEmail,
  emailTeamInboxDefault,
  previewApprovedEmail,
  previewChangesReceivedEmail,
  previewRevisionsRequestedEmail,
  supportTicketAlertEmail,
} from "@brandbasket/email";
import type { SessionUser } from "@brandbasket/shared/lib/access";
import { SUPPORT_CATEGORY_LABELS, SUPPORT_STATUS_LABELS } from "@brandbasket/shared/lib/support";
import { teamsCard } from "@brandbasket/shared/lib/teams-webhook";
import { sendTeamsAlert } from "@brandbasket/shared/server/teams-alerts";
import { workingDayOf } from "@brandbasket/shared/lib/working-days";
import { getStaffDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { customerEmailTransport } from "@/features/server-common/email";
import { dayLabel } from "./rules/dates";
import { revisionDue } from "./rules/progress";

/*
 * Ported from apps/platform lib/server/project-response.ts (team email), support-alerts.ts (sendSupportTicketAlert),
 * preview-changes-email.ts and domain-alert.ts. Every one is best effort and runs after the customer's change has committed:
 * it logs and never throws, so a failed email never undoes or blocks what the customer already did.
 *
 * Staff connection: the customer role has no INSERT on the email outbox, and the Teams address sits in staff-only
 * site_settings. Nothing here reads customer data beyond what the caller passes in.
 */

/** The console's page for a path, or the bare path when ADMIN_ORIGIN is not set (the email templates then refuse it and log). */
function adminUrl(path: string): string {
  const origin = process.env.ADMIN_ORIGIN?.trim();
  if (origin === undefined || origin === "") return path;
  try {
    return new URL(path, origin).toString();
  } catch {
    return path;
  }
}

function teamInbox(): string {
  return process.env.BRANDBASKET_TEAM_EMAIL?.trim() || emailTeamInboxDefault();
}

const errorName = (error: unknown): string => (error instanceof Error ? error.name : "error");

/** Tells the team a preview was approved or sent back. Without BRANDBASKET_TEAM_EMAIL it only logs, as the old app did. */
export async function notifyTeamPreviewResponse(kind: "approve" | "revisions", business: { readonly id: string; readonly name: string }): Promise<void> {
  const to = process.env.BRANDBASKET_TEAM_EMAIL?.trim();
  if (to === undefined || to === "") {
    console.error("[website] BRANDBASKET_TEAM_EMAIL is not set, so nobody was told about a preview response.", { businessId: business.id });
    return;
  }
  try {
    const clientUrl = adminUrl(`/clients/${business.id}`);
    await createAppEmailTransport(getStaffDb()).send(
      kind === "approve" ? previewApprovedEmail({ to, businessName: business.name, clientUrl }) : previewRevisionsRequestedEmail({ to, businessName: business.name, clientUrl }),
    );
  } catch (error) {
    console.error("[website] A preview response was recorded but the team notification failed.", { businessId: business.id, error: errorName(error) });
  }
}

export interface FeedbackTicket {
  readonly ticket: { readonly id: string; readonly displayRef: string };
  readonly subject: string;
  readonly description: string;
  readonly attachmentCount: number;
  readonly user: SessionUser;
  readonly business: { readonly id: string; readonly name: string };
}

/** The new-request alert for preview feedback, on Teams and by email, the same alert every new support request raises. */
export async function sendFeedbackTicketAlert(input: FeedbackTicket): Promise<void> {
  const url = adminUrl(`/support/${input.ticket.id}`);
  const categoryLabel = SUPPORT_CATEGORY_LABELS.website_change;
  try {
    await sendTeamsAlert(
      getStaffDb(),
      serverEnv().BETTER_AUTH_SECRET,
      "support",
      teamsCard({
        title: `${categoryLabel}: ${input.subject}`,
        subtitle: input.ticket.displayRef,
        facts: [
          { name: "From", value: input.user.name },
          { name: "Email", value: input.user.email },
          { name: "Phone", value: input.user.phone },
          { name: "Business", value: input.business.name },
          { name: "Status", value: SUPPORT_STATUS_LABELS.new },
          { name: "Attachments", value: input.attachmentCount > 0 ? String(input.attachmentCount) : null },
        ],
        text: input.description,
        open: { label: "Open the request", url },
      }),
    );
  } catch (error) {
    console.error("[website] The support Teams alert could not be sent.", errorName(error));
  }
  try {
    await createAppEmailTransport(getStaffDb()).send(
      supportTicketAlertEmail({
        to: process.env.SUPPORT_ALERT_EMAIL?.trim() || teamInbox(),
        reference: input.ticket.displayRef,
        ticketId: input.ticket.id,
        category: "website_change",
        categoryLabel,
        subject: input.subject,
        description: input.description,
        requesterEmail: input.user.email,
        requesterName: input.user.name,
        requesterPhone: input.user.phone,
        businessId: input.business.id,
        businessName: input.business.name,
        statusLabel: SUPPORT_STATUS_LABELS.new,
        attachmentCount: input.attachmentCount,
        adminUrl: url,
      }),
    );
  } catch (error) {
    console.error(`[website] Failed to send the ticket alert for ${input.ticket.displayRef}.`, errorName(error));
  }
}

/**
 * Tells the customer the team has their changes and when the new preview is promised: two working days after the day they
 * asked, the date the Website page shows. A phone-only account has no address to write to.
 */
export async function sendPreviewChangesReceived(input: {
  readonly user: SessionUser;
  readonly body: string;
  readonly round: number;
  readonly rounds: number;
  readonly now: Date;
}): Promise<void> {
  if (isPhoneAccountEmail(input.user.email)) return;
  try {
    await customerEmailTransport(getStaffDb()).send(
      previewChangesReceivedEmail({
        to: input.user.email,
        name: input.user.name,
        round: input.round,
        rounds: Math.max(input.rounds, input.round),
        text: input.body,
        readyBy: dayLabel(revisionDue(workingDayOf(input.now))),
      }),
    );
  } catch (error) {
    console.error("[website] The customer's changes were saved but their confirmation email failed.", errorName(error));
  }
}

/** Tells the team a customer's domain now points at their website, the first time a check finds it. */
export async function notifyTeamDomainConnected(business: { readonly id: string; readonly name: string }, domain: string): Promise<void> {
  try {
    await createAppEmailTransport(getStaffDb()).send(domainConnectedEmail({ to: teamInbox(), businessName: business.name, domain, clientUrl: adminUrl(`/clients/${business.id}`) }));
  } catch (error) {
    console.error("[website] A customer's domain was found connected but the team notification failed.", { businessId: business.id, error: errorName(error) });
  }
}

/** Tells the team a live customer asked to move to a domain of their own. */
export async function notifyTeamDomainRequested(business: { readonly id: string; readonly name: string }, domain: string): Promise<void> {
  try {
    await createAppEmailTransport(getStaffDb()).send(domainRequestedEmail({ to: teamInbox(), businessName: business.name, domain, clientUrl: adminUrl(`/clients/${business.id}`) }));
  } catch (error) {
    console.error("[website] A customer asked to move to their own domain but the team notification failed.", { businessId: business.id, error: errorName(error) });
  }
}
