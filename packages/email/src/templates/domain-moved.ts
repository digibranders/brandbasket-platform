import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";
import { emailBrandName } from "../brand";

export interface DomainMovedInput {
  readonly to: string;
  readonly businessName: string;
  readonly websiteUrl: string;
  /** The address it used to be at, which now forwards to the new one. */
  readonly oldHostname: string;
}

/** Sent when staff switch a live customer's website to their own domain. */
export function domainMovedEmail(input: DomainMovedInput): EmailMessage {
  const brand = emailBrandName();
  const websiteUrl = assertWebUrl(input.websiteUrl, "websiteUrl");
  const intro = `${input.businessName} is now on its own domain:`;
  const outro = `Your old address, ${input.oldHostname}, forwards to it, so links you've already shared keep working.`;
  const lines = [intro, websiteUrl, outro];

  return {
    to: sanitizeHeaderValue(input.to),
    subject: `Your ${brand} website has moved to your own domain`,
    template: "domain-moved",
    bodyText: lines.join("\n\n"),
    bodyHtml: htmlDocument(`Your ${brand} website has moved to your own domain`, [
      escapeHtml(intro),
      `<a href="${escapeHtml(websiteUrl)}">${escapeHtml(websiteUrl)}</a>`,
      escapeHtml(outro),
    ]),
  };
}
