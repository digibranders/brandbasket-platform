import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";

export interface DomainRequestedInput {
  readonly to: string;
  readonly businessName: string;
  readonly domain: string;
  readonly clientUrl: string;
}

/** Internal notification: a live customer asked to move their website to a domain of their own. */
export function domainRequestedEmail(input: DomainRequestedInput): EmailMessage {
  const clientUrl = assertWebUrl(input.clientUrl, "clientUrl");
  const lines = [
    `${input.businessName} would like their website on ${input.domain}.`,
    "Add the domain to their Vercel project, then ask them to connect it from the client page.",
    `Open the client: ${clientUrl}`,
  ];

  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`${input.businessName} wants to move to ${input.domain}`),
    template: "domain-requested",
    bodyText: lines.join("\n"),
    bodyHtml: htmlDocument(`${input.businessName} wants to move to ${input.domain}`, [
      escapeHtml(lines[0] ?? ""),
      escapeHtml(lines[1] ?? ""),
      `<a href="${escapeHtml(clientUrl)}">Open the client</a> (${escapeHtml(clientUrl)})`,
    ]),
  };
}
