import "server-only";
import { billingErrorTeamsCard } from "../lib/billing-error-card";
import type { TeamsMessage } from "../lib/teams-webhook";
import { onBillingError, type BillingLogEvent, type BillingLogFields } from "./billing-log";

/** The same billing error for the same business is told once in this long: a failing webhook is retried and would repeat itself. */
export const BILLING_ALERT_DEBOUNCE_MS = 5 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Starts telling the System channel about every billing error the code logs. `send` posts one message (best effort, as every
 * alert) and `consoleOrigin` is where the staff console lives, to link the client. Call once at startup.
 */
export function registerBillingErrorAlerts(send: (message: TeamsMessage) => Promise<void>, consoleOrigin: string, now: () => number = Date.now): void {
  const seen = new Map<string, number>();
  onBillingError((event: BillingLogEvent, fields: BillingLogFields) => {
    const businessId = typeof fields.businessId === "string" && UUID.test(fields.businessId) ? fields.businessId : null;
    const key = `${event}:${businessId ?? "none"}:${String(fields.reason ?? "")}`;
    const at = now();
    const last = seen.get(key);
    if (last !== undefined && at - last < BILLING_ALERT_DEBOUNCE_MS) return;
    seen.set(key, at);
    for (const [other, when] of seen) if (at - when >= BILLING_ALERT_DEBOUNCE_MS) seen.delete(other);
    const clientUrl = businessId === null ? null : new URL(`/clients/${businessId}`, consoleOrigin).toString();
    void send(billingErrorTeamsCard({ event, fields, clientUrl })).catch(() => undefined);
  });
}
