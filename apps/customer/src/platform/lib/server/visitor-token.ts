import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** How long a visitor stays recognised without coming back; every use issues a fresh token, so it slides. */
export const VISITOR_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const TOKEN_LABEL = "visitor-token:v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signature(visitorId: string, expiresAtSeconds: number, secret: string): string {
  return createHmac("sha256", secret).update(`${TOKEN_LABEL}:${visitorId}.${expiresAtSeconds}`).digest("base64url");
}

/**
 * A token the website keeps for a visitor whose number has been proven: `<visitor id>.<expiry>.<signature>`, signed
 * with a key only the platform holds. It names the visitor and says nothing else; the name and number are read from
 * the account when it is used. The website cannot forge or extend one, which is what lets a visitor skip the code.
 */
export function issueVisitorToken(visitorId: string, now: Date, secret: string): string {
  const expiresAtSeconds = Math.floor(now.getTime() / 1000) + VISITOR_TOKEN_TTL_SECONDS;
  return `${visitorId}.${expiresAtSeconds}.${signature(visitorId, expiresAtSeconds, secret)}`;
}

/** The visitor id a token names, or null when it is malformed, forged or past its expiry. */
export function verifyVisitorToken(token: string, now: Date, secret: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [visitorId, expiry, given] = parts as [string, string, string];
  if (!UUID.test(visitorId) || !/^\d{1,12}$/.test(expiry)) return null;
  const expiresAtSeconds = Number(expiry);
  if (expiresAtSeconds * 1000 <= now.getTime()) return null;
  const expected = Buffer.from(signature(visitorId, expiresAtSeconds, secret));
  const candidate = Buffer.from(given);
  return expected.length === candidate.length && timingSafeEqual(expected, candidate) ? visitorId : null;
}
