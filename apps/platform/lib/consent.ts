import { z } from "zod";

/**
 * Consent for the dashboard's measurement tags. Google Analytics 4 and Microsoft Clarity both run inside one Google Tag
 * Manager container (app.brandbasket.in), whose id is a public env var inlined at build time. With no id the dashboard
 * loads no third-party tag and shows no banner. Nothing here is advertising: the container has no ad or pixel tags.
 */
export const MEASUREMENT_TOOLS = ["Google Analytics", "Microsoft Clarity"] as const;

const GTM_ENV = "NEXT_PUBLIC_GTM_ID";

/** Throws naming the variable when the id is malformed, so a typo fails the build instead of loading nothing. */
export function parseGtmId(source: Readonly<Record<string, string | undefined>>): string | null {
  const value = source[GTM_ENV]?.trim();
  if (!value) return null;
  if (!/^GTM-[A-Z0-9]{4,12}$/.test(value)) throw new Error(`${GTM_ENV} is not a valid container id: "${value}"`);
  return value;
}

// A literal process.env read, so Next.js inlines it into the client bundle.
export const GTM_ID: string | null = parseGtmId({ [GTM_ENV]: process.env.NEXT_PUBLIC_GTM_ID });

export const CONSENT_KEY = "bb-app-consent";
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const recordSchema = z.object({ measurement: z.boolean(), at: z.iso.datetime() });
export type ConsentRecord = z.infer<typeof recordSchema>;

export function encodeRecord(measurement: boolean, now: Date): string {
  const record: ConsentRecord = { measurement, at: now.toISOString() };
  return JSON.stringify(record);
}

/** Null means ask: nothing stored, unreadable, or older than 12 months. */
export function decodeRecord(raw: string | null, now: Date): ConsentRecord | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = recordSchema.safeParse(data);
  if (!parsed.success) return null;
  if (now.getTime() - Date.parse(parsed.data.at) > MAX_AGE_MS) return null;
  return parsed.data;
}

type Signal = "granted" | "denied";

/** Google Consent Mode v2 signals. Only analytics storage can be granted: the dashboard sells no ads and runs no ad tags. */
export function consentSignals(measurement: boolean): Readonly<Record<"analytics_storage" | "ad_storage" | "ad_user_data" | "ad_personalization", Signal>> {
  return { analytics_storage: measurement ? "granted" : "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
}

/**
 * Pages whose address carries a one-time secret (a password reset, email confirmation or account setup link). Tag Manager
 * never starts on them, so the secret cannot reach an analytics report.
 */
const SECRET_PATHS = /^\/(?:reset-password|confirm-email|setup)\/|^\/billing\/(?:charges\/)?confirm(?:\/|$)/;

export function isUntrackedPath(pathname: string): boolean {
  return SECRET_PATHS.test(pathname);
}

// First-party cookie name prefixes: Google Analytics 4 _ga and _ga_<id>; Clarity _clck and _clsk.
const MEASUREMENT_COOKIES = ["_ga", "_clck", "_clsk"] as const;

export function measurementCookies(names: readonly string[]): string[] {
  return names.filter((name) => MEASUREMENT_COOKIES.some((prefix) => name.startsWith(prefix)));
}
