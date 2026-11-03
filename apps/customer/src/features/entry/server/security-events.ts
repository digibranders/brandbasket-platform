import "server-only";
import { consumeRateLimit, type RateLimitRule } from "@brandbasket/db";
import { createAppEmailTransport, emailTeamInboxDefault, securityEventAlertEmail } from "@brandbasket/email";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { getStaffDb } from "@/lib/db";

/**
 * Signs of an attack, counted across every server and emailed to the team once they pass a limit (CERT-In Directions 2022;
 * vps-setup/BREACH-RESPONSE.md). Counting uses the shared rate-limit table, so the four app processes count together, and a
 * second, one-per-hour window keeps a flood from becoming a flood of email. Never throws and never delays the request that
 * reported it. Ported from apps/platform lib/server/security-events.ts with the sign-in event only; the keys are the same, so
 * both apps count together while both are live.
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
} as const satisfies Record<string, SecurityEvent>;

export type SecurityEventKind = keyof typeof SECURITY_EVENTS;

/** Who is told: as apps/platform lib/security-review.ts securityAlertRecipient. */
function securityAlertRecipient(env: Readonly<Record<string, string | undefined>>): string {
  return env.SECURITY_ALERT_EMAIL?.trim() || env.SUPPORT_ALERT_EMAIL?.trim() || env.BRANDBASKET_TEAM_EMAIL?.trim() || emailTeamInboxDefault();
}

/** The staff console, where the access log is read. */
function consoleOrigin(): string {
  return process.env.ADMIN_ORIGIN?.trim() || "https://console.brandbasket.in";
}

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
        app: "customer",
        consoleUrl: new URL("/access-log", consoleOrigin()).toString(),
      }),
    );
  } catch (error) {
    console.error("[security-event] Could not count or report a security event.", { kind, ...errorLogInfo(error) });
  }
}
