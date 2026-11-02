import { sanitizeHeaderValue, withheldCodeCopy, type EmailMessage } from "../message";
import { receiptCode, receiptDocument, receiptParagraph } from "../receipt";
import { emailBrandName } from "../brand";

export interface StaffSignInCodeInput {
  readonly to: string;
  /** The six digits typed back into the console's sign-in. */
  readonly code: string;
  readonly expiresInMinutes: number;
}

const SIX_DIGITS = /^[0-9]{6}$/;

/**
 * Sent when a staff member's password was right: the code that finishes their console sign-in. The outbox keeps a copy
 * without the code (anyone who reads it could otherwise finish the sign-in), and the subject never carries it.
 */
export function staffSignInCodeEmail(input: StaffSignInCodeInput): EmailMessage {
  if (!SIX_DIGITS.test(input.code)) throw new Error("code must be exactly six digits");
  const brand = emailBrandName();
  const subject = `Your ${brand} console sign-in code`;
  const intro = `Your ${brand} console sign-in code is:`;
  const validity = `It works once and expires in ${input.expiresInMinutes} minutes. Don't share it with anyone.`;
  const ignore = "If you didn't just sign in, change your password: someone has it.";
  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "staff-sign-in-code",
    bodyText: [intro, input.code, validity, ignore].join("\n\n"),
    bodyHtml: receiptDocument({
      title: subject,
      kicker: "Sign-in code",
      heading: subject,
      body: [receiptParagraph(intro), receiptCode(input.code), receiptParagraph(validity)],
      footer: [ignore],
    }),
    outboxCopy: withheldCodeCopy(subject, [intro, validity, ignore]),
  };
}
