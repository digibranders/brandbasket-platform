import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph, receiptQuote, receiptRows } from "../receipt";

export interface LeadReceivedInput {
  readonly to: string;
  readonly name: string;
  readonly businessName: string;
  readonly businessType: string;
  readonly email: string;
  /** Null when they left no number: the email is what every lead has. */
  readonly phone: string | null;
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
    `Phone: ${input.phone ?? "not given"}`,
    input.message === null ? "No message." : `Message: ${input.message}`,
    `Open the lead: ${leadUrl}`,
  ];

  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`New lead: ${input.businessName}`),
    template: "lead-received",
    bodyText: lines.join("\n"),
    bodyHtml: receiptDocument({
      title: `New lead: ${input.businessName}`,
      kicker: "New lead",
      heading: input.businessName,
      body: [
        receiptParagraph(lines[0] ?? ""),
        receiptRows([
          { label: "Business type", value: input.businessType },
          { label: "Email", value: input.email },
          { label: "Phone", value: input.phone ?? "not given" },
        ]),
        input.message === null ? receiptParagraph("No message.") : receiptQuote(input.message),
        receiptButton(leadUrl, "Open the lead"),
      ],
    }),
  };
}
