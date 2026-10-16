import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";
import { emailBrandName } from "../brand";

export interface DomainReadyInput {
  readonly to: string;
  readonly businessName: string;
  /** The customer's own domain, as they entered it. */
  readonly domain: string;
  /** The dashboard's "Your domain" page, where the records to add are shown. */
  readonly projectUrl: string;
}

/** Sent when staff have the website ready for the customer's own domain: the one step left is theirs. */
export function domainReadyEmail(input: DomainReadyInput): EmailMessage {
  const brand = emailBrandName();
  const projectUrl = assertWebUrl(input.projectUrl, "projectUrl");
  const intro = `The website for ${input.businessName} is approved and ready to go live on ${input.domain}.`;
  const step = "One last step, and it's yours: add two settings with the company you bought the domain from. We'll show you exactly what to add, with a button to check it worked:";
  const outro = "We never need your login for that company. If you get stuck, reply to this email and we'll walk you through it.";
  const lines = [intro, step, projectUrl, outro];

  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`Connect ${input.domain} to put your ${brand} website live`),
    template: "domain-ready",
    bodyText: lines.join("\n\n"),
    bodyHtml: htmlDocument(`Connect ${input.domain} to put your ${brand} website live`, [
      escapeHtml(intro),
      escapeHtml(step),
      `<a href="${escapeHtml(projectUrl)}">${escapeHtml(projectUrl)}</a>`,
      escapeHtml(outro),
    ]),
  };
}
