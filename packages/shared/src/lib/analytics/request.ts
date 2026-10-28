import { referrerHost } from "./classify-channel";

type HeaderReader = Pick<Headers, "get">;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** True when the visitor's browser asked not to be tracked (Do Not Track, or Global Privacy Control). Such a hit is dropped, silently. */
export function optedOut(headers: HeaderReader): boolean {
  return headers.get("dnt")?.trim() === "1" || headers.get("sec-gpc")?.trim() === "1";
}

/** The visitor's country from the edge's header (Cloudflare, then Vercel): two capital letters, or null when unknown. */
export function countryFrom(headers: HeaderReader): string | null {
  for (const name of ["cf-ipcountry", "x-vercel-ip-country"]) {
    const value = headers.get(name)?.trim().toUpperCase();
    if (value !== undefined && /^[A-Z]{2}$/.test(value) && value !== "XX") return value;
  }
  return null;
}

/** The host of the page that sent a hit (Origin, then Referer), lower case and without www, or null when neither can be read. */
export function originHost(headers: HeaderReader): string | null {
  for (const name of ["origin", "referer"]) {
    const host = referrerHost(headers.get(name) ?? undefined);
    if (host !== null) return host;
  }
  return null;
}

const withoutWww = (host: string): string => host.toLowerCase().replace(/^www\./, "");

/**
 * Whether a hit came from a page of the business's own site: the host is one of the business's hosts, or a subdomain of
 * one, with or without www. A request with no origin (not a browser page) passes. This filters out other sites that
 * copied the script; it is not a lock, because anyone can send any header.
 */
export function hostAllowed(host: string | null, allowed: readonly string[]): boolean {
  if (host === null) return true;
  const visitedHost = withoutWww(host);
  return allowed.some((entry) => {
    const own = withoutWww(entry);
    return visitedHost === own || visitedHost.endsWith(`.${own}`);
  });
}

/** The Indian calendar day (`YYYY-MM-DD`) of an instant: the day a visitor's hash is good for, matching the report's days. */
export function istDay(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
