import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, withheldLinkCopy, type EmailMessage } from "../message";
import { emailBrandName } from "../brand";

export interface StaffInviteInput {
  readonly to: string;
  readonly roleLabel: string;
  readonly inviterName: string;
  readonly acceptUrl: string;
  readonly expiresInDays: number;
}

/** Sent by an admin from the console's Staff page: the one-time link that gives this person console access. */
export function staffInviteEmail(input: StaffInviteInput): EmailMessage {
  const brand = emailBrandName();
  const acceptUrl = assertWebUrl(input.acceptUrl, "acceptUrl");
  const subject = `Join the ${brand} staff console`;
  const intro = `${input.inviterName} invited you to the ${brand} staff console as ${input.roleLabel}.`;
  const validity = `This link works once and expires in ${input.expiresInDays} days.`;
  const ignore = "If you didn't expect this email, you can ignore it.";

  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "staff-invite",
    bodyText: [intro, "Open the link to set your password and join:", acceptUrl, validity, ignore].join("\n\n"),
    bodyHtml: htmlDocument(subject, [escapeHtml(intro), `<a href="${escapeHtml(acceptUrl)}">Join the console</a>`, escapeHtml(validity), escapeHtml(ignore)]),
    outboxCopy: withheldLinkCopy(subject, [intro, validity, ignore]),
  };
}
