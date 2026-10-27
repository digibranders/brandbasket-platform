import { sanitizeHeaderValue, withheldCodeCopy, type EmailMessage } from "../message";
import { receiptCode, receiptDocument, receiptParagraph } from "../receipt";
import { emailBrandName } from "../brand";

export interface SignupCodeInput {
  readonly to: string;
  /** The six digits the person types back into the sign-up form. */
  readonly code: string;
  readonly expiresInMinutes: number;
}

const SIX_DIGITS = /^[0-9]{6}$/;

/**
 * Sent when someone creates an account with an email address: the code that proves the address is theirs. The account
 * is only opened once they type it back. The outbox keeps a copy without the code (anyone who reads it could otherwise
 * open an account under that address), and the subject never carries it.
 */
export function signupCodeEmail(input: SignupCodeInput): EmailMessage {
  if (!SIX_DIGITS.test(input.code)) throw new Error("code must be exactly six digits");
  const brand = emailBrandName();
  const subject = `Your ${brand} verification code`;
  const intro = `Your ${brand} verification code is:`;
  const validity = `It works once and expires in ${input.expiresInMinutes} minutes. Don't share it with anyone.`;
  const ignore = `If you didn't ask for this, you can ignore this email: no ${brand} account is opened without the code.`;
  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "signup-code",
    bodyText: [intro, input.code, validity, ignore].join("\n\n"),
    bodyHtml: receiptDocument({
      title: subject,
      kicker: "Verification code",
      heading: subject,
      body: [receiptParagraph(intro), receiptCode(input.code), receiptParagraph(validity)],
      footer: [ignore],
    }),
    outboxCopy: withheldCodeCopy(subject, [intro, validity, ignore]),
  };
}
