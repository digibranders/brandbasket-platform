/**
 * The zod schemas that validate a `SiteOtpRequest` and a `SiteOtpConfirm` (lib/site-bookings.ts's contract) on the
 * way in.
 *
 * Kept out of lib/site-bookings.ts itself, which client sites keep a verbatim copy of and which should stay nothing
 * but types — this file, and the zod dependency it needs, are platform-only.
 */
import { z } from "zod";
import { bookingFieldsSchema } from "@brandbasket/shared/lib/appointments/booking-form";
import { isOtpCode } from "@brandbasket/shared/lib/appointments/otp";

export const siteOtpRequestSchema = z.object({
  fields: bookingFieldsSchema,
  clientIp: z.string().min(1).max(64),
});

export const siteOtpConfirmSchema = z.object({
  otpId: z.string().min(1).max(200),
  // The same OTP_LENGTH-digit format check the client site's own input and the platform's own comparison
  // (otp-crypto.ts) agree on -- see isOtpCode's doc comment -- rather than a bound loose enough to admit a code
  // that could never actually match.
  code: z.string().refine(isOtpCode, "code must be a 6-digit code"),
  clientIp: z.string().min(1).max(64),
});
