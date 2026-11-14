/**
 * The link a customer follows to book a short call about setting up their website (docs/superpowers/specs/2026-10-15-setup-
 * call-link.md): a Calendly or similar page. Staff set it in the console, so changing it needs no developer and no deploy. A
 * setting with no value means there is no link, and the dashboard shows no call card. Pure and browser-safe.
 */

/** The name the setting is stored under (site_settings.key). */
export const SETUP_CALL_URL_KEY = "setup_call_url";

/** The name of the box the console's Settings form posts the link in. */
export const SETUP_CALL_URL_FIELD = "setupCallUrl";

export const MAX_SETUP_CALL_URL_LENGTH = 300;

export type SetupCallUrlProblem = "not-a-web-address" | "not-secure" | "too-long" | "has-a-login";

/** What was typed, read: nothing typed clears the link; an address is checked; anything else says what is wrong with it. */
export type SetupCallUrlReading = { readonly ok: true; readonly url: string | null } | { readonly ok: false; readonly problem: SetupCallUrlProblem };

/**
 * Reads the text staff typed. Only an https address is kept: it is put in a link on the customer's dashboard, so a
 * `javascript:` or `http:` address is refused, and so is one with a user name or password in it. Surrounding spaces are
 * dropped and the address is stored as the browser would write it.
 */
export function readSetupCallUrl(input: string): SetupCallUrlReading {
  const text = input.trim();
  if (text === "") return { ok: true, url: null };
  if (text.length > MAX_SETUP_CALL_URL_LENGTH) return { ok: false, problem: "too-long" };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, problem: "not-a-web-address" };
  }
  if (url.protocol !== "https:") return { ok: false, problem: url.protocol === "http:" ? "not-secure" : "not-a-web-address" };
  if (url.username !== "" || url.password !== "") return { ok: false, problem: "has-a-login" };
  if (url.hostname.indexOf(".") === -1) return { ok: false, problem: "not-a-web-address" };
  return { ok: true, url: url.toString() };
}

export const SETUP_CALL_URL_PROBLEMS: Readonly<Record<SetupCallUrlProblem, string>> = {
  "not-a-web-address": "That isn't a web address. Paste the full link, starting with https://.",
  "not-secure": "Use the secure address, starting with https://, not http://.",
  "too-long": `That link is too long. Keep it under ${MAX_SETUP_CALL_URL_LENGTH} characters.`,
  "has-a-login": "Take the user name and password out of the link. A booking link never needs them.",
};

/**
 * Whether the booking page is a Calendly one, which the dashboard can show inside the page. Anything else is a plain link
 * that opens in a new tab: only Calendly's own script is loaded on the dashboard, never another site's.
 */
export function isCalendlyUrl(address: string): boolean {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return false;
  }
  return url.protocol === "https:" && (url.hostname === "calendly.com" || url.hostname.endsWith(".calendly.com"));
}

export const MAX_INVITEE_URI_LENGTH = 300;

/**
 * Calendly's link for one booking (the invitee), as its page reports it when a time is picked, or null for anything that is
 * not one. It arrives from the customer's browser, so only an https address on Calendly's API host, of a sane length, is
 * kept; it is stored to find the booking again and is never followed.
 */
export function readInviteeUri(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_INVITEE_URI_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === "https:" && url.hostname === "api.calendly.com" && url.username === "" && url.password === "" ? url.toString() : null;
}

const CALCOM_BOOKING_API_PATTERN = /^https:\/\/api\.cal\.com\/(?:v\d+\/)?bookings\/([A-Za-z0-9_\\-]{1,64})$/;

function extractDirectVideoUrl(candidate: string): string | null {
  let url: URL;
  try {
    url = new URL(candidate.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  const host = url.hostname.toLowerCase();
  if (host === "meet.google.com") return url.toString();
  if (host === "zoom.us" || host.endsWith(".zoom.us") || host === "zoom.gov" || host.endsWith(".zoom.gov")) return url.toString();
  if (host === "app.cal.com" && url.pathname.startsWith("/video/")) return url.toString();
  if (host === "teams.microsoft.com" || host === "teams.live.com") return url.toString();
  if (host === "whereby.com" || host.endsWith(".whereby.com")) return url.toString();
  return null;
}

function resolveVideoCandidate(raw: string): string | null {
  const text = raw.trim();
  if (text === "") return null;
  const calcomMatch = CALCOM_BOOKING_API_PATTERN.exec(text);
  if (calcomMatch && calcomMatch[1]) {
    return `https://app.cal.com/video/${calcomMatch[1]}`;
  }
  return extractDirectVideoUrl(text);
}

/**
 * Resolves the video meeting join link from a stored booking inviteeUri and an optional fallback URL.
 * Cal.com booking API links (https://api.cal.com/v2/bookings/:uid) are translated to their video room
 * (https://app.cal.com/video/:uid). Direct video meeting links (Google Meet, Cal.com Video, Zoom, Teams,
 * Whereby) are returned directly. When inviteeUri is missing or not a meeting link, fallbackUrl from settings
 * is used. Pure and browser-safe.
 */
export function kickoffMeetingLink(inviteeUri?: string | null, fallbackUrl?: string | null): string | null {
  if (typeof inviteeUri === "string" && inviteeUri.trim() !== "") {
    const resolved = resolveVideoCandidate(inviteeUri);
    if (resolved !== null) return resolved;
  }
  if (typeof fallbackUrl === "string" && fallbackUrl.trim() !== "") {
    const resolvedFallback = resolveVideoCandidate(fallbackUrl);
    if (resolvedFallback !== null) return resolvedFallback;
    try {
      const url = new URL(fallbackUrl.trim());
      if (url.protocol === "https:" && url.username === "" && url.password === "") {
        return url.toString();
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Formats a start and end moment into an exact timing window (for example: "3:30 PM to 4:00 PM").
 * If only startsAt is provided, returns the formatted start time.
 */
export function formatTimingWindow(startsAt: Date, endsAt: Date | null, timeZone = "Asia/Kolkata"): string {
  if (Number.isNaN(startsAt.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
  const startStr = formatter.format(startsAt);
  if (endsAt === null || Number.isNaN(endsAt.getTime())) {
    return startStr;
  }
  const endStr = formatter.format(endsAt);
  return `${startStr} to ${endStr}`;
}

