import { emailBrandName } from "../brand";
import { emailGreeting } from "../format";
import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";

export interface RequestAcknowledgementInput {
  readonly to: string;
  /** The customer's full name; only the first word is used in greeting. Null for a greeting without name. */
  readonly name: string | null;
  /** The request title or subject. */
  readonly title: string;
  /** The canonical URL of the request on the dashboard: https://app.brandbasket.in/requests/<ticketId> */
  readonly requestUrl: string;
  /** The business name the request was made for. */
  readonly businessName?: string | null;
}

/**
 * Sent once when a customer submits a change or request from the dashboard,
 * confirming receipt and giving them a direct link to follow progress.
 */
export function requestAcknowledgementEmail(input: RequestAcknowledgementInput): EmailMessage {
  const requestUrl = assertWebUrl(input.requestUrl, "requestUrl");
  const subject = `We received your request: ${input.title}`;
  const greeting = emailGreeting(input.name);
  const intro = input.businessName
    ? `We have your request for ${input.businessName}: "${input.title}".`
    : `We have your request: "${input.title}".`;
  const review = "Our team will review it and reply soon.";
  const follow = "You can view your request, add details, or reply to the team here:";
  const signOff = `The ${emailBrandName()} team`;

  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(subject),
    template: "request-acknowledgement",
    bodyText: [
      greeting,
      intro,
      review,
      follow,
      `Open your request: ${requestUrl}`,
      signOff,
    ].join("\n\n"),
    bodyHtml: receiptDocument({
      title: subject,
      kicker: "Request received",
      heading: "We received your request",
      body: [
        receiptParagraph(greeting),
        receiptParagraph(intro),
        receiptParagraph(review),
        receiptParagraph(follow),
        receiptButton(requestUrl, "Open your request"),
        receiptParagraph(signOff),
      ],
    }),
  };
}
