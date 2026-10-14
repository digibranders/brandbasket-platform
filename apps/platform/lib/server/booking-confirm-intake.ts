import "server-only";
import type { SiteConfirmResponse } from "@/lib/site-bookings";
import { siteOtpConfirmSchema } from "@/lib/site-bookings-schema";
import type { BookingConfirmOutcome } from "./booking-confirm";
import { BodyTooLargeError, readLimitedBody } from "./read-limited-body";
import type { SiteApiTenant } from "./site-api";
import { bearerToken, SITE_UNAUTHORIZED_MESSAGE } from "./site-cors";
import { errorLogInfo } from "@firstfold/shared/server/error-log-info";

/** {otpId, code, clientIp}, all short strings: well inside this even generously. */
const MAX_BODY_BYTES = 4 * 1024;

const FAILED_MESSAGE = "Something went wrong. Please try again or call us.";
const LIMITED_MESSAGE = "You've sent a few requests already. Please try again later.";
const UNAVAILABLE_MESSAGE = "Online booking isn't available. Please call us.";

export interface BookingConfirmIntakeDeps {
  readonly findTenant: (token: string) => Promise<SiteApiTenant | null>;
  /** Loads the OTP (scoped to the tenant's business), verifies the code and books the slot. */
  readonly confirmOtp: (businessId: string, otpId: string, code: string, clientIp: string, now: Date) => Promise<BookingConfirmOutcome>;
  readonly now: () => Date;
}

function reply(status: number, body: SiteConfirmResponse | { readonly error: string }): Response {
  // Server-to-server only, so there is no CORS to set: a browser is never the caller.
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * `POST /api/site/bookings/confirm` — a client site's server confirming a booking OTP. Checks, in order:
 * 1. POST, or 405
 * 2. a bearer token that resolves to a business, or 401; a `findTenant` failure is a 500, not a 401
 * 3. a JSON content type, or 415
 * 4. a body within 4 KB, or 413
 * 5. the agreed shape, or 400
 * Then `confirmOtp` does everything else -- rate limiting, loading and validating the OTP, verifying the code and
 * booking the slot -- scoped to the tenant's own business; its outcome maps onto the response below.
 */
export async function handleBookingConfirmRequest(request: Request, deps: BookingConfirmIntakeDeps): Promise<Response> {
  if (request.method !== "POST") return reply(405, { error: "Method not allowed." });

  const token = bearerToken(request);
  let tenant: SiteApiTenant | null = null;
  if (token !== null) {
    try {
      tenant = await deps.findTenant(token);
    } catch (error) {
      console.error("Could not resolve the site API token.", errorLogInfo(error));
      return reply(500, { status: "error", code: "failed", message: FAILED_MESSAGE, field: null });
    }
  }
  if (tenant === null) return reply(401, { error: SITE_UNAUTHORIZED_MESSAGE });

  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return reply(415, { error: "Send JSON." });
  }

  let raw: unknown;
  try {
    const bytes = await readLimitedBody(request.body, MAX_BODY_BYTES);
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof BodyTooLargeError) return reply(413, { error: "Request too large." });
    return reply(400, { error: "The body is not valid JSON." });
  }

  const parsedRequest = siteOtpConfirmSchema.safeParse(raw);
  if (!parsedRequest.success) return reply(400, { error: "The body is not a booking confirmation." });

  const outcome = await deps.confirmOtp(
    tenant.businessId,
    parsedRequest.data.otpId,
    parsedRequest.data.code,
    parsedRequest.data.clientIp,
    deps.now(),
  );
  switch (outcome.kind) {
    case "booked":
      return reply(200, {
        status: "booked",
        date: outcome.date,
        start: outcome.start,
        end: outcome.end,
        practitionerName: outcome.practitionerName,
      });
    case "expired":
      return reply(410, { status: "error", code: "expired", message: "That code has expired. Please request a new one.", field: null });
    case "too_many_attempts":
      return reply(429, { status: "error", code: "too_many_attempts", message: outcome.message, field: null });
    case "wrong_code":
      return reply(422, { status: "error", code: "wrong_code", message: outcome.message, field: "code" });
    case "taken":
      return reply(409, { status: "error", code: "taken", message: outcome.message, field: null });
    case "unavailable":
      return reply(403, { status: "error", code: "unavailable", message: UNAVAILABLE_MESSAGE, field: null });
    case "paused":
      return reply(409, { status: "error", code: "paused", message: outcome.message, field: null });
    case "limited":
      return reply(429, { status: "error", code: "limited", message: LIMITED_MESSAGE, field: null });
    case "failed":
      return reply(500, { status: "error", code: "failed", message: FAILED_MESSAGE, field: null });
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled booking confirm outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}
