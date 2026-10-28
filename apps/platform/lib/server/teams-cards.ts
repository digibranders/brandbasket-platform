import { teamsCard, type TeamsMessage } from "@brandbasket/shared/lib/teams-webhook";

/*
 * The Teams cards for the platform's alerts. They carry what the alert emails carry (owner, 2026-10-26: "full, like the
 * email"), so staff can act from the channel, and an Open button to the console page. Pure: the callers pass what they
 * already have.
 */

export function leadTeamsCard(lead: {
  readonly name: string;
  readonly businessName: string;
  readonly businessType: string;
  /** The plans picked on the website, by name; null when none. */
  readonly wants?: string | null;
  readonly city?: string | null;
  readonly email: string;
  readonly phone: string | null;
  readonly message: string | null;
  readonly leadUrl: string;
}): TeamsMessage {
  return teamsCard({
    title: `New enquiry: ${lead.businessName}`,
    subtitle: `${lead.name} got in touch`,
    facts: [
      { name: "Business type", value: lead.businessType },
      { name: "Wants", value: lead.wants ?? null },
      { name: "City", value: lead.city ?? null },
      { name: "Email", value: lead.email },
      { name: "Phone", value: lead.phone },
    ],
    text: lead.message,
    open: { label: "Open the lead", url: lead.leadUrl },
  });
}

export function supportTicketTeamsCard(ticket: {
  readonly reference: string;
  readonly categoryLabel: string;
  readonly subject: string;
  readonly description: string;
  readonly statusLabel: string;
  readonly requesterName: string;
  readonly requesterEmail: string;
  readonly requesterPhone?: string | null;
  readonly businessName?: string | null;
  readonly details?: Readonly<Record<string, string>> | null;
  readonly attachmentCount: number;
  readonly browserDevice?: string | null;
  readonly adminUrl: string;
}): TeamsMessage {
  return teamsCard({
    title: `${ticket.categoryLabel}: ${ticket.subject}`,
    subtitle: ticket.reference,
    facts: [
      { name: "From", value: ticket.requesterName },
      { name: "Email", value: ticket.requesterEmail },
      { name: "Phone", value: ticket.requesterPhone },
      { name: "Business", value: ticket.businessName },
      { name: "Status", value: ticket.statusLabel },
      ...Object.entries(ticket.details ?? {}).map(([name, value]) => ({ name, value })),
      { name: "Attachments", value: ticket.attachmentCount > 0 ? String(ticket.attachmentCount) : null },
      { name: "Browser and device", value: ticket.browserDevice },
    ],
    text: ticket.description,
    open: { label: "Open the request", url: ticket.adminUrl },
  });
}

export function supportReplyTeamsCard(reply: {
  readonly reference: string;
  readonly subject: string;
  readonly categoryLabel: string;
  readonly statusLabel: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly body: string;
  readonly attachmentCount: number;
  readonly adminUrl: string;
}): TeamsMessage {
  return teamsCard({
    title: `Reply on ${reply.reference}: ${reply.subject}`,
    subtitle: `${reply.authorName} replied`,
    facts: [
      { name: "Email", value: reply.authorEmail },
      { name: "Request type", value: reply.categoryLabel },
      { name: "Status", value: reply.statusLabel },
      { name: "Attachments", value: reply.attachmentCount > 0 ? String(reply.attachmentCount) : null },
    ],
    text: reply.body,
    open: { label: "Open the request", url: reply.adminUrl },
  });
}

export function systemErrorTeamsCard(report: {
  readonly app: string;
  readonly operation: string;
  readonly errorClass: string;
  readonly route: string;
  readonly severity: string;
  readonly release?: string | null;
  readonly browser?: string | null;
  readonly eventId?: string | null;
  readonly adminUrl: string;
}): TeamsMessage {
  return teamsCard({
    title: `System error: ${report.errorClass}`,
    subtitle: `${report.app}, ${report.severity}`,
    facts: [
      { name: "Operation", value: report.operation },
      { name: "Route", value: report.route },
      { name: "Release", value: report.release },
      { name: "Browser", value: report.browser },
      { name: "Event id", value: report.eventId },
    ],
    open: { label: "Open the error reports", url: report.adminUrl },
  });
}

/**
 * A visitor left their details with a client's chatbot. The details belong to the client, so the card carries none of
 * them: only a link to the client in the console.
 */
export function chatbotLeadTeamsCard(lead: { readonly clientUrl: string }): TeamsMessage {
  return teamsCard({
    title: "New chatbot lead",
    subtitle: "A visitor left their details with a client's chatbot",
    open: { label: "Open the client", url: lead.clientUrl },
  });
}
