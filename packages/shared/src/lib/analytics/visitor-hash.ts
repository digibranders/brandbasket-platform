import { createHash } from "node:crypto";

export interface VisitorHashInput {
  /** The day's random salt. It is deleted after two days, which is what stops a visitor being followed across days. */
  readonly salt: string;
  readonly businessId: string;
  readonly ip: string;
  readonly userAgent: string;
}

/**
 * A name for "the same browser today", with no way back to the address or the browser: the first 16 bytes of a SHA-256 over
 * the day's salt, the business, the address and the user agent, in hex. The salt and the business make it unlinkable
 * across days and across sites. The caller discards the address and the user agent as soon as this is made.
 */
export function visitorHash({ salt, businessId, ip, userAgent }: VisitorHashInput): string {
  if (salt === "") throw new RangeError("The day's salt must not be empty");
  return createHash("sha256").update([salt, businessId, ip, userAgent].join("\0")).digest("hex").slice(0, 32);
}
