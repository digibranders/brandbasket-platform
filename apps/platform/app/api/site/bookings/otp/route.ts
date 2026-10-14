import { handleBookingOtpRequest } from "@/lib/server/booking-otp-intake";
import { requestBookingOtp } from "@/lib/server/booking-otp";
import { findTenantBySiteToken } from "@/lib/server/site-api";

/**
 * `POST /api/site/bookings/otp` — a client site's server requesting an OTP for a chosen slot. Server-to-server
 * only (see lib/server/booking-otp-intake.ts): no CORS, since a browser is never the caller. Only POST is
 * exported, same as `/api/site/bookings/confirm`: Next.js answers any other defined-but-wrong method with its own
 * 405, and -- since OPTIONS is not defined here either -- a bare 204 with an `Allow` header of its own for a
 * preflight-style OPTIONS request, still with no CORS headers.
 */
export function POST(request: Request): Promise<Response> {
  return handleBookingOtpRequest(request, {
    findTenant: findTenantBySiteToken,
    requestOtp: requestBookingOtp,
    now: () => new Date(),
  });
}
