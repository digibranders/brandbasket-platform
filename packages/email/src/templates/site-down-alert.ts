import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptRows } from "../receipt";

/*
 * To the team mailbox when a customer's live website has failed two checks in a row after answering (the site health job,
 * plan 61 Phase 12). Sent once per outage. It carries the business, the address and what the checks saw, with a link to the
 * client in the console.
 */

export interface SiteDownAlertInput {
  readonly to: string;
  readonly businessName: string;
  readonly url: string;
  /** When the first failed check of this outage ran, already written out ("3 November 2026, 14:20 IST"). */
  readonly downSince: string;
  /** What the latest check saw: "HTTP 503", "Timed out after 10 seconds". */
  readonly lastResult: string;
  readonly clientUrl: string;
}

export function siteDownAlertEmail(input: SiteDownAlertInput): EmailMessage {
  const clientUrl = assertWebUrl(input.clientUrl, "clientUrl");
  const text = [
    `${input.businessName}'s website is down: ${input.url}`,
    `Down since: ${input.downSince}`,
    `Latest check: ${input.lastResult}`,
    "",
    `Open the client in the console: ${clientUrl}`,
  ];
  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`Website down: ${input.businessName}`),
    template: "site-down-alert",
    bodyText: text.join("\n"),
    bodyHtml: receiptDocument({
      title: `Website down: ${input.businessName}`,
      kicker: "Site health",
      heading: `${input.businessName}'s website is down`,
      body: [
        receiptRows([
          { label: "Business", value: input.businessName },
          { label: "Address", value: input.url },
          { label: "Down since", value: input.downSince },
          { label: "Latest check", value: input.lastResult },
        ]),
        receiptButton(clientUrl, "Open the client"),
      ],
    }),
  };
}
