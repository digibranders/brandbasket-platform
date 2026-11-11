import "server-only";
import { countGoogleSources, listGoogleConnections, type GoogleConnectionPurpose, type GoogleConnectionRow } from "@brandbasket/db";
import { getStaffDb } from "./db";
import { serverEnv } from "./env";

export interface GoogleOAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly accountEmail: string;
}

/** The Google sign-in settings, or null while any of the four is missing (the Settings page then says so). */
export function googleOAuthConfig(): GoogleOAuthConfig | null {
  const env = serverEnv();
  const { GOOGLE_OAUTH_CLIENT_ID: clientId, GOOGLE_OAUTH_CLIENT_SECRET: clientSecret, GOOGLE_OAUTH_REDIRECT_URI: redirectUri, GOOGLE_ACCOUNT_EMAIL: accountEmail } = env;
  if (clientId === undefined || clientSecret === undefined || redirectUri === undefined || accountEmail === undefined) return null;
  return { clientId, clientSecret, redirectUri, accountEmail: accountEmail.toLowerCase() };
}

export interface GoogleConnectionState {
  readonly purpose: GoogleConnectionPurpose;
  /** Null when never connected. The sealed token is never part of this. */
  readonly connection: Pick<GoogleConnectionRow, "accountEmail" | "status" | "lastOkAt" | "lastError" | "updatedAt"> | null;
}

/** What the Settings page shows for slot 1: one line per purpose. */
export async function loadGoogleStates(): Promise<readonly GoogleConnectionState[]> {
  const rows = await listGoogleConnections(getStaffDb());
  return (["read", "write"] as const).map((purpose) => {
    const row = rows.find((candidate) => candidate.slot === 1 && candidate.purpose === purpose);
    return { purpose, connection: row === undefined ? null : { accountEmail: row.accountEmail, status: row.status, lastOkAt: row.lastOkAt, lastError: row.lastError, updatedAt: row.updatedAt } };
  });
}

/** How many Search Console sites and Analytics properties the Brandbasket account (slot 1) holds, from our own rows. */
export async function loadGoogleCounts(): Promise<{ readonly gsc: number; readonly ga4: number }> {
  return countGoogleSources(getStaffDb(), 1);
}
