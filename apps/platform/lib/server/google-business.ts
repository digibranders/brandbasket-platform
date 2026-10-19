import "server-only";
import { z } from "zod";
import type { OpeningHours } from "@brandbasket/shared/lib/onboarding/hours";
import { BUSINESS_ABOUT_MAX_LENGTH, BUSINESS_ABOUT_MAX_WORDS, limitWords } from "@/lib/business-details-fields";
import type { ImportedLocation } from "./google-import-seal";

/*
 * "Import from Google Business Profile" on the Details tab (docs/superpowers/specs/2026-10-01-business-profile-
 * design.md): the owner signs in with the Google account that manages their business, we read its locations once with
 * the access token Google gives us, and the token is dropped. Only the business.manage scope is asked for, online (no
 * refresh token). Google must have approved the project for the Business Profile APIs, or every call answers 403.
 *
 * APIs: OAuth 2.0 (accounts.google.com, oauth2.googleapis.com), Account Management v1 (accounts.list) and Business
 * Information v1 (accounts.locations.list).
 */

export interface GoogleOAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  /** Registered with Google for the client: our callback, on the app host. */
  readonly redirectUri: string;
}

/** Google refused, failed or answered with something we cannot read. The message is for our logs, not the owner. */
export class GoogleBusinessError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "GoogleBusinessError";
  }
}

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const INFORMATION_ORIGIN = "https://mybusinessbusinessinformation.googleapis.com/v1";
const SCOPE = "https://www.googleapis.com/auth/business.manage";
const READ_MASK = "name,title,phoneNumbers,storefrontAddress,websiteUri,latlng,regularHours,profile,metadata";
/** How many accounts are looked in, and how many locations are kept: an owner picks one, and a cookie holds a few. */
const MAX_ACCOUNTS = 3;
export const MAX_IMPORTED_LOCATIONS = 5;
const REQUEST_TIMEOUT_MS = 10_000;
const ADDRESS_MAX = 200;

export function googleAuthorizeUrl(config: GoogleOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function call(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: "no-store" });
  } catch (error) {
    throw new GoogleBusinessError(`Request to ${new URL(url).host} failed`, { cause: error });
  }
  if (!response.ok) throw new GoogleBusinessError(`${new URL(url).host} answered ${String(response.status)}`);
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new GoogleBusinessError(`${new URL(url).host} sent a body that is not JSON`, { cause: error });
  }
}

const tokenSchema = z.object({ access_token: z.string().min(1) });

/** Trades the code Google sent back for an access token. */
export async function exchangeGoogleCode(config: GoogleOAuthConfig, code: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
  const parsed = tokenSchema.safeParse(
    await call(fetchImpl, TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() }),
  );
  if (!parsed.success) throw new GoogleBusinessError("Google's token answer has no access token");
  return parsed.data.access_token;
}

const timeSchema = z.object({ hours: z.number().int().optional(), minutes: z.number().int().optional() }).optional();
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

const locationSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  phoneNumbers: z.object({ primaryPhone: z.string().optional() }).optional(),
  storefrontAddress: z
    .object({
      addressLines: z.array(z.string()).optional(),
      locality: z.string().optional(),
      postalCode: z.string().optional(),
    })
    .optional(),
  websiteUri: z.string().optional(),
  latlng: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  regularHours: z
    .object({
      periods: z
        .array(z.object({ openDay: z.string(), openTime: timeSchema, closeDay: z.string().optional(), closeTime: timeSchema }))
        .optional(),
    })
    .optional(),
  profile: z.object({ description: z.string().optional() }).optional(),
  metadata: z.object({ mapsUri: z.string().optional() }).optional(),
});

export type GoogleLocation = z.output<typeof locationSchema>;

const accountsSchema = z.object({ accounts: z.array(z.object({ name: z.string().regex(/^accounts\/[^/]+$/) })).optional() });
const locationsSchema = z.object({ locations: z.array(locationSchema).optional() });

/** The locations the signed-in Google account manages, from its first few accounts, up to MAX_IMPORTED_LOCATIONS. */
export async function fetchGoogleLocations(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<readonly GoogleLocation[]> {
  const init: RequestInit = { headers: { authorization: `Bearer ${accessToken}` } };
  const accounts = accountsSchema.safeParse(await call(fetchImpl, ACCOUNTS_URL, init));
  if (!accounts.success) throw new GoogleBusinessError("Google's accounts answer could not be read");

  const found: GoogleLocation[] = [];
  for (const account of (accounts.data.accounts ?? []).slice(0, MAX_ACCOUNTS)) {
    const params = new URLSearchParams({ readMask: READ_MASK, pageSize: String(MAX_IMPORTED_LOCATIONS) });
    const locations = locationsSchema.safeParse(await call(fetchImpl, `${INFORMATION_ORIGIN}/${account.name}/locations?${params.toString()}`, init));
    if (!locations.success) throw new GoogleBusinessError("Google's locations answer could not be read");
    found.push(...(locations.data.locations ?? []));
    if (found.length >= MAX_IMPORTED_LOCATIONS) break;
  }
  return found.slice(0, MAX_IMPORTED_LOCATIONS);
}

function clock(time: z.output<typeof timeSchema>): number {
  return (time?.hours ?? 0) * 60 + (time?.minutes ?? 0);
}

function hhmm(minutes: number): string {
  const wrapped = minutes % (24 * 60);
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

/**
 * Google's weekly periods as the Details tab's hours: a day open round the clock is "Open 24 hours"; a day with one
 * or more periods opens at its earliest and closes at its latest (a lunch break is not kept); a day with no period is
 * closed. No periods at all gives no hours.
 */
function hoursOf(location: GoogleLocation): OpeningHours[] {
  const periods = location.regularHours?.periods ?? [];
  if (periods.length === 0) return [];
  return DAYS.map((day, dayOfWeek): OpeningHours => {
    const own = periods.filter((period) => period.openDay === day);
    if (own.length === 0) return { dayOfWeek, mode: "closed" };
    if (own.some((period) => clock(period.openTime) === 0 && clock(period.closeTime) >= 24 * 60)) return { dayOfWeek, mode: "all-day" };
    const opens = Math.min(...own.map((period) => clock(period.openTime)));
    const closes = Math.max(...own.map((period) => (period.closeDay !== undefined && period.closeDay !== day ? clock(period.closeTime) + 24 * 60 : clock(period.closeTime))));
    if (opens === closes % (24 * 60)) return { dayOfWeek, mode: "all-day" };
    return { dayOfWeek, mode: "open", opensAt: hhmm(opens), closesAt: hhmm(closes) };
  });
}

function addressOf(location: GoogleLocation): string {
  const address = location.storefrontAddress;
  if (address === undefined) return "";
  const town = [address.locality, address.postalCode].filter((part) => part !== undefined && part !== "").join(" ");
  return [...(address.addressLines ?? []), town]
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(", ")
    .slice(0, ADDRESS_MAX);
}

function mapsUrlOf(location: GoogleLocation): string {
  if (location.metadata?.mapsUri !== undefined) return location.metadata.mapsUri;
  if (location.latlng === undefined) return "";
  const query = `${String(location.latlng.latitude)},${String(location.latlng.longitude)}`;
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query }).toString()}`;
}

/** One location as the Details tab offers it: every value as text the owner checks, which the tab's parser checks again on Save. */
export function toImportedLocation(location: GoogleLocation): ImportedLocation {
  return {
    id: location.name.slice(0, 200),
    name: (location.title ?? "").trim().slice(0, 200),
    address: addressOf(location),
    phone: (location.phoneNumbers?.primaryPhone ?? "").trim().slice(0, 40),
    website: (location.websiteUri ?? "").trim().slice(0, 300),
    mapsUrl: mapsUrlOf(location).slice(0, 500),
    about: limitWords((location.profile?.description ?? "").trim(), BUSINESS_ABOUT_MAX_WORDS).slice(0, BUSINESS_ABOUT_MAX_LENGTH),
    hours: hoursOf(location),
  };
}
