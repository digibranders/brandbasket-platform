import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, withheldLinkCopy, type EmailMessage } from "../message";
import { emailBrandName } from "../brand";

export interface SetupLinkInput {
  readonly to: string;
  readonly businessName: string;
  readonly setupUrl: string;
  readonly expiresInDays: number;
  /** What the email calls the product: the deployment's brand (PLATFORM_BRAND; Firstfold when unset) unless the dashboard is sold under another name. */
  readonly brandName?: string;
}

/** Sent after the call: the one-time link that creates the customer's account. */
export function setupLinkEmail(input: SetupLinkInput): EmailMessage {
  const brand = input.brandName ?? emailBrandName();
  const setupUrl = assertWebUrl(input.setupUrl, "setupUrl");
  const validity = `This link works once and expires in ${input.expiresInDays} days.`;
  const lines = [
    `Thanks for talking to us about ${input.businessName}.`,
    `Set your password to open your ${brand} dashboard:`,
    setupUrl,
    validity,
    "If you didn't expect this email, you can ignore it.",
  ];

  return {
    to: sanitizeHeaderValue(input.to),
    subject: `Set up your ${brand} account`,
    template: "setup-link",
    bodyText: lines.join("\n\n"),
    bodyHtml: htmlDocument(`Set up your ${brand} account`, [
      escapeHtml(`Thanks for talking to us about ${input.businessName}.`),
      `<a href="${escapeHtml(setupUrl)}">Set your password</a>`,
      escapeHtml(validity),
      escapeHtml("If you didn't expect this email, you can ignore it."),
    ]),
    outboxCopy: withheldLinkCopy(`Set up your ${brand} account`, [
      `Thanks for talking to us about ${input.businessName}.`,
      validity,
      "If you didn't expect this email, you can ignore it.",
    ]),
  };
}
