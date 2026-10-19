import { readBookingContext, readSiteFacts } from "@brandbasket/db";
import { addDays, zonedTimeToUtc } from "@brandbasket/shared/lib/calendar/local-date";
import { getStaffDb } from "@/lib/server/db";
import { buildAvailabilityResponse, parsePractitionerParam, resolveAvailabilityWindow } from "@/lib/server/availability";
import { loadClinicCalendars } from "@/lib/server/clinic-calendars";
import { bearerToken, siteCorsHeaders, siteOffline, unauthorized } from "@/lib/server/site-cors";
import { findTenantBySiteToken, siteHasAccess } from "@/lib/server/site-api";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";

/**
 * `GET /api/site/availability?week=YYYY-MM-DD&practitioner=<uuid>` — a week of the Calendly-style slot grid for
 * whichever business owns the bearer token. `week` is any date in the target week (it defaults to the current week)
 * and is resolved to that week's Monday. `practitioner` (optional) narrows the grid to one active doctor's own
 * calendar; without it a slot is free while any doctor can still take it. Every response, success or failure, is
 * `Cache-Control: no-store`: unlike `/api/site/info`, slot state changes with every booking and must never be served
 * stale from a shared cache.
 */

const CORS_HEADERS = siteCorsHeaders("GET, OPTIONS");
const UNAVAILABLE_MESSAGE = "Online booking isn't available. Please call us.";
const FAILED_MESSAGE = "Something went wrong. Please try again or call us.";
const PRACTITIONER_MESSAGE = "Choose a doctor from the list.";

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function reply(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
}

export async function GET(request: Request): Promise<Response> {
  const token = bearerToken(request);
  if (token === null) return unauthorized(CORS_HEADERS);

  const searchParams = new URL(request.url).searchParams;
  const weekParam = searchParams.get("week");
  const practitionerParam = parsePractitionerParam(searchParams.get("practitioner"));

  try {
    const tenant = await findTenantBySiteToken(token);
    if (tenant === null) return unauthorized(CORS_HEADERS);
    if (!(await siteHasAccess(tenant.businessId))) return siteOffline(CORS_HEADERS);

    const db = getStaffDb();
    const [context, facts] = await Promise.all([readBookingContext(db, tenant.businessId), readSiteFacts(db, tenant.businessId)]);

    const windowOutcome = resolveAvailabilityWindow(context, weekParam, new Date());
    if (windowOutcome.kind === "unavailable") {
      return reply(403, { status: "error", code: "unavailable", message: UNAVAILABLE_MESSAGE, field: null });
    }
    if (windowOutcome.kind === "paused") {
      return reply(409, { status: "error", code: "paused", message: windowOutcome.message, field: null });
    }
    if (windowOutcome.kind === "invalid_week") {
      return reply(400, { status: "error", code: "invalid", message: "Choose a valid week.", field: "week" });
    }

    if (practitionerParam.kind === "invalid") {
      return reply(400, { status: "error", code: "invalid", message: PRACTITIONER_MESSAGE, field: "practitioner" });
    }

    const { window } = windowOutcome;
    const onlyPractitionerId = practitionerParam.kind === "one" ? practitionerParam.id : null;
    const { practitioners, calendars } = await loadClinicCalendars(db, tenant.businessId, {
      clinicHours: facts.hours,
      timeZone: window.timeZone,
      fromUtc: zonedTimeToUtc(window.weekStart, "00:00", window.timeZone),
      toUtc: zonedTimeToUtc(addDays(window.weekStart, 7), "00:00", window.timeZone),
      onlyPractitionerId,
    });
    // An archived or unknown doctor is refused rather than shown as a fully closed week: a client site holding a
    // stale doctor list should re-read /api/site/info, not tell the patient that doctor has no free time.
    if (onlyPractitionerId !== null && !practitioners.some((practitioner) => practitioner.id === onlyPractitionerId)) {
      return reply(400, { status: "error", code: "invalid", message: PRACTITIONER_MESSAGE, field: "practitioner" });
    }

    const availability = buildAvailabilityResponse(window, facts, calendars);
    return reply(200, availability);
  } catch (error) {
    // Never the raw error: reading facts, booking context or busy intervals can fail mid-query, and Drizzle's
    // DrizzleQueryError puts the failed query's params straight into its message.
    console.error("Could not build site availability.", errorLogInfo(error));
    return reply(500, { status: "error", code: "failed", message: FAILED_MESSAGE, field: null });
  }
}
