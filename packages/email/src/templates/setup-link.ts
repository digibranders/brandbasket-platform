import { assertWebUrl, sanitizeHeaderValue, withheldLinkCopy, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";
import { emailBrandName } from "../brand";

export interface SetupLinkInput {
  readonly to: string;
  readonly businessName: string;
  readonly setupUrl: string;
  readonly expiresInDays: number;
}

/** Sent after the call: the one-time link that creates the customer's account. */
export function setupLinkEmail(input: SetupLinkInput): EmailMessage {
  const brand = emailBrandName();
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
    bodyHtml: receiptDocument({
      title: `Set up your ${brand} account`,
      kicker: "Set up your account",
      heading: `Set up your ${brand} account`,
      body: [
        receiptParagraph(`Thanks for talking to us about ${input.businessName}.`),
        receiptButton(setupUrl, "Set your password"),
        receiptParagraph(validity),
      ],
      footer: ["If you didn't expect this email, you can ignore it."],
    }),
    outboxCopy: withheldLinkCopy(`Set up your ${brand} account`, [
      `Thanks for talking to us about ${input.businessName}.`,
      validity,
      "If you didn't expect this email, you can ignore it.",
    ]),
  };
}
