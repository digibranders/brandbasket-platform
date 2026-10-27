import { assertWebUrl, sanitizeHeaderValue, withheldLinkCopy, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";
import { emailBrandName } from "../brand";

export interface PasswordResetInput {
  readonly to: string;
  readonly resetUrl: string;
  readonly expiresInMinutes: number;
}

/** Sent when someone asks to reset the password of the account at this address: the one-time link that sets a new one. */
export function passwordResetEmail(input: PasswordResetInput): EmailMessage {
  const brand = emailBrandName();
  const resetUrl = assertWebUrl(input.resetUrl, "resetUrl");
  const validity = `This link works once and expires in ${input.expiresInMinutes} minutes.`;
  const ignore = "If you didn't ask for this, you can ignore this email: your password stays as it is.";
  return {
    to: sanitizeHeaderValue(input.to),
    subject: `Reset your ${brand} password`,
    template: "password-reset",
    bodyText: [`Choose a new password for your ${brand} account:`, resetUrl, validity, ignore].join("\n\n"),
    bodyHtml: receiptDocument({
      title: `Reset your ${brand} password`,
      kicker: "Password reset",
      heading: `Reset your ${brand} password`,
      body: [receiptButton(resetUrl, "Choose a new password"), receiptParagraph(validity)],
      footer: [ignore],
    }),
    outboxCopy: withheldLinkCopy(`Reset your ${brand} password`, [validity, ignore]),
  };
}
