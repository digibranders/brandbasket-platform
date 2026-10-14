/*
 * An account opened with a phone number has no email address, but Better Auth signs in and looks accounts up by one.
 * Such an account holds a placeholder made from its number, under a domain that can never receive mail (.invalid is
 * reserved for exactly that, RFC 2606). Anything about to write to an account's address asks isPhoneAccountEmail
 * first; anything showing the account shows its number instead.
 */

const PLACEHOLDER_DOMAIN = "phone.fynix.invalid";
const E164 = /^\+[0-9]{8,15}$/;

/** The placeholder address for the account that signs in with `phone` (E.164). */
export function phoneAccountEmail(phone: string): string {
  if (!E164.test(phone)) throw new RangeError("A phone account's number must be E.164.");
  return `${phone.slice(1)}@${PLACEHOLDER_DOMAIN}`;
}

/** True for a placeholder address: there is nobody to write to. */
export function isPhoneAccountEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${PLACEHOLDER_DOMAIN}`);
}
