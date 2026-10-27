import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph, receiptQuote, receiptRows, type ReceiptRow } from "../receipt";

export interface SupportReplyAlertInput {
  readonly to: string;
  readonly reference: string;
  readonly ticketId: string;
  readonly subject: string;
  readonly body: string;
  readonly authorName: string;
  readonly authorEmail?: string | null;
  readonly attachmentCount?: number;
  /** Shown in the redacted outbox copy. */
  readonly categoryLabel?: string | null;
  readonly statusLabel?: string | null;
  readonly adminUrl?: string | null;
}

export function supportReplyAlertEmail(input: SupportReplyAlertInput): EmailMessage {
  const adminUrl = input.adminUrl ? assertWebUrl(input.adminUrl, "adminUrl") : null;
  const author = input.authorEmail
    ? `${input.authorName} (${input.authorEmail})`
    : input.authorName;

  const textLines: string[] = [
    `New customer reply on ticket: ${input.reference}`,
    `Subject: ${input.subject}`,
    `From: ${author}`,
  ];

  if (input.attachmentCount && input.attachmentCount > 0) {
    textLines.push(`Attachments: ${input.attachmentCount} screenshot(s)`);
  }

  textLines.push("", "--- Reply Message ---", input.body);

  if (adminUrl) {
    textLines.push("", `View in Admin Console: ${adminUrl}`);
  }

  const rows: ReceiptRow[] = [
    { label: "Reference", value: input.reference },
    { label: "Subject", value: input.subject },
    { label: "From", value: author },
    ...(input.attachmentCount && input.attachmentCount > 0 ? [{ label: "Attachments", value: `${input.attachmentCount} screenshot(s) attached` }] : []),
  ];
  const htmlBlocks = [
    receiptRows(rows, { labelWidth: 110 }),
    receiptParagraph("Reply:"),
    receiptQuote(input.body),
    ...(adminUrl ? [receiptButton(adminUrl, "Open in Admin Console")] : []),
  ];

  // The outbox copy keeps no customer text: no subject, reply, name or email.
  const outboxText = [
    `New customer reply on ticket: ${input.reference}`,
    ...(input.categoryLabel ? [`Category: ${input.categoryLabel}`] : []),
    ...(input.statusLabel ? [`Status: ${input.statusLabel}`] : []),
    ...(adminUrl ? ["", `View in Admin Console: ${adminUrl}`] : []),
  ];
  const outboxHtml = [
    `<strong>Reference:</strong> ${escapeHtml(input.reference)}`,
    ...(input.categoryLabel ? [`<strong>Category:</strong> ${escapeHtml(input.categoryLabel)}`] : []),
    ...(input.statusLabel ? [`<strong>Status:</strong> ${escapeHtml(input.statusLabel)}`] : []),
    ...(adminUrl ? [`<a href="${escapeHtml(adminUrl)}">Open in Admin Console</a>`] : []),
  ];

  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`[Customer Reply] ${input.subject} (${input.reference})`),
    template: "support-reply-alert",
    bodyText: textLines.join("\n"),
    bodyHtml: receiptDocument({
      title: `Customer Reply: ${input.subject}`,
      kicker: "Customer reply",
      heading: `Customer reply: ${input.subject}`,
      body: htmlBlocks,
    }),
    outboxCopy: {
      subject: sanitizeHeaderValue(`[Customer Reply] ${input.reference}`),
      bodyText: outboxText.join("\n"),
      bodyHtml: htmlDocument(`Customer reply ${input.reference}`, outboxHtml),
    },
  };
}
