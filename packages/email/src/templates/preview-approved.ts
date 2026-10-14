import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";

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
    bodyHtml: htmlDocument(`${input.businessName} approved their preview`, [
      escapeHtml(lines[0] ?? ""),
      `<a href="${escapeHtml(clientUrl)}">Open the client</a> (${escapeHtml(clientUrl)})`,
    ]),
  };
}
