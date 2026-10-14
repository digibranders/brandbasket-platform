/**
 * A business's own website as its owner types it on the Business profile's Details tab: "sunrisebakery.in",
 * "www.sunrisebakery.in" or a full address. Browser-safe. Stored as a full http(s) address, which is what the database accepts and the directory
 * links to.
 */
export const LISTING_WEBSITE_MAX_LENGTH = 300;

export type ListingWebsiteResult =
  | { readonly ok: true; /** Null clears the website. */ readonly url: string | null }
  | { readonly ok: false; readonly message: string };

const INVALID = "Enter your website's address, like yourbusiness.com.";
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function parseListingWebsite(typed: string): ListingWebsiteResult {
  const value = typed.trim();
  if (value === "") return { ok: true, url: null };
  if (/\s/.test(value)) return { ok: false, message: INVALID };

  let parsed: URL;
  try {
    // "yourbusiness.com" has no scheme; "mailto:me@x.com" and "javascript:…" have one, and are refused below.
    parsed = new URL(HAS_SCHEME.test(value) ? value : `https://${value}`);
  } catch {
    return { ok: false, message: INVALID };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { ok: false, message: INVALID };
  // A sign-in hidden in the address ("https://firstfold.io@evil.example") is how a link pretends to be another site.
  if (parsed.username !== "" || parsed.password !== "") return { ok: false, message: INVALID };
  // A real site has a dotted name: not "localhost", not a bare word.
  if (!/^[^.]+(\.[^.]+)+$/.test(parsed.hostname)) return { ok: false, message: INVALID };
  if (parsed.href.length > LISTING_WEBSITE_MAX_LENGTH) return { ok: false, message: "That address is too long." };
  return { ok: true, url: parsed.href };
}
