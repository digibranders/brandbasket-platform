import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";

export interface SystemErrorAlertInput {
  readonly to: string;
  readonly app: string;
  readonly operation: string;
  readonly errorClass: string;
  readonly route: string;
  readonly severity: string;
  readonly release?: string | null;
  readonly browser?: string | null;
  readonly eventId?: string | null;
  readonly adminUrl?: string | null;
}

export function systemErrorAlertEmail(input: SystemErrorAlertInput): EmailMessage {
  const adminUrl = input.adminUrl ? assertWebUrl(input.adminUrl, "adminUrl") : null;

  const textLines: string[] = [
    `Automated System Error Detected`,
    `App: ${input.app}`,
    `Severity: ${input.severity.toUpperCase()}`,
    `Error Class: ${input.errorClass}`,
    `Route / Area: ${input.route}`,
    `Operation: ${input.operation}`,
  ];

  if (input.eventId) textLines.push(`Event ID: ${input.eventId}`);
  if (input.release) textLines.push(`Release: ${input.release}`);
  if (input.browser) textLines.push(`Browser / Environment: ${input.browser}`);
  if (adminUrl) textLines.push("", `View in Admin Errors: ${adminUrl}`);

  const htmlParagraphs: string[] = [
    `<strong>App:</strong> ${escapeHtml(input.app)}`,
    `<strong>Severity:</strong> <span style="color:#63001e;font-weight:bold">${escapeHtml(input.severity.toUpperCase())}</span>`,
    `<strong>Error Class:</strong> ${escapeHtml(input.errorClass)}`,
    `<strong>Route / Area:</strong> ${escapeHtml(input.route)}`,
    `<strong>Operation:</strong> ${escapeHtml(input.operation)}`,
  ];

  if (input.eventId) htmlParagraphs.push(`<strong>Event ID:</strong> ${escapeHtml(input.eventId)}`);
  if (input.release) htmlParagraphs.push(`<strong>Release:</strong> ${escapeHtml(input.release)}`);
  if (input.browser) htmlParagraphs.push(`<strong>Browser / Environment:</strong> ${escapeHtml(input.browser)}`);

  if (adminUrl) {
    htmlParagraphs.push(
      `<a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:10px 20px;background:#2a0d10;color:#f6efe6;text-decoration:none;border-radius:20px;font-weight:600">Open in Admin Errors</a>`,
    );
  }

  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`[System Error] ${input.errorClass} on ${input.route} (${input.app})`),
    template: "system-error-alert",
    bodyText: textLines.join("\n"),
    bodyHtml: htmlDocument(`System Error: ${input.errorClass}`, htmlParagraphs),
  };
}
