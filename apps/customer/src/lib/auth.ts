import "server-only";
import { createAuth, type Auth } from "@brandbasket/auth";
import { getAppDb } from "./db";
import { serverEnv } from "./env";

// Module-scoped, not on globalThis: a hot reload re-evaluates this module and picks up configuration changes.
let auth: Auth | undefined;

/**
 * This app's Better Auth instance over the row-level-security connection. Cookies are host-only (no cross-subdomain
 * cookies, docs/STAFF-ACCESS.md), so a session belongs to the host that set it. No mailer yet: password reset arrives with
 * the entry screens (plan 61, phase 3), and until then asking for one is refused rather than silently sending nothing.
 */
export function getAuth(): Auth {
  if (auth === undefined) {
    const env = serverEnv();
    auth = createAuth({
      db: getAppDb(),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.APP_ORIGIN,
      trustedOrigins: [env.APP_ORIGIN],
      nextCookies: true,
    });
  }
  return auth;
}
