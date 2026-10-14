import "server-only";
import { readBookingContext, readPractitionerSchedules, readSiteFacts } from "@fynix/db";
import { findTenantBySiteToken } from "@/lib/server/site-api";
import { getStaffDb } from "@/lib/server/db";
import { buildSiteInfo, offersBooking } from "@/lib/server/site-info";
import { bearerToken, siteCorsHeaders, unauthorized } from "@/lib/server/site-cors";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";

/**
 * `GET /api/site/info` — opening hours, closures, the announcement banner and the online-booking state for
 * whichever business owns the bearer token. Same shape of auth and CORS as `/api/site/posts`.
 */

const CORS_HEADERS = siteCorsHeaders("GET, OPTIONS");

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request): Promise<Response> {
  const token = bearerToken(request);
  if (token === null) return unauthorized(CORS_HEADERS);

  try {
    const tenant = await findTenantBySiteToken(token);
    if (tenant === null) return unauthorized(CORS_HEADERS);

    const db = getStaffDb();
    const [facts, booking] = await Promise.all([readSiteFacts(db, tenant.businessId), readBookingContext(db, tenant.businessId)]);
    // The doctors only ever appear under booking, so a site with booking off never pays for reading them.
    const practitioners = offersBooking(booking) ? await readPractitionerSchedules(db, tenant.businessId) : [];
    const info = buildSiteInfo({ businessName: tenant.name, facts, booking, practitioners, now: new Date() });

    return Response.json(info, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        // Short cache: a customer editing their hours expects to see it on their site promptly, but a client site
        // rebuilding or a crawler should not hammer this on every request.
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (error) {
    // Never the raw error: reading facts or booking can fail mid-query, and Drizzle's DrizzleQueryError puts the
    // failed query's params — here, the site token itself — straight into its message.
    console.error("Could not build site info.", errorLogInfo(error));
    return Response.json(
      { error: "Something went wrong." },
      { status: 500, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } },
    );
  }
}
