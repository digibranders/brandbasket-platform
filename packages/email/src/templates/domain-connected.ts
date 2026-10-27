import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";

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
    bodyHtml: receiptDocument({
      title: `${input.businessName}'s domain is connected`,
      kicker: "Domain connected",
      heading: `${input.businessName}'s domain is connected`,
      body: [receiptParagraph(lines[0] ?? ""), receiptParagraph(lines[1] ?? ""), receiptButton(clientUrl, "Open the client")],
    }),
  };
}
