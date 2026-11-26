import "server-only";
import { HOME_COUNTRY, isCountryCode } from "@brandbasket/shared/lib/countries";

/** The header only the platform in front of this server sets: Cloudflare on the VPS (it overwrites any value a client sends), Vercel's edge on Vercel. */
function edgeCountryHeader(): string {
  return process.env.VERCEL_ENV === undefined ? "cf-ipcountry" : "x-vercel-ip-country";
}

/**
 * Where the visitor is, from the edge's country header, as an ISO alpha-2 code from our countries list; India when the
 * header is missing or names a country we do not list (the rule the phone field's default already follows). The one
 * answer the screen prices by and the sign-up bills by, so the two can never disagree (plan 64, D6). Only the header of
 * the platform actually in front of the server is read: the other one is whatever a client chooses to send.
 */
export function visitorCountry(headers: Pick<Headers, "get">): string {
  const country = headers.get(edgeCountryHeader())?.trim().toUpperCase() ?? "";
  return isCountryCode(country) ? country : HOME_COUNTRY;
}
