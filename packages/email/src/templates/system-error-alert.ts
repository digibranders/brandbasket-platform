import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptRows, type ReceiptRow } from "../receipt";

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

  const rows: ReceiptRow[] = [
    { label: "App", value: input.app },
    { label: "Severity", value: input.severity.toUpperCase(), strong: true },
    { label: "Error class", value: input.errorClass },
    { label: "Route / area", value: input.route },
    { label: "Operation", value: input.operation },
    ...(input.eventId ? [{ label: "Event ID", value: input.eventId }] : []),
    ...(input.release ? [{ label: "Release", value: input.release }] : []),
    ...(input.browser ? [{ label: "Browser / environment", value: input.browser }] : []),
  ];

  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`[System Error] ${input.errorClass} on ${input.route} (${input.app})`),
    template: "system-error-alert",
    bodyText: textLines.join("\n"),
    bodyHtml: receiptDocument({
      title: `System Error: ${input.errorClass}`,
      kicker: "System error",
      heading: `System error: ${input.errorClass}`,
      body: [receiptRows(rows, { labelWidth: 150 }), ...(adminUrl ? [receiptButton(adminUrl, "Open in Admin Errors")] : [])],
    }),
  };
}
