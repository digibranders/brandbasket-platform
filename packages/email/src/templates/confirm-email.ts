import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, withheldLinkCopy, type EmailMessage } from "../message";
import { emailBrandName } from "../brand";

export interface ConfirmEmailInput {
  readonly to: string;
  readonly confirmUrl: string;
  readonly expiresInDays: number;
}

/**
 * Sent when a free listing account is opened: opening the link proves the address is the owner's. Until then we
 * don't confirm the business, so an account opened with someone else's address goes nowhere.
 */
export function confirmEmailEmail(input: ConfirmEmailInput): EmailMessage {
  const brand = emailBrandName();
  const confirmUrl = assertWebUrl(input.confirmUrl, "confirmUrl");
  const validity = `This link expires in ${input.expiresInDays} days.`;
  const ignore = `If you didn't open a ${brand} account, you can ignore this email.`;
  return {
    to: sanitizeHeaderValue(input.to),
    subject: `Confirm your email for ${brand}`,
    template: "confirm-email",
    bodyText: [`Confirm this is your email address, so we can confirm your business on ${brand}:`, confirmUrl, validity, ignore].join(
      "\n\n",
    ),
    bodyHtml: htmlDocument(`Confirm your email for ${brand}`, [
      escapeHtml(`Confirm this is your email address, so we can confirm your business on ${brand}.`),
      `<a href="${escapeHtml(confirmUrl)}">Confirm my email</a>`,
      escapeHtml(validity),
      escapeHtml(ignore),
    ]),
    outboxCopy: withheldLinkCopy(`Confirm your email for ${brand}`, [
      `Confirm this is your email address, so we can confirm your business on ${brand}.`,
      validity,
      ignore,
    ]),
  };
}
