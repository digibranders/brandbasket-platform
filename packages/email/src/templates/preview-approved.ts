import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";

export interface PreviewApprovedInput {
  readonly to: string;
  readonly businessName: string;
  readonly clientUrl: string;
}

/** Internal notification: a customer approved their preview, ready to move toward launch. */
export function previewApprovedEmail(input: PreviewApprovedInput): EmailMessage {
  const clientUrl = assertWebUrl(input.clientUrl, "clientUrl");
  const lines = [`${input.businessName} approved their preview.`, `Open the client: ${clientUrl}`];

  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`${input.businessName} approved their preview`),
    template: "preview-approved",
    bodyText: lines.join("\n"),
    bodyHtml: receiptDocument({
      title: `${input.businessName} approved their preview`,
      kicker: "Preview approved",
      heading: `${input.businessName} approved their preview`,
      body: [receiptParagraph(lines[0] ?? ""), receiptButton(clientUrl, "Open the client")],
    }),
  };
}
