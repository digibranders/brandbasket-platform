import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph, receiptQuote, receiptRows, type ReceiptRow } from "../receipt";

export interface SupportTicketAlertInput {
  readonly to: string;
  readonly reference: string;
  readonly ticketId: string;
  readonly category: string;
  readonly categoryLabel: string;
  readonly subject: string;
  readonly description: string;
  readonly requesterEmail: string;
  readonly requesterName?: string | null;
  readonly requesterPhone?: string | null;
  readonly businessName?: string | null;
  readonly businessId?: string | null;
  readonly details?: Readonly<Record<string, string>> | null;
  readonly attachmentCount?: number;
  readonly browserDevice?: string | null;
  /** Ticket status shown in the redacted outbox copy. A new request is "New". */
  readonly statusLabel?: string;
  readonly adminUrl?: string | null;
}

export function supportTicketAlertEmail(input: SupportTicketAlertInput): EmailMessage {
  const adminUrl = input.adminUrl ? assertWebUrl(input.adminUrl, "adminUrl") : null;
  const requester = input.requesterName
    ? `${input.requesterName} (${input.requesterEmail})`
    : input.requesterEmail;

  const textLines: string[] = [
    `New support ticket received: ${input.reference}`,
    `Category: ${input.categoryLabel}`,
    `Subject: ${input.subject}`,
    `Requester: ${requester}`,
  ];

  if (input.requesterPhone) {
    textLines.push(`Phone: ${input.requesterPhone}`);
  }
  if (input.businessName) {
    textLines.push(`Business: ${input.businessName} (ID: ${input.businessId ?? "n/a"})`);
  }
  if (input.browserDevice) {
    textLines.push(`Browser / Device: ${input.browserDevice}`);
  }
  if (input.attachmentCount && input.attachmentCount > 0) {
    textLines.push(`Attachments: ${input.attachmentCount} screenshot(s)`);
  }

  textLines.push("", "--- Description ---", input.description);

  if (input.details && Object.keys(input.details).length > 0) {
    textLines.push("", "--- Additional Details ---");
    for (const [key, value] of Object.entries(input.details)) {
      if (value) textLines.push(`${key}: ${value}`);
    }
  }

  if (adminUrl) {
    textLines.push("", `View in Admin Console: ${adminUrl}`);
  }

  const rows: ReceiptRow[] = [
    { label: "Reference", value: input.reference },
    { label: "Category", value: input.categoryLabel },
    { label: "Subject", value: input.subject },
    { label: "Requester", value: requester },
    ...(input.requesterPhone ? [{ label: "Phone", value: input.requesterPhone }] : []),
    ...(input.businessName ? [{ label: "Business", value: `${input.businessName} (ID: ${input.businessId ?? "n/a"})` }] : []),
    ...(input.browserDevice ? [{ label: "Browser / device", value: input.browserDevice }] : []),
    ...(input.attachmentCount && input.attachmentCount > 0 ? [{ label: "Attachments", value: `${input.attachmentCount} screenshot(s) attached` }] : []),
  ];
  const detailRows: ReceiptRow[] = Object.entries(input.details ?? {})
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => ({ label, value }));
  const htmlBlocks = [
    receiptRows(rows, { labelWidth: 130 }),
    receiptParagraph("Message:"),
    receiptQuote(input.description),
    ...(detailRows.length > 0 ? [receiptParagraph("Category details:"), receiptRows(detailRows, { labelWidth: 130 })] : []),
    ...(adminUrl ? [receiptButton(adminUrl, "Open in Admin Console")] : []),
  ];

  // The outbox copy keeps no customer text: no subject, message, name, email or phone.
  const status = input.statusLabel ?? "New";
  const outboxText = [
    `New support request: ${input.reference}`,
    `Category: ${input.categoryLabel}`,
    `Status: ${status}`,
    ...(adminUrl ? ["", `View in Admin Console: ${adminUrl}`] : []),
  ];
  const outboxHtml = [
    `<strong>Reference:</strong> ${escapeHtml(input.reference)}`,
    `<strong>Category:</strong> ${escapeHtml(input.categoryLabel)}`,
    `<strong>Status:</strong> ${escapeHtml(status)}`,
    ...(adminUrl ? [`<a href="${escapeHtml(adminUrl)}">Open in Admin Console</a>`] : []),
  ];

  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`[${input.categoryLabel}] ${input.subject} (${input.reference})`),
    template: "support-ticket-alert",
    bodyText: textLines.join("\n"),
    bodyHtml: receiptDocument({
      title: `New Support Request: ${input.subject}`,
      kicker: "Support request",
      heading: `New support request: ${input.subject}`,
      body: htmlBlocks,
    }),
    outboxCopy: {
      subject: sanitizeHeaderValue(`[${input.categoryLabel}] New support request (${input.reference})`),
      bodyText: outboxText.join("\n"),
      bodyHtml: htmlDocument(`New support request ${input.reference}`, outboxHtml),
    },
  };
}
