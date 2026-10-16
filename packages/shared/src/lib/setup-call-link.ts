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
