/**
 * Week availability and the two-step OTP booking a client site's server calls. A copy of the platform's
 * apps/platform/lib/site-bookings.ts. ADDITIVE CHANGES ONLY.
 *
 * The booking is two calls, both server-to-server with the site's bearer token:
 *  1. `POST /api/site/bookings/otp` with a `SiteOtpRequest`: the patient's name, EMAIL and phone, and the slot. The
 *     platform EMAILS a 6-digit code to that address (the phone is the clinic's to call: it is collected, never verified
 *     and nothing is sent to it) and answers `otp_sent` with an `otpId` and an `emailHint` to show ("p•••@gmail.com").
 *  2. `POST /api/site/bookings/confirm` with a `SiteOtpConfirm`: the `otpId` and the code the patient typed. The slot
 *     is booked only now.
 */
export type SiteSlotState = "free" | "taken" | "past";
export interface SiteSlot {
  readonly start: string; // "HH:MM", business local time
  readonly end: string;   // "HH:MM"
  readonly state: SiteSlotState;
}
export interface SiteAvailabilityDay {
  readonly date: string; // YYYY-MM-DD
  /** True on a closure, a weekday with no hours, or a day outside the booking window. */
  readonly closed: boolean;
  /** The closure's note when a closure caused it, else null. */
  readonly closedNote: string | null;
  readonly slots: readonly SiteSlot[]; // empty when closed
}
export interface SiteAvailability {
  readonly weekStart: string; // the Monday, YYYY-MM-DD
  readonly today: string;
  readonly slotMinutes: number;
  /** Monday of the previous week, or null when that week is entirely in the past. */
  readonly previousWeek: string | null;
  /** Monday of the next week, or null when it starts after the booking window. */
  readonly nextWeek: string | null;
  readonly days: readonly SiteAvailabilityDay[]; // always 7, Monday first
}
export interface SiteBookingFields {
  readonly name: string;
  /** The address the confirmation code is emailed to (added 2026-10-14, when the code moved to email). Typed
   * optional only so a client site built before it existed still compiles: a body without one is answered 422 with
   * `field: "email"`, and nothing is emailed. */
  readonly email?: string | null;
  /** A number the clinic can call. Collected, but never verified: nothing is sent to it. */
  readonly phone: string;
  readonly serviceId?: string | null;
  readonly date: string;  // YYYY-MM-DD
  readonly start: string; // HH:MM
  /** @deprecated Ignored since 2026-09-28: the booking no longer asks for a note. Kept for the same reason. */
  readonly note?: string | null;
  /** Honeypot: left empty by people. */
  readonly website?: string | null;
  /** Null or missing: any doctor. */
  readonly practitionerId?: string | null;
  /** The version of the patient notice the page showed above the booking button (PATIENT_NOTICE_VERSION in
   * @brandbasket/shared/lib/privacy/patient-notice), kept as proof of the notice the patient saw. Optional while client
   * sites catch up. */
  readonly noticeVersion?: string | null;
}
export interface SiteOtpRequest {
  readonly fields: SiteBookingFields;
  readonly clientIp: string;
}
export interface SiteOtpConfirm {
  readonly otpId: string;
  readonly code: string;
  readonly clientIp: string;
}
export type SiteBookingErrorCode =
  | "invalid" | "taken" | "paused" | "unavailable" | "limited" | "failed"
  | "wrong_code" | "expired" | "too_many_attempts";
export type SiteBookingError = {
  readonly status: "error";
  readonly code: SiteBookingErrorCode;
  readonly message: string;
  readonly field: string | null;
};
export type SiteOtpResponse =
  | {
      readonly status: "otp_sent";
      readonly otpId: string;
      readonly expiresInSeconds: number;
      /** Where the code went, with most of it hidden ("p•••@gmail.com"). Replaces `phoneHint`, which is no longer sent. */
      readonly emailHint: string;
    }
  | SiteBookingError;
export type SiteConfirmResponse =
  | {
      readonly status: "booked";
      readonly date: string;
      readonly start: string;
      readonly end: string;
      /** The doctor the booking went to; null when their name could not be read back. Missing from platforms older
       * than 2026-09-28. */
      readonly practitionerName?: string | null;
    }
  | SiteBookingError;
