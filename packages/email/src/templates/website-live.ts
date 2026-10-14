import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";
import { emailBrandName } from "../brand";

export interface WebsiteLiveInput {
  readonly to: string;
  readonly businessName: string;
  readonly websiteUrl: string;
}

/** Sent when staff mark a customer's project live: their website is now up at its real address. */
export function websiteLiveEmail(input: WebsiteLiveInput): EmailMessage {
  const brand = emailBrandName();
  const websiteUrl = assertWebUrl(input.websiteUrl, "websiteUrl");
  const intro = `${input.businessName} is live:`;
  const outro = "Ask for any change from your dashboard, any time.";
  const lines = [intro, websiteUrl, outro];

  return {
    to: sanitizeHeaderValue(input.to),
    subject: `Your ${brand} website is live`,
    template: "website-live",
    bodyText: lines.join("\n\n"),
    bodyHtml: htmlDocument(`Your ${brand} website is live`, [
      escapeHtml(intro),
      `<a href="${escapeHtml(websiteUrl)}">${escapeHtml(websiteUrl)}</a>`,
      escapeHtml(outro),
    ]),
  };
}
