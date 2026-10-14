/*
 * The Directions box on the Business profile's Details tab (docs/superpowers/specs/2026-10-01-business-profile-
 * design.md): the Google Maps link visitors open to find the business. Browser-safe and pure. Only Google Maps links
 * are taken, stored as https. When the link carries coordinates the map pin is read from it too; a short share link
 * (maps.app.goo.gl) carries none, and is kept as it is.
 */

/** The database keeps links up to this length (directory_business_profiles_maps_url_check). */
export const MAPS_LINK_MAX_LENGTH = 500;

export interface MapsPin {
  readonly latitude: number;
  readonly longitude: number;
}

export type MapsLinkResult =
  | { readonly ok: true; /** Null clears the link. */ readonly url: string | null; readonly pin: MapsPin | null }
  | { readonly ok: false; readonly message: string };

const INVALID = "Paste the link from Google Maps: open your business there, tap Share, then Copy link.";
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** google.com, google.co.in and Google's other country sites. */
const GOOGLE_HOST = /^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/;
const MAPS_GOOGLE_HOST = /^maps\.google\.[a-z]{2,3}(\.[a-z]{2})?$/;
const COORDINATE = String.raw`(-?\d{1,2}(?:\.\d+)?)`;
const LONGITUDE = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
/** The place's own position, in a place link's data part: `!3d<lat>!4d<lng>`. */
const PLACE_PIN = new RegExp(String.raw`!3d${COORDINATE}!4d${LONGITUDE}`);
/** The map's centre: `/@<lat>,<lng>,<zoom>z`. */
const CENTRE_PIN = new RegExp(String.raw`/@${COORDINATE},${LONGITUDE}`);
const PAIR = new RegExp(String.raw`^\s*${COORDINATE}\s*,\s*${LONGITUDE}\s*$`);
const QUERY_KEYS = ["q", "query", "ll", "destination", "daddr"] as const;
/** A generous box around India: a pin outside it is a pasting mistake, never a business we list. */
const INDIA = { south: 6, north: 37.5, west: 68, east: 98 } as const;

function isMapsLink(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === "maps.app.goo.gl") return url.pathname.length > 1;
  if (host === "goo.gl") return url.pathname.startsWith("/maps/");
  if (MAPS_GOOGLE_HOST.test(host)) return true;
  return GOOGLE_HOST.test(host) && (url.pathname === "/maps" || url.pathname.startsWith("/maps/"));
}

function pinOf(latitude: string | undefined, longitude: string | undefined): MapsPin | null {
  if (latitude === undefined || longitude === undefined) return null;
  const pin = { latitude: Number(latitude), longitude: Number(longitude) };
  if (!Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude)) return null;
  const inIndia = pin.latitude >= INDIA.south && pin.latitude <= INDIA.north && pin.longitude >= INDIA.west && pin.longitude <= INDIA.east;
  return inIndia ? pin : null;
}

/** The most exact position the link gives: the place's own, then a query given as coordinates, then the map's centre. */
function readPin(url: URL): MapsPin | null {
  const place = PLACE_PIN.exec(url.href);
  if (place !== null) return pinOf(place[1], place[2]);
  for (const key of QUERY_KEYS) {
    const pair = PAIR.exec(url.searchParams.get(key) ?? "");
    if (pair !== null) return pinOf(pair[1], pair[2]);
  }
  const centre = CENTRE_PIN.exec(url.pathname);
  return centre === null ? null : pinOf(centre[1], centre[2]);
}

export function parseMapsLink(typed: string): MapsLinkResult {
  const value = typed.trim();
  if (value === "") return { ok: true, url: null, pin: null };
  if (/\s/.test(value)) return { ok: false, message: INVALID };

  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(value) ? value : `https://${value}`);
  } catch {
    return { ok: false, message: INVALID };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, message: INVALID };
  // A sign-in hidden in the address is how a link pretends to be another site.
  if (url.username !== "" || url.password !== "") return { ok: false, message: INVALID };
  if (!isMapsLink(url)) return { ok: false, message: INVALID };
  url.protocol = "https:";
  if (url.href.length > MAPS_LINK_MAX_LENGTH) return { ok: false, message: "That link is too long. Use Share, then Copy link, in Google Maps." };
  return { ok: true, url: url.href, pin: readPin(url) };
}
