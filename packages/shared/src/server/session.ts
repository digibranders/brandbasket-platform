import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import type { SessionUser } from "../lib/access";

/** The part of Better Auth this needs. Each app builds its own instance over its own database connection. */
export interface SessionReader {
  readonly api: {
    getSession(input: {
      headers: Headers;
      query: { disableRefresh: true };
    }): Promise<{
      /** Set on a session made by the console's two-step sign-in. */
      readonly session: { readonly secondFactorAt?: Date | null };
      readonly user: {
        id: string;
        email: string;
        name: string;
        emailVerified: boolean;
        phoneNumber?: string | null;
        phoneNumberVerified?: boolean | null;
      };
    } | null>;
  };
}

/**
 * Builds `getSessionUser` for an app.
 *
 * The auth instance is a parameter rather than an import because the two apps genuinely differ: the customer app
 * binds Better Auth to the row-level-security connection, the console to the staff one. Everything else about
 * reading a session is identical, so it lives here.
 *
 * With `requireSecondFactor` (the console), a session that did not pass the emailed code counts as no session at all,
 * wherever it came from: a password-only session made on the dashboard opens nothing here.
 *
 * Call this once at module scope and export the result — `cache` dedupes per request, so a fresh wrapper per call
 * would reopen the session on every component that asks for it.
 */
export function createGetSessionUser(
  getAuth: () => SessionReader,
  options: { readonly requireSecondFactor: boolean } = { requireSecondFactor: false },
): () => Promise<SessionUser | null> {
  /**
   * The signed-in user for this request, or null. Refresh is disabled because server components cannot
   * write cookies; sessions last their full lifetime and then require signing in again.
   */
  return cache(async (): Promise<SessionUser | null> => {
    const session = await getAuth().api.getSession({
      headers: await headers(),
      query: { disableRefresh: true },
    });
    if (session === null) return null;
    if (options.requireSecondFactor && !(session.session.secondFactorAt instanceof Date)) return null;
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailConfirmed: session.user.emailVerified,
      // Only a proven number counts: it is what the account signs in with.
      phone: session.user.phoneNumberVerified === true ? (session.user.phoneNumber ?? null) : null,
    };
  });
}
