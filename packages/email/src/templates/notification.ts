import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { emailBrandName } from "../brand";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";

export interface NotificationEmailInput {
  readonly to: string;
  /** Kept in the outbox so staff can tell what the message was, e.g. "kickoff-booked". */
  readonly template: string;
  readonly subject: string;
  readonly paragraphs: readonly string[];
  /** One button, with an absolute web address. */
  readonly button?: { readonly label: string; readonly url: string };
}

/**
 * The one plain layout for the emails notify() sends (packages/shared/src/server/notify.ts). The words come from the
 * event's email copy module; this only lays them out.
 */
export function notificationEmail(input: NotificationEmailInput): EmailMessage {
  const subject = sanitizeHeaderValue(input.subject);
  const url = input.button === undefined ? null : assertWebUrl(input.button.url, "button address");
  const lines = [...input.paragraphs, ...(url === null ? [] : [url])];
  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: sanitizeHeaderValue(input.template),
    bodyText: lines.join("\n\n"),
    bodyHtml: receiptDocument({
      title: subject,
      kicker: emailBrandName(),
      heading: subject,
      body: [
        ...input.paragraphs.map(receiptParagraph),
        ...(input.button === undefined || url === null ? [] : [receiptButton(url, input.button.label)]),
      ],
    }),
  };
}
