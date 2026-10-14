import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";

export interface LeadReceivedInput {
  readonly to: string;
  readonly name: string;
  readonly businessName: string;
  readonly businessType: string;
  readonly email: string;
  readonly phone: string;
  readonly message: string | null;
  readonly leadUrl: string;
}

/** Internal notification: everything needed to call the lead back. */
export function leadReceivedEmail(input: LeadReceivedInput): EmailMessage {
  const leadUrl = assertWebUrl(input.leadUrl, "leadUrl");
  const lines = [
    `${input.name} got in touch about ${input.businessName}.`,
    `Business type: ${input.businessType}`,
    `Email: ${input.email}`,
    `Phone: ${input.phone}`,
    input.message === null ? "No message." : `Message: ${input.message}`,
    `Open the lead: ${leadUrl}`,
  ];

  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`New lead: ${input.businessName}`),
    template: "lead-received",
    bodyText: lines.join("\n"),
    bodyHtml: htmlDocument(`New lead: ${input.businessName}`, [
      ...lines.slice(0, -1).map((line) => escapeHtml(line)),
      `<a href="${escapeHtml(leadUrl)}">Open the lead</a> (${escapeHtml(leadUrl)})`,
    ]),
  };
}
