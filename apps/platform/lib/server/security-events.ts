import "server-only";
import { consumeRateLimit, type RateLimitRule } from "@firstfold/db";
import { createAppEmailTransport, securityEventAlertEmail } from "@firstfold/email";
import { errorLogInfo } from "@firstfold/shared/server/error-log-info";
import { securityAlertRecipient } from "@/lib/security-review";
import { getStaffDb } from "./db";
import { serverEnv } from "./env";

/**
 * Signs of an attack, counted across every server and emailed to the team once they pass a limit (CERT-In Directions 2022;
 * vps-setup/BREACH-RESPONSE.md). Counting uses the shared rate-limit table, so the four app processes count together, and a
 * second, one-per-hour window keeps a flood from becoming a flood of email. Never throws and never delays the request that
 * reported it.
 */

const ONE_HOUR_SECONDS = 60 * 60;

interface SecurityEvent {
  readonly label: string;
  readonly advice: string;
  /** How many in the window before the team is told. */
  readonly limit: number;
  readonly windowSeconds: number;
}

export const SECURITY_EVENTS = {
  sign_in_blocked: {
    label: "Sign-ins blocked for too many tries",
    advice:
      "Many sign-ins were refused for too many wrong passwords. This can be someone trying stolen passwords against many accounts. Check the app's logs for the addresses involved, and consider a Cloudflare rule if it continues.",
    limit: 20,
    windowSeconds: ONE_HOUR_SECONDS,
  },
  webhook_signature_invalid: {
    label: "Payment notices with a bad signature",
    advice:
      "Messages claiming to be from Razorpay arrived with a signature that does not match. Someone may be trying to fake a payment. Check that RAZORPAY_WEBHOOK_SECRET matches the Razorpay dashboard, then look at the addresses in the logs.",
    limit: 3,
    windowSeconds: ONE_HOUR_SECONDS,
  },
} as const satisfies Record<string, SecurityEvent>;

export type SecurityEventKind = keyof typeof SECURITY_EVENTS;

const ALERT_RULE: RateLimitRule = { limit: 1, windowSeconds: ONE_HOUR_SECONDS };

/** Counts one event of `kind`; the first time in a window that the count passes its limit, emails the team. */
export async function noteSecurityEvent(kind: SecurityEventKind, now: Date = new Date()): Promise<void> {
  try {
    const event = SECURITY_EVENTS[kind];
    const db = getStaffDb();
    const counted = await consumeRateLimit(db, `security-event:${kind}`, { limit: event.limit - 1, windowSeconds: event.windowSeconds }, now);
    if (counted.allowed) return;
    const alert = await consumeRateLimit(db, `security-alert:${kind}`, ALERT_RULE, now);
    if (!alert.allowed) return;
    await createAppEmailTransport(db).send(
      securityEventAlertEmail({
        to: securityAlertRecipient(process.env),
        eventLabel: event.label,
        advice: event.advice,
        count: event.limit,
        windowMinutes: event.windowSeconds / 60,
        app: "platform",
        consoleUrl: new URL("/access-log", serverEnv().ADMIN_ORIGIN).toString(),
      }),
    );
  } catch (error) {
    console.error("[security-event] Could not count or report a security event.", { kind, ...errorLogInfo(error) });
  }
}
