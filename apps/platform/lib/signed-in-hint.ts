import { initialsOf } from "@firstfold/shared/lib/names";

/**
 * A marker that someone is signed in to the dashboard, for the website to read (firstfold-website lib/signed-in.ts): its
 * header then offers Leads and Dashboard instead of Log in and List your business, and the phone's profile button
 * opens the dashboard. The login itself is Better Auth's session cookie, which is httpOnly and stays on the dashboard's
 * host; this marker holds nothing but the person's initials, proves nothing, and opens nothing. Every dashboard page
 * still checks the real session, so a stale marker at worst shows a Dashboard link that leads to the login page.
 *
 * Set on sign-in, cleared on sign-out (lib/server/signed-in-hint.ts), and kept in step with the session on every page
 * the dashboard serves (proxy.ts). In production it is set for the parent domain the website shares with the
 * dashboard (SIGNED_IN_HINT_DOMAIN); locally both run on localhost, whose cookies every port shares.
 */

export const SIGNED_IN_HINT_COOKIE = "ff_signed_in";

/** As long as a session lasts without use (packages/auth create-auth.ts); renewed on every dashboard page. */
export const SIGNED_IN_HINT_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** The marker's value when the initials aren't known: a login from before the marker existed. */
export const UNKNOWN_INITIALS = "1";

/** Better Auth's session cookie, on plain http and behind the `__Secure-` prefix it takes over https. */
const SESSION_COOKIE_NAMES = ["better-auth.session_token", "__Secure-better-auth.session_token"] as const;

/** What a dashboard sign-in writes: the person's initials, as the dashboard draws them, made safe for a cookie. */
export function signedInHintValue(name: string): string {
  const initials = initialsOf(name);
  return initials === initialsOf("") ? UNKNOWN_INITIALS : encodeURIComponent(initials);
}

/** Whether the request carries a dashboard login, judged by its session cookie being there at all. */
export function hasSessionCookie(hasCookie: (name: string) => boolean): boolean {
  return SESSION_COOKIE_NAMES.some((name) => hasCookie(name));
}

export type HintUpdate =
  | { readonly kind: "set"; readonly value: string }
  | { readonly kind: "clear" }
  | { readonly kind: "none" };

/**
 * How a dashboard page keeps the marker in step with the login: renewed (with the same initials) while there is one,
 * added without initials for a login made before markers existed, and taken away once the login is gone.
 */
export function hintUpdate({ hasSession, hint }: { readonly hasSession: boolean; readonly hint: string | null }): HintUpdate {
  if (hasSession) return { kind: "set", value: hint ?? UNKNOWN_INITIALS };
  return hint === null ? { kind: "none" } : { kind: "clear" };
}

/**
 * The domain to set the marker for, from SIGNED_IN_HINT_DOMAIN: unset leaves it on the dashboard's own host. A domain
 * the dashboard isn't on, or a bare top-level one, is refused here rather than silently dropped by every browser.
 */
export function hintCookieDomain(raw: string | undefined, appOrigin: string): string | undefined {
  const domain = raw?.trim().toLowerCase().replace(/^\./, "") ?? "";
  if (domain === "") return undefined;
  const appHost = new URL(appOrigin).hostname;
  if (!domain.includes(".") || (appHost !== domain && !appHost.endsWith(`.${domain}`))) {
    throw new Error(
      `SIGNED_IN_HINT_DOMAIN "${domain}" must be a domain the dashboard (${appHost}) is on, shared with the website, like example.com.`,
    );
  }
  return domain;
}

export interface HintCookieOptions {
  readonly httpOnly: false;
  readonly sameSite: "lax";
  readonly secure: boolean;
  readonly path: "/";
  readonly maxAge: number;
  readonly domain?: string;
}

/** Readable by the website's own script (not httpOnly), sent on its pages, and secure wherever the dashboard is. */
export function hintCookieOptions({ appOrigin, domain }: { readonly appOrigin: string; readonly domain: string | undefined }): HintCookieOptions {
  return {
    httpOnly: false,
    sameSite: "lax",
    secure: new URL(appOrigin).protocol === "https:",
    path: "/",
    maxAge: SIGNED_IN_HINT_MAX_AGE_SECONDS,
    ...(domain === undefined ? {} : { domain }),
  };
}
