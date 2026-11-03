import { assertWebUrl, sanitizeHeaderValue, withheldLinkCopy, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";
import { emailBrandName } from "../brand";

export interface BusinessInviteInput {
  readonly to: string;
  /** Who sent it: the owner's name. */
  readonly inviterName: string;
  readonly businessName: string;
  /** The role as the invited person reads it: "Editor" or "Viewer". */
  readonly roleLabel: string;
  readonly acceptUrl: string;
  readonly expiresInDays: number;
}

/** Sent by a business's owner from Settings, Team: the link where the invited person joins that business's dashboard. */
export function businessInviteEmail(input: BusinessInviteInput): EmailMessage {
  const brand = emailBrandName();
  const acceptUrl = assertWebUrl(input.acceptUrl, "acceptUrl");
  const subject = `Join ${input.businessName} on ${brand}`;
  const intro = `${input.inviterName} invited you to the ${brand} dashboard for ${input.businessName} as ${input.roleLabel}.`;
  const how = `Open the link and sign in with this email address (${input.to}) to join.`;
  const validity = `This link expires in ${input.expiresInDays} days.`;
  const ignore = "If you didn't expect this email, you can ignore it.";

  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(subject),
    template: "business-invite",
    bodyText: [intro, how, acceptUrl, validity, ignore].join("\n\n"),
    bodyHtml: receiptDocument({
      title: subject,
      kicker: "Team invitation",
      heading: subject,
      body: [receiptParagraph(intro), receiptParagraph(how), receiptButton(acceptUrl, "Join the dashboard"), receiptParagraph(validity)],
      footer: [ignore],
    }),
    outboxCopy: withheldLinkCopy(subject, [intro, validity, ignore]),
  };
}
