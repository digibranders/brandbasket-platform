import "server-only";
import { errorLogInfo, type SafeErrorLog } from "@fynix/shared/server/error-log-info";

/** What is safe to log about a failure in the booking OTP flow -- never the error's own message, since Drizzle's
 * DrizzleQueryError puts the failed query's params (the patient's name, phone, note...) straight into its message.
 * `errorLogInfo` already extracts only what's safe; this just tags that with the business it happened for. Shared
 * by lib/server/booking-otp.ts and lib/server/booking-confirm.ts so both log failures the same shape. */
export interface LoggableBookingError extends SafeErrorLog {
  readonly businessId: string;
}

export function loggableBookingError(businessId: string, error: unknown): LoggableBookingError {
  return { businessId, ...errorLogInfo(error) };
}
