import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, withheldLinkCopy, type EmailMessage } from "../message";
import { emailBrandName } from "../brand";

export interface PasswordResetInput {
  readonly to: string;
  readonly resetUrl: string;
  readonly expiresInMinutes: number;
  /** What the email calls the product: the deployment's brand (PLATFORM_BRAND; Firstfold when unset) unless the dashboard is sold under another name. */
  readonly brandName?: string;
}

/** Sent when someone asks to reset the password of the account at this address: the one-time link that sets a new one. */
export function passwordResetEmail(input: PasswordResetInput): EmailMessage {
  const brand = input.brandName ?? emailBrandName();
  const resetUrl = assertWebUrl(input.resetUrl, "resetUrl");
  const validity = `This link works once and expires in ${input.expiresInMinutes} minutes.`;
  const ignore = "If you didn't ask for this, you can ignore this email: your password stays as it is.";
  return {
    to: sanitizeHeaderValue(input.to),
    subject: `Reset your ${brand} password`,
    template: "password-reset",
    bodyText: [`Choose a new password for your ${brand} account:`, resetUrl, validity, ignore].join("\n\n"),
    bodyHtml: htmlDocument(`Reset your ${brand} password`, [
      `<a href="${escapeHtml(resetUrl)}">Choose a new password</a>`,
      escapeHtml(validity),
      escapeHtml(ignore),
    ]),
    outboxCopy: withheldLinkCopy(`Reset your ${brand} password`, [validity, ignore]),
  };
}
