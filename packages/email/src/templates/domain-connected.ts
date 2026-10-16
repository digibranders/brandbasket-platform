import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";

export interface DomainConnectedInput {
  readonly to: string;
  readonly businessName: string;
  readonly domain: string;
  readonly clientUrl: string;
}

/** Internal notification: a customer's DNS now points at the website, so it can be marked live. */
export function domainConnectedEmail(input: DomainConnectedInput): EmailMessage {
  const clientUrl = assertWebUrl(input.clientUrl, "clientUrl");
  const lines = [
    `${input.businessName} has pointed ${input.domain} at the website.`,
    "Check it loads at their address, then mark it live.",
    `Open the client: ${clientUrl}`,
  ];

  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`${input.businessName}'s domain is connected`),
    template: "domain-connected",
    bodyText: lines.join("\n"),
    bodyHtml: htmlDocument(`${input.businessName}'s domain is connected`, [
      escapeHtml(lines[0] ?? ""),
      escapeHtml(lines[1] ?? ""),
      `<a href="${escapeHtml(clientUrl)}">Open the client</a> (${escapeHtml(clientUrl)})`,
    ]),
  };
}
