import { cleanMultiline } from "@fynix/shared/lib/validation/text";
import { OWNER_REPLY_TEXT_MAX_LENGTH } from "@/lib/directory-api";

/** The most an answer may be (lib/directory-api.ts); named here for the dashboard's own forms. */
export const OWNER_REPLY_MAX_LENGTH = OWNER_REPLY_TEXT_MAX_LENGTH;

/**
 * What an owner types as an answer to a review, checked: the same cleaning as every other free text (control characters
 * out, line breaks kept), then not empty and not longer than OWNER_REPLY_TEXT_MAX_LENGTH characters. Characters are
 * counted as people see them, so an emoji is one, which is also how the table's CHECK counts them.
 */
export const OWNER_REPLY_MISSING_MESSAGE = "Write your reply.";
export const OWNER_REPLY_TOO_LONG_MESSAGE = `Keep your reply to ${OWNER_REPLY_TEXT_MAX_LENGTH} characters.`;

export type OwnerReplyText = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly message: string };

export function parseOwnerReplyText(raw: string): OwnerReplyText {
  const text = cleanMultiline(raw);
  if (text === "") return { ok: false, message: OWNER_REPLY_MISSING_MESSAGE };
  if (Array.from(text).length > OWNER_REPLY_TEXT_MAX_LENGTH) return { ok: false, message: OWNER_REPLY_TOO_LONG_MESSAGE };
  return { ok: true, text };
}

/** Where an owner reads and answers their reviews in the dashboard. */
export const REVIEWS_PATH = "/reviews";

/** How many reviews one page of the dashboard's Reviews lists, newest first. */
export const REVIEWS_PER_PAGE = 10;

/** The `?filter=` asked for: only the reviews still waiting for an answer, or every review. */
export function requestedReviewFilter(raw: string | readonly string[] | undefined): "all" | "unanswered" {
  const value = typeof raw === "string" ? raw : raw?.[0];
  return value === "unanswered" ? "unanswered" : "all";
}

/**
 * Whether a request's `Origin` is the website's own. fynix.digital redirects to www.fynix.digital, so a visitor's browser
 * sends whichever of the two it ended on: the website's origin and its twin (the same scheme and port, the host with
 * or without a leading "www.") both count, and nothing else does.
 */
export function websiteOriginAllowed(requestOrigin: string | null, websiteOrigin: string): boolean {
  if (requestOrigin === null) return false;
  if (requestOrigin === websiteOrigin) return true;
  try {
    const asked = new URL(requestOrigin);
    const own = new URL(websiteOrigin);
    // `origin` is "null" for an opaque origin, and a path or credentials make it not an origin at all.
    if (asked.origin !== requestOrigin || asked.protocol !== own.protocol || asked.port !== own.port) return false;
    return withoutWww(asked.hostname) === withoutWww(own.hostname);
  } catch {
    return false;
  }
}

function withoutWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice("www.".length) : hostname;
}

/**
 * The headers that let the website's own page call the owner routes from the browser with the dashboard's session
 * cookie: only that origin or its www twin (never `*`, which a credentialed request refuses anyway), and `Vary: Origin` so no cache
 * serves one origin's answer to another. A request from any other origin, or with none, gets no CORS headers, so the
 * browser withholds the answer from the page that asked. Same-site by the parent domain (fynix.digital), so the
 * session cookie is sent.
 */
export function ownerCorsHeaders(requestOrigin: string | null, websiteOrigin: string): Readonly<Record<string, string>> {
  const base = { Vary: "Origin" };
  if (requestOrigin === null || !websiteOriginAllowed(requestOrigin, websiteOrigin)) return base;
  return {
    ...base,
    "Access-Control-Allow-Origin": requestOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
  };
}
