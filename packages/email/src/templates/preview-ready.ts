import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";
import { emailBrandName } from "../brand";

export interface PreviewReadyInput {
  readonly to: string;
  readonly businessName: string;
  /** Links to /website where Approve and Ask for changes live. */
  readonly reviewUrl?: string | null;
  /** Direct link to the external preview. */
  readonly previewUrl?: string | null;
}

/** Sent when staff have a preview of the customer's website ready for them to look at. */
export function previewReadyEmail(input: PreviewReadyInput): EmailMessage {
  const brand = emailBrandName();
  const targetUrl = input.reviewUrl ?? input.previewUrl;
  if (!targetUrl) throw new Error("reviewUrl must be an absolute http or https URL");
  const reviewUrl = assertWebUrl(targetUrl, input.reviewUrl ? "reviewUrl" : "previewUrl");
  if (input.previewUrl && input.reviewUrl) {
    assertWebUrl(input.previewUrl, "previewUrl");
  }

  const intro = `Your preview for ${input.businessName} is ready to look at.`;
  const action = "Check your preview in your dashboard, where you can approve it to go live or ask for changes:";
  const replyNote = "You can approve the preview or ask for changes directly from your dashboard. If you reply to this email, we will still receive your message and turn it into a change request.";
  const lines = [intro, action, reviewUrl, replyNote];

  return {
    to: sanitizeHeaderValue(input.to),
    subject: `Your ${brand} preview is ready`,
    template: "preview-ready",
    bodyText: lines.join("\n\n"),
    bodyHtml: receiptDocument({
      title: `Your ${brand} preview is ready`,
      kicker: "Preview ready",
      heading: `Your ${brand} preview is ready`,
      body: [
        receiptParagraph(intro),
        receiptParagraph(action),
        receiptButton(reviewUrl, "Review your website"),
        receiptParagraph(replyNote),
      ],
    }),
  };
}
