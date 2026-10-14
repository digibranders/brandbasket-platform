import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";

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

  const htmlParagraphs: string[] = [
    `<strong>Ticket Reference:</strong> ${escapeHtml(input.reference)}`,
    `<strong>Subject:</strong> ${escapeHtml(input.subject)}`,
    `<strong>From:</strong> ${escapeHtml(author)}`,
  ];

  if (input.attachmentCount && input.attachmentCount > 0) {
    htmlParagraphs.push(`<strong>Attachments:</strong> ${input.attachmentCount} screenshot(s) attached`);
  }

  htmlParagraphs.push(
    `<strong>Reply:</strong><br /><div style="margin-top:8px;padding:12px;background:#efe4d6;border-radius:8px;white-space:pre-wrap">${escapeHtml(input.body)}</div>`,
  );

  if (adminUrl) {
    htmlParagraphs.push(
      `<a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:10px 20px;background:#2a0d10;color:#f6efe6;text-decoration:none;border-radius:20px;font-weight:600">Open in Admin Console</a>`,
    );
  }

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
    bodyHtml: htmlDocument(`Customer Reply: ${input.subject}`, htmlParagraphs),
    outboxCopy: {
      subject: sanitizeHeaderValue(`[Customer Reply] ${input.reference}`),
      bodyText: outboxText.join("\n"),
      bodyHtml: htmlDocument(`Customer reply ${input.reference}`, outboxHtml),
    },
  };
}
