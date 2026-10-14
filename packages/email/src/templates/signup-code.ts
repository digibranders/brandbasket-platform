import { escapeHtml, htmlDocument, sanitizeHeaderValue, withheldCodeCopy, type EmailMessage } from "../message";
import { emailBrandName } from "../brand";

export interface SignupCodeInput {
  readonly to: string;
  /** The six digits the person types back into the sign-up form. */
  readonly code: string;
  readonly expiresInMinutes: number;
  /** What the email calls the product: the deployment's brand (PLATFORM_BRAND; Firstfold when unset) unless the dashboard is sold under another name. */
  readonly brandName?: string;
}

const SIX_DIGITS = /^[0-9]{6}$/;

/**
 * Sent when someone creates an account with an email address: the code that proves the address is theirs. The account
 * is only opened once they type it back. The outbox keeps a copy without the code (anyone who reads it could otherwise
 * open an account under that address), and the subject never carries it.
 */
export function signupCodeEmail(input: SignupCodeInput): EmailMessage {
  if (!SIX_DIGITS.test(input.code)) throw new Error("code must be exactly six digits");
  const brand = input.brandName ?? emailBrandName();
  const subject = `Your ${brand} verification code`;
  const intro = `Your ${brand} verification code is:`;
  const validity = `It works once and expires in ${input.expiresInMinutes} minutes. Don't share it with anyone.`;
  const ignore = `If you didn't ask for this, you can ignore this email: no ${brand} account is opened without the code.`;
  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "signup-code",
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
