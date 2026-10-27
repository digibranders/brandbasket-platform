import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";

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
    bodyHtml: receiptDocument({
      title: `${input.businessName} wants to move to ${input.domain}`,
      kicker: "Domain requested",
      heading: `${input.businessName} wants to move to ${input.domain}`,
      body: [receiptParagraph(lines[0] ?? ""), receiptParagraph(lines[1] ?? ""), receiptButton(clientUrl, "Open the client")],
    }),
  };
}
