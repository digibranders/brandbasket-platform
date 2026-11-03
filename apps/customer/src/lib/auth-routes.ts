/**
 * The Better Auth HTTP routes this app serves, and nothing else. Sign-in, the session read and sign-out let the app work on
 * its own host (host-only cookies). Everything else stays closed: accounts are only opened by server code, and routes such
 * as /update-user would let a request body write the phone fields that Better Auth exposes (packages/auth create-auth.ts).
 * Phase 3 replaces sign-in with the app's own action (rate limits, Turnstile) and can then close it here.
 */
const OPEN_ROUTES: Readonly<Record<string, "GET" | "POST">> = {
  "/api/auth/get-session": "GET",
  "/api/auth/sign-in/email": "POST",
  "/api/auth/sign-out": "POST",
};

export function isOpenAuthRoute(method: string, pathname: string): boolean {
  return OPEN_ROUTES[pathname.replace(/\/+$/, "")] === method.toUpperCase();
}
