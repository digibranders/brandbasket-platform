import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { LEADS_API_AUTH_HEADER, LEADS_API_TOKEN_MIN_LENGTH } from "@/lib/leads-api";

/**
 * The marketing website's server authenticates to the platform with one shared secret, LEADS_API_TOKEN, sent as
 * `Authorization: Bearer <token>`: the Get started form (POST /api/leads) and the local directory's ratings, reviews
 * and enquiries (/api/directory/*) all use it.
 */

/** The shared secret, or null when it is unset or too short to be one (the routes then refuse every request). */
export function leadsApiToken(): string | null {
  const token = process.env.LEADS_API_TOKEN?.trim() ?? "";
  return token.length >= LEADS_API_TOKEN_MIN_LENGTH ? token : null;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Compares digests so neither the length nor the content of the secret leaks through timing. */
export function hasValidWebsiteToken(request: Request, token: string): boolean {
  const header = request.headers.get(LEADS_API_AUTH_HEADER) ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (match?.[1] === undefined) return false;
  return timingSafeEqual(digest(match[1]), digest(token));
}
