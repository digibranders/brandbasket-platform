import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";
import { emailBrandName } from "../brand";

export interface PreviewReadyInput {
  readonly to: string;
  readonly businessName: string;
  readonly previewUrl: string;
}

/** Sent when staff have a preview of the customer's website ready for them to look at. */
export function previewReadyEmail(input: PreviewReadyInput): EmailMessage {
  const brand = emailBrandName();
  const previewUrl = assertWebUrl(input.previewUrl, "previewUrl");
  const intro = `Your preview for ${input.businessName} is ready to look at:`;
  const outro = "Reply and tell us what to change, or let us know if it's ready to go live.";
  const lines = [intro, previewUrl, outro];

  return {
    to: sanitizeHeaderValue(input.to),
    subject: `Your ${brand} preview is ready`,
    template: "preview-ready",
    bodyText: lines.join("\n\n"),
    bodyHtml: receiptDocument({
      title: `Your ${brand} preview is ready`,
      kicker: "Preview ready",
      heading: `Your ${brand} preview is ready`,
      body: [receiptParagraph(intro), receiptButton(previewUrl, "Open the preview"), receiptParagraph(outro)],
    }),
  };
}
