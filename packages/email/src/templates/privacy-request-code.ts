import { escapeHtml, htmlDocument, sanitizeHeaderValue, withheldCodeCopy, type EmailMessage } from "../message";
import { emailBrandName } from "../brand";

export interface PrivacyRequestCodeInput {
  readonly to: string;
  /** The six digits the person types back into the request form. */
  readonly code: string;
  readonly expiresInMinutes: number;
}

const SIX_DIGITS = /^[0-9]{6}$/;

/**
 * Sent when someone makes a privacy request on the website (access, correction, erasure, a grievance...): the code that
 * proves the address is theirs. The request is only filed once they type it back. The outbox keeps a copy without the
 * code (anyone who reads it could otherwise file a request under that address), and the subject never carries it.
 */
export function privacyRequestCodeEmail(input: PrivacyRequestCodeInput): EmailMessage {
  if (!SIX_DIGITS.test(input.code)) throw new Error("code must be exactly six digits");
  const brand = emailBrandName();
  const subject = "Your privacy request confirmation code";
  const intro = "Your privacy request confirmation code is:";
  const validity = `It works once and expires in ${input.expiresInMinutes} minutes. Don't share it with anyone.`;
  const ignore = `If you didn't make a privacy request, you can ignore this email: nothing is filed without the code. Sent by ${brand}.`;
  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "privacy-request-code",
    bodyText: [intro, input.code, validity, ignore].join("\n\n"),
    bodyHtml: htmlDocument(subject, [
      escapeHtml(intro),
      `<span style="display:inline-block;font-size:28px;font-weight:600;letter-spacing:0.3em;font-variant-numeric:tabular-nums">${escapeHtml(input.code)}</span>`,
      escapeHtml(validity),
      escapeHtml(ignore),
    ]),
    outboxCopy: withheldCodeCopy(subject, [intro, validity, ignore]),
  };
}
