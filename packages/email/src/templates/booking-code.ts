import { escapeHtml, htmlDocument, sanitizeHeaderValue, withheldCodeCopy, type EmailMessage } from "../message";
import { emailBrandName } from "../brand";

export interface BookingCodeInput {
  readonly to: string;
  /** The six digits the patient types back into the booking page. */
  readonly code: string;
  readonly expiresInMinutes: number;
}

const SIX_DIGITS = /^[0-9]{6}$/;

/**
 * Sent when a patient asks to book an appointment on a clinic's website: the code that proves the address is theirs. The
 * appointment is only booked once they type it back. The outbox keeps a copy without the code (anyone who reads it could
 * otherwise book under that address), and the subject never carries it.
 */
export function bookingCodeEmail(input: BookingCodeInput): EmailMessage {
  if (!SIX_DIGITS.test(input.code)) throw new Error("code must be exactly six digits");
  const brand = emailBrandName();
  const subject = "Your appointment confirmation code";
  const intro = "Your appointment confirmation code is:";
  const validity = `It works once and expires in ${input.expiresInMinutes} minutes. Don't share it with anyone.`;
  const ignore = `If you didn't ask to book an appointment, you can ignore this email: nothing is booked without the code. Sent by ${brand} for the clinic's booking page.`;
  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "booking-code",
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
