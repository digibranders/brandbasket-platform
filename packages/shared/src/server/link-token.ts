import { createHash, randomBytes } from "node:crypto";

/**
 * Payment link tokens (docs/plans/65): 32 random bytes, base64url, shown once to staff in the link's address. Only the SHA-256 hash is
 * ever stored, so a database read cannot rebuild a link.
 */
export function newLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A token as the address carries it: 43 base64url characters. Anything else cannot be one of ours, so it is never looked up. */
export function looksLikeLinkToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}
