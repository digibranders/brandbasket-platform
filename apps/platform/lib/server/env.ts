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
// Emailed codes (sign-up, a patient's booking, a privacy request): read lazily, only when a code is asked for or checked,
// so every other page (and every test that never touches a code) never needs these set. Same shape as billing.ts's
// requiredRazorpayEnv.
// ---------------------------------------------------------------------------------------------------------------

const accountCodeSecretSchema = z.string().min(32, "ACCOUNT_CODE_SECRET must be at least 32 characters");

/**
 * The HMAC-SHA256 key every emailed code is hashed with (lib/server/account-email-code.ts, booking-otp.ts,
 * privacy-requests.ts): ACCOUNT_CODE_SECRET, which a Fynix deployment sets, else BOOKING_OTP_SECRET, the name an older
 * deployment already has it under. Read when a code is asked for or checked, not at start, so a deployment that never sends
 * one needs neither.
 */
export function accountCodeSecret(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = env.ACCOUNT_CODE_SECRET?.trim() || env.BOOKING_OTP_SECRET?.trim();
  if (!configured) throw new Error("Invalid email code configuration: ACCOUNT_CODE_SECRET is required (at least 32 characters)");
  const parsed = accountCodeSecretSchema.safeParse(configured);
  if (!parsed.success) throw new Error(`Invalid email code configuration: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

/**
 * Reads a local-development switch. Only the exact value "true" turns it on, and never where real customers can reach the
 * app: there it would let anyone use anyone's address. A real deployment also refuses to start with one set
 * (packages/shared/src/server/runtime-environment.ts).
 */
function bypassSwitch(name: "EMAIL_CODE_BYPASS"): boolean {
  if (process.env[name]?.trim() !== "true") return false;
  return !isRealDeployment({ VERCEL_ENV: process.env.VERCEL_ENV, APP_ORIGIN: process.env.APP_ORIGIN });
}

/**
 * Local development only: `EMAIL_CODE_BYPASS=true` makes every emailed code (the sign-up, a patient's booking, a privacy
 * request) accept ANY 6-digit code, so the flows can be tested without opening the inbox. The code is still emailed (to
 * the outbox locally), expires, is used once and keeps its tries and limits; only the match is skipped, so the address is
 * NOT proven. It is ignored wherever real customers can reach the app, which also refuses to start with it set
 * (runtime-environment.ts).
 */
export function emailCodeBypassed(): boolean {
  return bypassSwitch("EMAIL_CODE_BYPASS");
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
