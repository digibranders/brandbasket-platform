import "server-only";
import { isRealDeployment } from "@brandbasket/billing";
import { z } from "zod";

/*
 * The entry screens' settings, read lazily: only when a code is asked for or checked, or an ad link is opened, so every other
 * page runs without them. Ported from apps/platform lib/server/env.ts and lib/server/website-api-auth.ts.
 */

const accountCodeSecretSchema = z.string().min(32, "ACCOUNT_CODE_SECRET must be at least 32 characters");

/**
 * The HMAC-SHA256 key every emailed sign-up code is hashed with: ACCOUNT_CODE_SECRET, else BOOKING_OTP_SECRET, the name an
 * older deployment has it under. Must equal apps/platform's value while both apps take sign-ups on one database.
 */
export function accountCodeSecret(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = env.ACCOUNT_CODE_SECRET?.trim() || env.BOOKING_OTP_SECRET?.trim();
  if (!configured) throw new Error("Invalid email code configuration: ACCOUNT_CODE_SECRET is required (at least 32 characters)");
  const parsed = accountCodeSecretSchema.safeParse(configured);
  if (!parsed.success) throw new Error(`Invalid email code configuration: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

/**
 * Local development only: `EMAIL_CODE_BYPASS=true` makes the sign-up accept ANY 6-digit code. The code is still emailed (to
 * the outbox locally), expires, is used once and keeps its tries and limits; only the match is skipped. Ignored wherever
 * real customers can reach the app.
 */
export function emailCodeBypassed(): boolean {
  if (process.env.EMAIL_CODE_BYPASS?.trim() !== "true") return false;
  return !isRealDeployment({ VERCEL_ENV: process.env.VERCEL_ENV, APP_ORIGIN: process.env.APP_ORIGIN });
}

const LEADS_API_TOKEN_MIN_LENGTH = 32;

/**
 * LEADS_API_TOKEN, the secret the marketing website shares with the app, which also seals the ad landing page's `start`
 * token (../rules/start-token.ts). Null when it is unset or too short to be one: ad links then prefill nothing.
 */
export function leadsApiToken(): string | null {
  const token = process.env.LEADS_API_TOKEN?.trim() ?? "";
  return token.length >= LEADS_API_TOKEN_MIN_LENGTH ? token : null;
}
