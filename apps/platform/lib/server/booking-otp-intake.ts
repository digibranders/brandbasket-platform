import "server-only";
import { randomUUID } from "node:crypto";
import { isBookingHoneypotFilled, parseBookingFields } from "@fynix/shared/lib/appointments/booking-form";
import type { BookingInput } from "@fynix/shared/lib/appointments/booking-form";
import { OTP_TTL_SECONDS } from "@fynix/shared/lib/appointments/otp";
import type { SiteBookingFields, SiteOtpResponse } from "@/lib/site-bookings";
import { siteOtpRequestSchema } from "@/lib/site-bookings-schema";
import { TAKEN_MESSAGE } from "./booking-confirm";
import type { BookingOtpOutcome } from "./booking-otp";
import { BodyTooLargeError, readLimitedBody } from "./read-limited-body";
import type { SiteApiTenant } from "./site-api";
import { bearerToken, SITE_UNAUTHORIZED_MESSAGE } from "./site-cors";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";

/** Eight-ish fields of at most 2,000 characters each fit well inside this, even as multi-byte UTF-8. */
const MAX_BODY_BYTES = 16 * 1024;

const LIMITED_MESSAGE = "You've sent a few requests already. Please call us or try again later.";
const FAILED_MESSAGE = "Something went wrong. Please try again or call us.";
const UNAVAILABLE_MESSAGE = "Online booking isn't available. Please call us.";

export interface BookingOtpIntakeDeps {
  readonly findTenant: (token: string) => Promise<SiteApiTenant | null>;
  /** Decides, rate-limits, creates and sends the OTP. */
  readonly requestOtp: (businessId: string, input: BookingInput, clientIp: string, now: Date) => Promise<BookingOtpOutcome>;
  readonly now: () => Date;
}

function reply(status: number, body: SiteOtpResponse | { readonly error: string }): Response {
  // Server-to-server only, so there is no CORS to set: a browser is never the caller.
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** A plausible-looking (but meaningless) phone hint for the honeypot's fake success, from whatever digits the bot
 * happened to send -- never validated or normalised, since nothing about a honeypot hit is ever stored or acted
 * on. */
function fakePhoneHint(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  const lastFour = digits.length >= 4 ? digits.slice(-4) : "0000";
  return `•••• ${lastFour}`;
}

/**
 * `POST /api/site/bookings/otp` — a client site's server requesting an OTP for a chosen slot. Checks, in order:
 * 1. POST, or 405
 * 2. a bearer token that resolves to a business, or 401; a `findTenant` failure is a 500, not a 401, since it
 *    means the lookup itself broke rather than the token being missing or wrong
 * 3. a JSON content type, or 415
 * 4. a body within 16 KB, or 413
 * 5. the agreed shape, or 400
 * 6. a filled honeypot answers a fake 200 `otp_sent` with a random id; nothing is stored or sent
 * 7. the form's own validation, or 422 with the message and field to show
 * Then `requestOtp` decides whether the business is taking bookings, whether the service and slot are valid,
 * applies its rate limits, and creates and sends the OTP; its outcome maps onto the response below.
 */
export async function handleBookingOtpRequest(request: Request, deps: BookingOtpIntakeDeps): Promise<Response> {
  if (request.method !== "POST") return reply(405, { error: "Method not allowed." });

  const token = bearerToken(request);
  let tenant: SiteApiTenant | null = null;
  if (token !== null) {
    try {
      tenant = await deps.findTenant(token);
    } catch (error) {
      // Never a 401 here: a broken lookup is not the same thing as a caller with no or the wrong token, and
      // nothing about `error` (which never carries patient data at this point) is worth more than its class name.
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

  const parsedRequest = siteOtpRequestSchema.safeParse(raw);
  if (!parsedRequest.success) return reply(400, { error: "The body is not a booking OTP request." });

  // A bot gets a fake success, so it learns nothing. Nothing is recorded or sent.
  if (isBookingHoneypotFilled(parsedRequest.data.fields)) {
    const fields: SiteBookingFields = parsedRequest.data.fields;
    return reply(200, {
      status: "otp_sent",
      otpId: randomUUID(),
      expiresInSeconds: OTP_TTL_SECONDS,
      phoneHint: fakePhoneHint(fields.phone),
    });
  }

  const parsed = parseBookingFields(parsedRequest.data.fields);
  if (!parsed.success) {
    return reply(422, { status: "error", code: "invalid", message: parsed.message, field: parsed.field });
  }

  const outcome = await deps.requestOtp(tenant.businessId, parsed.data, parsedRequest.data.clientIp, deps.now());
  switch (outcome.kind) {
    case "otp_sent":
      return reply(200, { status: "otp_sent", otpId: outcome.otpId, expiresInSeconds: outcome.expiresInSeconds, phoneHint: outcome.phoneHint });
    case "unavailable":
      return reply(403, { status: "error", code: "unavailable", message: UNAVAILABLE_MESSAGE, field: null });
    case "paused":
      return reply(409, { status: "error", code: "paused", message: outcome.message, field: null });
    case "invalid":
      return reply(422, { status: "error", code: "invalid", message: outcome.message, field: outcome.field });
    case "taken":
      return reply(409, { status: "error", code: "taken", message: TAKEN_MESSAGE, field: null });
    case "limited":
      return reply(429, { status: "error", code: "limited", message: LIMITED_MESSAGE, field: null });
    case "failed":
      return reply(500, { status: "error", code: "failed", message: FAILED_MESSAGE, field: null });
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled booking OTP outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}
