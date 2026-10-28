import { assertWebUrl, sanitizeHeaderValue, withheldLinkCopy, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";
import { emailBrandName } from "../brand";

export interface AffiliateLinkInput {
  readonly to: string;
  readonly name: string;
  readonly setupUrl: string;
  readonly expiresInDays: number;
}

/** Sent from the console's Affiliates page: the one-time link where an affiliate chooses their password. */
export function affiliateLinkEmail(input: AffiliateLinkInput): EmailMessage {
  const brand = emailBrandName();
  const setupUrl = assertWebUrl(input.setupUrl, "setupUrl");
  const subject = `Set up your ${brand} affiliate account`;
  const greeting = `Hi ${input.name},`;
  const intro = `You are now an affiliate with ${brand}. Choose a password to open your dashboard, where you see your codes and what you earn.`;
  const validity = `This link works once and expires in ${input.expiresInDays} days.`;
  const ignore = "If you didn't expect this email, you can ignore it.";

  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "affiliate-link",
    bodyText: [greeting, intro, setupUrl, validity, ignore].join("\n\n"),
    bodyHtml: receiptDocument({
      title: subject,
      kicker: "Affiliate account",
      heading: subject,
      body: [receiptParagraph(greeting), receiptParagraph(intro), receiptButton(setupUrl, "Set your password"), receiptParagraph(validity)],
      footer: [ignore],
    }),
    outboxCopy: withheldLinkCopy(subject, [greeting, intro, validity, ignore]),
  };
}
