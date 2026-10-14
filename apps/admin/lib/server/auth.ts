import "server-only";
import { createAuth, STAFF_SESSION_LIFETIME_SECONDS, type Auth } from "@firstfold/auth";
import { getStaffDb } from "./db";
import { serverEnv } from "@/lib/server/env";

// Module-scoped rather than on globalThis (unlike the DB pools in ./db): a hot reload re-evaluates
// this module and picks up config changes, whereas globalThis would keep serving the stale instance.
let auth: Auth | undefined;

export function getAuth(): Auth {
  if (auth === undefined) {
    const env = serverEnv();
    auth = createAuth({
      db: getStaffDb(),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.APP_ORIGIN,
      trustedOrigins: [env.APP_ORIGIN, env.ADMIN_ORIGIN],
      nextCookies: true,
      sessionLifetimeSeconds: STAFF_SESSION_LIFETIME_SECONDS,
    });
  }
  return auth;
}
