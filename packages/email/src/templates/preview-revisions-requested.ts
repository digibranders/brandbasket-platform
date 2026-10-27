import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";

export interface PreviewRevisionsRequestedInput {
  readonly to: string;
  readonly businessName: string;
  readonly clientUrl: string;
}

/**
 * Internal notification: a customer asked for changes to their preview. There is no written detail here on purpose;
 * they are pointed at booking a call to go through it instead.
 */
export function previewRevisionsRequestedEmail(input: PreviewRevisionsRequestedInput): EmailMessage {
  const clientUrl = assertWebUrl(input.clientUrl, "clientUrl");
  const lines = [
    `${input.businessName} asked for changes to their preview.`,
    "They've been asked to book a call to go through what to change.",
    `Open the client: ${clientUrl}`,
  ];

  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`${input.businessName} asked for changes`),
    template: "preview-revisions-requested",
    bodyText: lines.join("\n"),
    bodyHtml: receiptDocument({
      title: `${input.businessName} asked for changes`,
      kicker: "Changes requested",
      heading: `${input.businessName} asked for changes`,
      body: [receiptParagraph(lines[0] ?? ""), receiptParagraph(lines[1] ?? ""), receiptButton(clientUrl, "Open the client")],
    }),
  };
}
