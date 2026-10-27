import "server-only";
import { consumeRateLimit, recordSiteEvent } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { getStaffDb } from "@/lib/server/db";
import { findTenantBySiteToken, siteHasAccess } from "@/lib/server/site-api";
import { bearerToken, siteCorsHeaders, siteOffline, unauthorized } from "@/lib/server/site-cors";
import { readBodyWithin, SITE_EVENT_RATE_RULE, siteEventRateKey } from "@/lib/server/site-events";
import { parseSiteEventBody, SITE_EVENT_BODY_LIMIT } from "@/lib/site-events";

/**
 * `POST /api/site/events`: a customer's website reports that a visitor tapped to call, tapped WhatsApp or sent a form.
 * Body `{ "kind": "call" | "whatsapp" | "form" }`; the business is the one that owns the bearer token, never one named in
 * the body. Only a kind and a time are stored. Answers 204.
 */

// Content-Type is allowed too, so a site may post the body as application/json.
const CORS_HEADERS = { ...siteCorsHeaders("POST, OPTIONS"), "Access-Control-Allow-Headers": "Authorization, Content-Type" };
const NO_STORE = { ...CORS_HEADERS, "Cache-Control": "no-store" };

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  const token = bearerToken(request);
  if (token === null) return unauthorized(CORS_HEADERS);

  try {
    const text = await readBodyWithin(request, SITE_EVENT_BODY_LIMIT);
    if (text === null) return Response.json({ error: "That request is too large." }, { status: 413, headers: NO_STORE });
    const event = parseSiteEventBody(text);
    if (!event.ok) return Response.json({ error: "Send { \"kind\": \"call\", \"whatsapp\" or \"form\" }." }, { status: 400, headers: NO_STORE });

    const tenant = await findTenantBySiteToken(token);
    if (tenant === null) return unauthorized(CORS_HEADERS);
    if (!(await siteHasAccess(tenant.businessId))) return siteOffline(CORS_HEADERS);

    // The staff connection is allowed here because the token has proved the business (see lib/server/db.ts).
    const db = getStaffDb();
    const limit = await consumeRateLimit(db, siteEventRateKey(tenant.businessId), SITE_EVENT_RATE_RULE);
    if (!limit.allowed) {
      return Response.json(
        { error: "Too many events. Try again shortly." },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
    await recordSiteEvent(db, { businessId: tenant.businessId, kind: event.kind, at: new Date() });
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (error) {
    // Never the raw error: Drizzle puts the failed query's params, here the site token, into its message.
    console.error("Could not record a site event.", errorLogInfo(error));
    return Response.json({ error: "Something went wrong." }, { status: 500, headers: NO_STORE });
  }
}
