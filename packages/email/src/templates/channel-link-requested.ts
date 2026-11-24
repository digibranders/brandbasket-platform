import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph, receiptRows } from "../receipt";

export interface ChannelLinkRequestedInput {
  readonly to: string;
  readonly businessName: string;
  readonly network: "instagram" | "facebook";
  /** The profile link as the customer sent it, cleaned. */
  readonly profileUrl: string;
  /** The account name read from the link. */
  readonly handle: string;
  /** Who sent it, as the account knows them. */
  readonly requesterName: string;
  readonly requesterEmail: string;
  /** Where the team answers it: the clients list in the admin app. */
  readonly adminUrl: string;
}

const NETWORK_NAMES = { instagram: "Instagram", facebook: "Facebook" } as const;

/** Internal notification: a customer sent the link to a profile so the team can set the account up with them. */
export function channelLinkRequestedEmail(input: ChannelLinkRequestedInput): EmailMessage {
  const profileUrl = assertWebUrl(input.profileUrl, "profileUrl");
  const adminUrl = assertWebUrl(input.adminUrl, "adminUrl");
  const network = NETWORK_NAMES[input.network];
  const lines = [
    `${input.businessName} sent the link to their ${network} profile, so you can set it up with them.`,
    `Account: ${input.handle}`,
    `Link: ${profileUrl}`,
    `Sent by: ${input.requesterName} (${input.requesterEmail})`,
    `Add them as a tester, then mark the request invited: ${adminUrl}`,
  ];
  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`${network} link from ${input.businessName}`),
    template: "channel-link-requested",
    bodyText: lines.join("\n"),
    bodyHtml: receiptDocument({
      title: `${network} link from ${input.businessName}`,
      kicker: `${network} profile link`,
      heading: input.businessName,
      body: [
        receiptParagraph(lines[0] ?? ""),
        receiptRows([
          { label: "Account", value: input.handle },
          { label: "Link", value: profileUrl },
          { label: "Sent by", value: `${input.requesterName} (${input.requesterEmail})` },
        ]),
        receiptButton(adminUrl, "Open the requests"),
      ],
    }),
  };
}
