import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";

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

  const htmlParagraphs: string[] = [
    `<strong>Ticket Reference:</strong> ${escapeHtml(input.reference)}`,
    `<strong>Category:</strong> ${escapeHtml(input.categoryLabel)}`,
    `<strong>Subject:</strong> ${escapeHtml(input.subject)}`,
    `<strong>Requester:</strong> ${escapeHtml(requester)}`,
  ];

  if (input.requesterPhone) {
    htmlParagraphs.push(`<strong>Phone:</strong> ${escapeHtml(input.requesterPhone)}`);
  }
  if (input.businessName) {
    htmlParagraphs.push(`<strong>Business:</strong> ${escapeHtml(input.businessName)} (ID: ${escapeHtml(input.businessId ?? "n/a")})`);
  }
  if (input.browserDevice) {
    htmlParagraphs.push(`<strong>Browser / Device:</strong> ${escapeHtml(input.browserDevice)}`);
  }
  if (input.attachmentCount && input.attachmentCount > 0) {
    htmlParagraphs.push(`<strong>Attachments:</strong> ${input.attachmentCount} screenshot(s) attached`);
  }

  htmlParagraphs.push(
    `<strong>Message:</strong><br /><div style="margin-top:8px;padding:12px;background:#efe4d6;border-radius:8px;white-space:pre-wrap">${escapeHtml(input.description)}</div>`,
  );

  if (input.details && Object.keys(input.details).length > 0) {
    const detailRows = Object.entries(input.details)
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</li>`)
      .join("");
    if (detailRows) {
      htmlParagraphs.push(`<strong>Category Details:</strong><ul>${detailRows}</ul>`);
    }
  }

  if (adminUrl) {
    htmlParagraphs.push(
      `<a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:10px 20px;background:#2a0d10;color:#f6efe6;text-decoration:none;border-radius:20px;font-weight:600">Open in Admin Console</a>`,
    );
  }

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
    bodyHtml: htmlDocument(`New Support Request: ${input.subject}`, htmlParagraphs),
    outboxCopy: {
      subject: sanitizeHeaderValue(`[${input.categoryLabel}] New support request (${input.reference})`),
      bodyText: outboxText.join("\n"),
      bodyHtml: htmlDocument(`New support request ${input.reference}`, outboxHtml),
    },
  };
}
