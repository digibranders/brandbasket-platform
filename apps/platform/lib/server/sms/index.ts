import "server-only";
import { getStaffDb } from "@/lib/server/db";
import { msg91Env, smsProviderName } from "@/lib/server/env";
import { createMsg91Sender } from "./msg91-sender";
import { createOutboxSender } from "./outbox-sender";
import { otpSmsBinding, otpSmsBindings, type OtpSmsSurface } from "./domain-binding";
import { otpMessage as renderOtpMessage } from "./otp-message";
import type { SmsSender } from "./types";

export type { SmsMessage, SmsSender } from "./types";

/** Booking omits the surface and keeps its existing template until approved tenant hosts and client UI exist. */
export function otpMessage(code: string, surface?: OtpSmsSurface, brandName?: string): string {
  return renderOtpMessage(code, surface === undefined ? undefined : otpSmsBinding(surface)?.host, brandName);
}

/**
 * How to add a real provider later (MSG91, Twilio, ...):
 * 1. Implement `SmsSender` (./types.ts) in a new file here, e.g. `msg91-sender.ts`, whose `send` calls that
 *    provider's API. It receives the fully-rendered message body from `otpMessage` — it must send that text
 *    unchanged, never reformat or translate it.
 * 2. Add a `case` for it below, reading whatever env vars that provider needs (API key, sender id, ...) — follow
 *    `lib/server/env.ts`'s lazy-read pattern (see `bookingOtpSecret`), so an unrelated deployment never needs them
 *    set.
 * 3. Add the provider's name to `SUPPORTED_SMS_PROVIDERS` below and to `SMS_PROVIDER`'s comment in `.env.example`.
 * 4. If the provider serves Indian numbers, register `otpMessage`'s exact template text with the operator's DLT
 *    (Distributed Ledger Technology) platform first — an unregistered template is silently dropped, not bounced —
 *    and never change that text without re-registering it.
 * 5. Review `SMS_ALLOWED_COUNTRY_CODES` (lib/server/env.ts's `smsAllowedCountryCodes`, checked in
 *    `requestBookingOtp` before a real send is ever attempted) before switching this on: it defaults to India
 *    only, and a real provider — unlike the local outbox — actually spends money per message, which is exactly
 *    what SMS pumping (toll fraud) abuses. Widen it deliberately to match the countries the new provider should
 *    actually serve; never just delete the guard.
 */
const SUPPORTED_SMS_PROVIDERS = ["outbox", "msg91"] as const;

/** Thrown by `createSmsSender` when `SMS_PROVIDER` resolves to the local outbox on a production deployment --
 * carries no patient or request data, only the fact that the provider is misconfigured, so it is safe to log
 * as-is. Callers (see `requestBookingOtp`) turn this into a 403 "unavailable" response rather than the generic
 * 500 any other `createSmsSender` failure produces, since this is a deployment configuration problem, not a
 * transient one. */
export class SmsProviderUnavailableError extends Error {
  constructor() {
    super('SMS_PROVIDER resolved to "outbox" in production: the local outbox never sends a real SMS.');
    this.name = "SmsProviderUnavailableError";
  }
}

/** Reads `SMS_PROVIDER` (default "outbox") and returns the matching sender, or throws a clear configuration error
 * naming the supported values when it names something else. In production, "outbox" itself is refused (see
 * `SmsProviderUnavailableError`): it writes to `sms_messages` instead of sending anything, which is fine for local
 * development and test but must never be what a real deployment quietly falls back to when no real provider is
 * configured. `NODE_ENV` is read directly (not through `serverEnv()`), same as `getBillingProvider`'s production
 * check, so this stays lenient (and requires nothing extra) in every environment but production. */
export function createSmsSender(): SmsSender {
  const provider = smsProviderName();
  if (provider === "outbox" && process.env.NODE_ENV === "production") {
    throw new SmsProviderUnavailableError();
  }
  switch (provider) {
    case "outbox":
      return createOutboxSender(getStaffDb());
    case "msg91": {
      const env = msg91Env();
      return createMsg91Sender({ authKey: env.authKey, templateId: env.templateId, bindings: otpSmsBindings() });
    }
    default:
      throw new Error(`Unknown SMS_PROVIDER "${provider}". Supported values: ${SUPPORTED_SMS_PROVIDERS.join(", ")}.`);
  }
}
