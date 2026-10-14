import "server-only";
import { isRealDeployment } from "@fynix/billing";
import { z } from "zod";

const POSTGRES_PROTOCOL = /^postgres(ql)?$/;
const HTTP_PROTOCOL = /^https?$/;

/**
 * An absolute http(s) URL, normalised to just its origin (scheme, host and port) so a trailing
 * slash or a path on the env var cannot silently change `baseURL` or `trustedOrigins`.
 */
function originUrl(message: string): z.ZodPipe<z.ZodURL, z.ZodTransform<string, string>> {
  return z.url({ protocol: HTTP_PROTOCOL, error: message }).transform((value) => new URL(value).origin);
}

const serverEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: POSTGRES_PROTOCOL, error: "DATABASE_URL must be a postgresql:// URL" }),
  DATABASE_URL_STAFF: z.url({
    protocol: POSTGRES_PROTOCOL,
    error: "DATABASE_URL_STAFF must be a postgresql:// URL",
  }),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  APP_ORIGIN: originUrl("APP_ORIGIN must be an absolute http:// or https:// URL"),
  ADMIN_ORIGIN: originUrl("ADMIN_ORIGIN must be an absolute http:// or https:// URL"),
  DATABASE_URL_PAYLOAD: z.url({
    protocol: POSTGRES_PROTOCOL,
    error: "DATABASE_URL_PAYLOAD must be a postgresql:// URL",
  }),
  PAYLOAD_SECRET: z.string().min(32, "PAYLOAD_SECRET must be at least 32 characters"),
});

export type ServerEnv = z.output<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Parsed on first use, so a build does not need these secrets. */
export function serverEnv(): ServerEnv {
  if (cached === undefined) {
    const parsed = serverEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        `Invalid server configuration. Run "pnpm env:init" or check apps/platform/.env.local.\n${z.prettifyError(parsed.error)}`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}

// ---------------------------------------------------------------------------------------------------------------
// Booking OTP / SMS: read lazily, only when a booking endpoint actually runs, so every other page (and every test
// that never touches booking) never needs these set. Same shape as billing.ts's requiredRazorpayEnv.
// ---------------------------------------------------------------------------------------------------------------

const bookingOtpSecretSchema = z.string().min(32, "BOOKING_OTP_SECRET must be at least 32 characters");

let cachedBookingOtpSecret: string | undefined;

/** The HMAC-SHA256 key booking OTP codes are hashed with. Required only once a booking OTP endpoint runs; parsed
 * (and cached) the first time it is read, not at process start. */
export function bookingOtpSecret(): string {
  if (cachedBookingOtpSecret === undefined) {
    const parsed = bookingOtpSecretSchema.safeParse(process.env.BOOKING_OTP_SECRET);
    if (!parsed.success) {
      throw new Error(`Invalid booking configuration: ${z.prettifyError(parsed.error)}`);
    }
    cachedBookingOtpSecret = parsed.data;
  }
  return cachedBookingOtpSecret;
}

const accountCodeSecretSchema = z.string().min(32, "ACCOUNT_CODE_SECRET must be at least 32 characters");

/**
 * The HMAC-SHA256 key the emailed sign-up code is hashed with (lib/server/account-email-code.ts): ACCOUNT_CODE_SECRET,
 * which a Fynix deployment sets, else BOOKING_OTP_SECRET, the key Fynix Digital's texted codes already use. Read when a code
 * is asked for or checked, not at start, so a deployment that never sends one needs neither.
 */
export function accountCodeSecret(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = env.ACCOUNT_CODE_SECRET?.trim() || env.BOOKING_OTP_SECRET?.trim();
  if (!configured) throw new Error("Invalid sign-up code configuration: ACCOUNT_CODE_SECRET is required (at least 32 characters)");
  const parsed = accountCodeSecretSchema.safeParse(configured);
  if (!parsed.success) throw new Error(`Invalid sign-up code configuration: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

/** The SMS_PROVIDER env var, unparsed and unvalidated: `createSmsSender` (lib/server/sms) is the single place that
 * interprets its value and rejects one it doesn't recognize, so the list of supported providers lives there, not
 * here. Blank or unset both mean "outbox" -- an env file with the line present but empty (`SMS_PROVIDER=`) should
 * behave exactly like the line being absent, not like an unknown, rejected provider name. */
export function smsProviderName(): string {
  const value = process.env.SMS_PROVIDER?.trim();
  return value ? value : "outbox";
}

const msg91Schema = z.object({
  MSG91_AUTH_KEY: z.string().min(1, "MSG91_AUTH_KEY is required when SMS_PROVIDER=msg91"),
  MSG91_TEMPLATE_ID: z.string().min(1, "MSG91_TEMPLATE_ID is required when SMS_PROVIDER=msg91"),
});

export interface Msg91Env {
  readonly authKey: string;
  readonly templateId: string;
}

/** MSG91's key and its one DLT template id, read only when `SMS_PROVIDER=msg91` actually sends, so a deployment on
 * another provider never needs them. */
export function msg91Env(): Msg91Env {
  const parsed = msg91Schema.safeParse({
    MSG91_AUTH_KEY: process.env.MSG91_AUTH_KEY?.trim(),
    MSG91_TEMPLATE_ID: process.env.MSG91_TEMPLATE_ID?.trim(),
  });
  if (!parsed.success) throw new Error(`Invalid SMS configuration: ${z.prettifyError(parsed.error)}`);
  return {
    authKey: parsed.data.MSG91_AUTH_KEY,
    templateId: parsed.data.MSG91_TEMPLATE_ID,
  };
}

/**
 * Reads a TEMPORARY OTP bypass switch. Only the exact value "true" turns it on, and never where real customers can
 * reach the app: there it would let anyone use anyone's number. A real deployment also refuses to start with one set
 * (packages/shared/src/server/runtime-environment.ts).
 */
function otpBypassSwitch(name: "BOOKING_OTP_BYPASS" | "SIGNUP_OTP_BYPASS" | "VERIFY_OTP_BYPASS" | "EMAIL_CODE_BYPASS"): boolean {
  if (process.env[name]?.trim() !== "true") return false;
  return !isRealDeployment({ VERCEL_ENV: process.env.VERCEL_ENV, APP_ORIGIN: process.env.APP_ORIGIN });
}

/**
 * TEMPORARY, until a real SMS provider is connected: `BOOKING_OTP_BYPASS=true` lets online booking run with no SMS
 * at all. requestBookingOtp then sends nothing (and needs no SMS provider; it takes effect only on a local or private deployment), and
 * confirmBookingOtp accepts any 6-digit code. Every other booking rule still applies -- the slot checks, the rate
 * limits, the 10-minute expiry and the 5-attempt ceiling -- but the phone number is NOT verified: anyone can book
 * under any number. Only the exact value "true" turns it on; unset, blank or anything else leaves real OTPs in
 * force. Remove this switch once SMS_PROVIDER names a real provider.
 */
export function bookingOtpBypassed(): boolean {
  return otpBypassSwitch("BOOKING_OTP_BYPASS");
}

/**
 * TEMPORARY, until a real SMS provider is connected: `SIGNUP_OTP_BYPASS=true` lets an account be opened with no SMS at
 * all. requestAccountOtp then sends nothing for a sign-up (and needs no SMS provider; it takes effect only on a local or private deployment), and
 * confirmAccountOtp accepts any 6-digit code for it. Everything else about the step still applies -- the country
 * rule, the rate limits, the 10-minute expiry, one use -- but the mobile number is NOT proven: anyone can open an
 * account under any number, which its real owner then cannot use until we free it.
 *
 * It covers the sign-up only, never a password reset: any six digits there would let anyone take over any account,
 * so that code is always texted and always checked. Only the exact value "true" turns it on; unset, blank or
 * anything else leaves real codes in force. Remove this switch once SMS_PROVIDER names a real provider.
 */
export function signupOtpBypassed(): boolean {
  return otpBypassSwitch("SIGNUP_OTP_BYPASS");
}

/**
 * TEMPORARY, until the real ways of proving a business are built (GBP, GST or a video): `VERIFY_OTP_BYPASS=true` lets
 * an owner mark their own business Verified with any six digits. requestAccountOtp then sends nothing for a business
 * verification (and needs no SMS provider; it takes effect only on a local or private deployment), and confirmAccountOtp accepts any 6-digit code for it.
 * The step still expires, is used once and keeps its limits, but nothing is proven: anyone signed in to a claimed
 * business can verify it, and Verified is the top tier of the directory's ranking, so leave this OFF anywhere real
 * businesses compete for a place. With it off, the code is texted and checked like a password reset's (and `unavailable`
 * where production has no SMS provider). Only the exact value "true" turns it on.
 */
export function verifyOtpBypassed(): boolean {
  return otpBypassSwitch("VERIFY_OTP_BYPASS");
}

/**
 * Local development only: `EMAIL_CODE_BYPASS=true` makes the Fynix email sign-up accept ANY 6-digit code, so the flow can
 * be tested without opening the inbox. The code is still emailed (to the outbox locally), expires, is used once and keeps
 * its tries and limits; only the match is skipped, so the address is NOT proven. It covers the sign-up only, and is
 * ignored wherever real customers can reach the app, which also refuses to start with it set (runtime-environment.ts).
 */
export function emailCodeBypassed(): boolean {
  return otpBypassSwitch("EMAIL_CODE_BYPASS");
}

const DEFAULT_SMS_ALLOWED_COUNTRY_CODES = ["91"];

/** The calling codes (no leading "+") `requestBookingOtp`'s SMS-pumping guard will text -- everything else is
 * refused before any rate limit is spent. Comma-separated in `SMS_ALLOWED_COUNTRY_CODES`; defaults to India only
 * ("91"), since that's the only market this app serves today. Review before enabling a real SMS provider: sending
 * to a wider set of countries is exactly the exposure toll fraud (SMS pumping) targets. */
export function smsAllowedCountryCodes(): readonly string[] {
  const raw = process.env.SMS_ALLOWED_COUNTRY_CODES?.trim();
  if (!raw) return DEFAULT_SMS_ALLOWED_COUNTRY_CODES;
  const codes = raw
    .split(",")
    .map((code) => code.trim())
    .filter((code) => code !== "");
  return codes.length > 0 ? codes : DEFAULT_SMS_ALLOWED_COUNTRY_CODES;
}

// ---------------------------------------------------------------------------------------------------------------
// Google Business Profile import (docs/superpowers/specs/2026-10-01-business-profile-design.md): optional. Read
// lazily, only when the Business profile asks, so every other page works without it.
// ---------------------------------------------------------------------------------------------------------------

export interface GoogleBusinessCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

/**
 * The OAuth client the Details tab's import signs in with, or null while it is not set up (both variables blank or
 * unset), which leaves the button off. One set without the other is a configuration mistake, and throws.
 */
export function googleBusinessCredentials(): GoogleBusinessCredentials | null {
  const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim() ?? "";
  if (clientId === "" && clientSecret === "") return null;
  if (clientId === "" || clientSecret === "") {
    throw new Error("Invalid Google import configuration: set both GOOGLE_BUSINESS_CLIENT_ID and GOOGLE_BUSINESS_CLIENT_SECRET, or neither.");
  }
  return { clientId, clientSecret };
}
