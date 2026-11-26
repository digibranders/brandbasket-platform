import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";

/** Where a customer's profile link stands: we have it, it is her turn, we could not set it up, or the account is connected. */
export type ChannelLinkUpdate = "received" | "invited" | "refused" | "connected";

export interface ChannelLinkUpdateInput {
  readonly to: string;
  readonly name: string;
  readonly network: "instagram" | "facebook";
  /** The account name read from her link. */
  readonly handle: string;
  readonly update: ChannelLinkUpdate;
  /** For `invited`: the steps she follows, already worded for her network and Meta app. */
  readonly steps?: readonly string[];
  /** For `refused`: why the team could not set it up, in words for her. */
  readonly reason?: string | null;
  /** Where she goes: the Social media page. */
  readonly socialUrl: string;
}

const NETWORK_NAMES = { instagram: "Instagram", facebook: "Facebook" } as const;

interface Words {
  readonly subject: string;
  readonly heading: string;
  readonly lines: readonly string[];
  readonly button: string;
}

function wordsFor(input: ChannelLinkUpdateInput): Words {
  const network = NETWORK_NAMES[input.network];
  const who = input.network === "instagram" ? `@${input.handle}` : input.handle;
  switch (input.update) {
    case "received":
      return {
        subject: `We got your ${network} link`,
        heading: "We got your link",
        lines: [`Hi ${input.name}, we have the link to ${who}. Our team is reviewing it so you can keep using ${network}.`, "We will email you as soon as it is your turn. You do not need to do anything until then."],
        button: "Open Social media",
      };
    case "invited":
      return {
        subject: `Your ${network} is ready to connect`,
        heading: `Your ${network} is ready to connect`,
        lines: [`Hi ${input.name}, we added you for ${who}. Follow these steps and it is connected:`, ...(input.steps ?? []).map((step, index) => `${index + 1}. ${step}`)],
        button: `Open Social media and press Allow ${network}`,
      };
    case "refused":
      return {
        subject: `We could not set up your ${network}`,
        heading: `We could not set up ${who}`,
        lines: [input.reason ?? "We could not set this account up.", "Check the link, then send it again from Social media."],
        button: "Send a new link",
      };
    case "connected":
      return {
        subject: `Your ${network} is connected`,
        heading: `${network} is connected`,
        lines: [`Hi ${input.name}, ${who} is connected. Your posts can now go to ${network}.`],
        button: "Open Social media",
      };
  }
}

/** A message to the customer about her Instagram or Facebook profile link. Transactional: it is sent whatever her email preferences say. */
export function channelLinkUpdateEmail(input: ChannelLinkUpdateInput): EmailMessage {
  const url = assertWebUrl(input.socialUrl, "socialUrl");
  const words = wordsFor(input);
  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(words.subject),
    template: `channel-link-${input.update}`,
    bodyText: [...words.lines, `${words.button}: ${url}`].join("\n"),
    bodyHtml: receiptDocument({
      title: words.subject,
      kicker: `${NETWORK_NAMES[input.network]} profile link`,
      heading: words.heading,
      body: [...words.lines.map((line) => receiptParagraph(line)), receiptButton(url, words.button)],
    }),
  };
}
