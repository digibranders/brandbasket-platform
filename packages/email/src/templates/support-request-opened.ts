import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";
import { emailBrandName } from "../brand";

export interface SupportRequestOpenedInput {
  readonly to: string;
  readonly businessName: string;
  /** The request's subject, written by staff. */
  readonly subject: string;
  /** The request on the customer dashboard, where they can read it and reply. */
  readonly requestUrl: string;
}

/** Sent when staff open a request on a customer's behalf, usually after a call, so the customer can follow it. */
export function supportRequestOpenedEmail(input: SupportRequestOpenedInput): EmailMessage {
  const brand = emailBrandName();
  const requestUrl = assertWebUrl(input.requestUrl, "requestUrl");
  const title = `We opened a request for ${input.businessName}`;
  const intro = `After talking with you, the ${brand} team opened a request for ${input.businessName}: ${input.subject}.`;
  const follow = "You can read it, add anything we missed and see when it is done here:";
  const outro = "You don't need to do anything else. We'll write to you when there is news.";

  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`${title}: ${input.subject}`),
    template: "support-request-opened",
    bodyText: [intro, follow, requestUrl, outro].join("\n\n"),
    bodyHtml: htmlDocument(title, [escapeHtml(intro), escapeHtml(follow), `<a href="${escapeHtml(requestUrl)}">${escapeHtml(requestUrl)}</a>`, escapeHtml(outro)]),
  };
}
