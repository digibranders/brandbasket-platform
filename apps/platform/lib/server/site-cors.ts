/**
 * The bearer-token auth and CORS headers every `/api/site/*` GET endpoint shares. Client sites are on other
 * origins and read this with a shared secret rather than a session, so every route here needs the same shape of
 * headers and the same "missing or wrong token" handling; this module is the one copy of both.
 */

/** The CORS header set for a route that allows `methods`, e.g. "GET, OPTIONS". */
export function siteCorsHeaders(methods: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Authorization",
    // The response (and whether it's even a 401) depends on the bearer token, so a shared cache must not serve one
    // caller's answer to another.
    Vary: "Authorization",
  };
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header === null) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/** Deliberately identical for a missing and a wrong token: nothing here tells a caller which it was. */
export const SITE_UNAUTHORIZED_MESSAGE = "A valid site API token is required.";

export function unauthorized(corsHeaders: Record<string, string>): Response {
  return Response.json(
    { error: SITE_UNAUTHORIZED_MESSAGE },
    { status: 401, headers: { ...corsHeaders, "Cache-Control": "no-store" } },
  );
}

/** The answer once a business's plan has ended: the token is good, but its website is not being served. Says so, so a site can show a notice. */
export const SITE_OFFLINE_MESSAGE = "This website is offline.";

export function siteOffline(corsHeaders: Record<string, string>): Response {
  return Response.json(
    { error: SITE_OFFLINE_MESSAGE, code: "site_offline" },
    { status: 403, headers: { ...corsHeaders, "Cache-Control": "no-store" } },
  );
}
