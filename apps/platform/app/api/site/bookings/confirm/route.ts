import { handleBookingConfirmRequest } from "@/lib/server/booking-confirm-intake";
import { confirmBookingOtp } from "@/lib/server/booking-confirm";
import { findTenantBySiteToken } from "@/lib/server/site-api";

/**
 * `POST /api/site/bookings/confirm` — a client site's server confirming a booking OTP. Server-to-server only (see
 * lib/server/booking-confirm-intake.ts): no CORS, since a browser is never the caller. Only POST is exported: any
 * other method gets Next.js's own 405/preflight handling, still with no CORS headers.
 */
export function POST(request: Request): Promise<Response> {
  return handleBookingConfirmRequest(request, {
    findTenant: findTenantBySiteToken,
    confirmOtp: confirmBookingOtp,
    now: () => new Date(),
  });
}
