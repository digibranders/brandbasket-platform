/**
 * The body of /.well-known/security.txt (RFC 9116): where to report a security problem. It is built per request so
 * the required Expires field always lies in the future.
 */

/** RFC 9116 asks for an expiry under a year away; 180 days keeps it well inside that. */
const EXPIRES_AFTER_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

/** One address, no spaces or line breaks, so the value can't add fields of its own. */
const PLAIN_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SecurityTxtInput {
  readonly email: string;
  readonly now: Date;
}

export function securityTxt({ email, now }: SecurityTxtInput): string {
  if (!PLAIN_EMAIL.test(email)) {
    throw new RangeError("The security contact must be a single plain email address.");
  }
  const expires = new Date(now.getTime() + EXPIRES_AFTER_DAYS * DAY_MS);
  return [`Contact: mailto:${email}`, `Expires: ${expires.toISOString()}`, "Preferred-Languages: en", ""].join("\n");
}
