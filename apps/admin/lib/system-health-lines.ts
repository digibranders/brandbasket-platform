import type { DeliverySource, SourceHealth } from "@brandbasket/db";
import type { SystemLine } from "@/lib/server/system-health";
import { clock, shortDate, todayRange } from "@/lib/team-time";

/** The delivery sources in the order Today's systems block lists them, before Website errors. */
export const DELIVERY_ORDER: readonly DeliverySource[] = ["razorpay", "calcom", "oyechats", "brevo", "teams"];

export const DELIVERY_LABELS: Readonly<Record<DeliverySource, string>> = {
  razorpay: "Razorpay payments",
  calcom: "Cal.com bookings",
  oyechats: "OyeChats leads",
  brevo: "Brevo email",
  teams: "Teams alerts",
};

/** A clock for something that happened today, a date for anything older. */
function when(date: Date, now: Date): string {
  return date.getTime() >= todayRange(now).start.getTime() ? clock(date) : shortDate(date);
}

/** One source's line over the last 24 hours: bad when its latest try failed, warn when some failed, ok otherwise. */
export function deliveryLine(source: DeliverySource, health: SourceHealth, now: Date): Pick<SystemLine, "state" | "detail"> {
  const { failed, lastOkAt, lastFailedAt } = health;
  if (failed > 0) {
    const latestFailed = lastOkAt === null || (lastFailedAt !== null && lastFailedAt > lastOkAt);
    return { state: latestFailed ? "bad" : "warn", detail: source === "brevo" ? `${failed} not sent` : `${failed} failed` };
  }
  if (lastOkAt === null) return { state: "ok", detail: "none in 24 hours" };
  return { state: "ok", detail: source === "teams" ? "all sent" : `last ${when(lastOkAt, now)}` };
}
