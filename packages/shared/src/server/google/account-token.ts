import { findGoogleConnection, markGoogleConnectionLost, markGoogleConnectionOk, type Database } from "@brandbasket/db";
import type { TokenSource } from "../ga4/service-account";
import { openSecret } from "../secret-seal";
import { GoogleAccessLost, GoogleUnavailable, refreshAccessToken, type GoogleClientCredentials, type GooglePurpose } from "./oauth";

/** A token is renewed this long before it ends, so a slow request never carries an expired one. */
const RENEW_MARGIN_MS = 60_000;

export interface AccountTokenOptions {
  readonly slot: number;
  readonly purpose: GooglePurpose;
  readonly authSecret: string;
  readonly credentials: GoogleClientCredentials;
  /** Called once, when a connected sign-in turns out to be lost, so the caller can alert. */
  readonly onLost?: (slot: number, purpose: GooglePurpose) => Promise<void>;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

/**
 * Hands out an access token for the Brandbasket Google account's stored sign-in. Asks Google for a new one only when the last
 * is about to end. A refused sign-in is marked in the database (and reported through `onLost` once), then thrown.
 */
export function createAccountTokenSource(db: Database, options: AccountTokenOptions): TokenSource {
  const clock = options.now ?? (() => new Date());
  let cached: { readonly token: string; readonly expiresAt: number } | null = null;
  return async () => {
    const now = clock();
    if (cached !== null && cached.expiresAt - RENEW_MARGIN_MS > now.getTime()) return cached.token;
    const connection = await findGoogleConnection(db, options.slot, options.purpose);
    if (connection === null) throw new GoogleAccessLost("The Google account is not connected yet.");
    if (connection.status === "access_lost") throw new GoogleAccessLost();
    const refreshToken = openSecret(options.authSecret, connection.sealedRefreshToken);
    if (refreshToken === null) throw new GoogleAccessLost("The saved Google sign-in cannot be read. Connect the account again.");
    try {
      const fresh = await refreshAccessToken(options.credentials, refreshToken, options.fetch);
      cached = { token: fresh.accessToken, expiresAt: now.getTime() + fresh.expiresInSeconds * 1000 };
      await markGoogleConnectionOk(db, options.slot, options.purpose, now);
      return fresh.accessToken;
    } catch (error) {
      if (error instanceof GoogleAccessLost) {
        const changed = await markGoogleConnectionLost(db, options.slot, options.purpose, error.message, now);
        if (changed) await options.onLost?.(options.slot, options.purpose);
      }
      if (error instanceof GoogleAccessLost || error instanceof GoogleUnavailable) throw error;
      throw new GoogleUnavailable("Google could not be reached.");
    }
  };
}
