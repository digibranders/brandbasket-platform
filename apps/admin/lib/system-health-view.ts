import type { DeliveryHealth } from "@brandbasket/db";
import type { PillTone } from "@/components/console/status-pill";

/** What the Health page needs from the server, already read. A null part means that read failed. */
export interface HealthInput {
  readonly deliveries: DeliveryHealth | null;
  /** Grouped app errors that are new or being looked at. */
  readonly openErrors: number | null;
  /** The status of each Google sign-in the Brandbasket account holds; null for one that was never connected. */
  readonly googleStatuses: readonly ("connected" | "access_lost" | null)[] | null;
  /** How many of the Teams alert kinds have no usable address. */
  readonly teamsMissing: number | null;
  readonly teamsKinds: number;
}

export type HealthState = "ok" | "look" | "unknown";

export interface HealthRow {
  readonly key: "emails" | "webhooks" | "errors" | "google" | "teams" | "timers";
  readonly label: string;
  readonly state: HealthState;
  readonly detail: string;
  /** Where Open goes. */
  readonly href: string;
}

const WEBHOOK_SOURCES = ["razorpay", "calcom", "oyechats"] as const;
const COULD_NOT_CHECK = "Could not check. Try again.";

export const HEALTH_STATE_WORDS: Readonly<Record<HealthState, string>> = { ok: "Fine", look: "Needs a look", unknown: "Not known" };
export const HEALTH_STATE_TONES: Readonly<Record<HealthState, PillTone>> = { ok: "done", look: "problem", unknown: "todo" };

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

function emailRow(deliveries: DeliveryHealth | null): HealthRow {
  const base = { key: "emails", label: "Emails", href: "/deliveries?direction=out&result=failed" } as const;
  if (deliveries === null) return { ...base, state: "unknown", detail: COULD_NOT_CHECK };
  const failed = deliveries.brevo.failed;
  return failed === 0 ? { ...base, state: "ok", detail: "None failed in the last 24 hours" } : { ...base, state: "look", detail: `${failed} failed in the last 24 hours` };
}

function webhookRow(deliveries: DeliveryHealth | null): HealthRow {
  const base = { key: "webhooks", label: "Webhooks from other services", href: "/deliveries?direction=in&result=failed" } as const;
  if (deliveries === null) return { ...base, state: "unknown", detail: COULD_NOT_CHECK };
  const failed = WEBHOOK_SOURCES.reduce((sum, source) => sum + deliveries[source].failed, 0);
  return failed === 0 ? { ...base, state: "ok", detail: "None failed in the last 24 hours" } : { ...base, state: "look", detail: `${failed} failed in the last 24 hours` };
}

function errorsRow(openErrors: number | null): HealthRow {
  const base = { key: "errors", label: "App errors", href: "/support/errors" } as const;
  if (openErrors === null) return { ...base, state: "unknown", detail: COULD_NOT_CHECK };
  return openErrors === 0 ? { ...base, state: "ok", detail: "None open" } : { ...base, state: "look", detail: `${openErrors} open` };
}

function googleRow(statuses: HealthInput["googleStatuses"]): HealthRow {
  const base = { key: "google", label: "Google connections", href: "/settings#google" } as const;
  if (statuses === null) return { ...base, state: "unknown", detail: COULD_NOT_CHECK };
  const lost = statuses.filter((status) => status === "access_lost").length;
  if (lost > 0) return { ...base, state: "look", detail: `${plural(lost, "connection needs", "connections need")} reconnecting` };
  if (statuses.every((status) => status === null)) return { ...base, state: "unknown", detail: "Google has not been connected on this server" };
  return { ...base, state: "ok", detail: "Connected" };
}

function teamsRow(missing: number | null, kinds: number): HealthRow {
  const base = { key: "teams", label: "Teams alerts", href: "/settings#teams" } as const;
  if (missing === null) return { ...base, state: "unknown", detail: COULD_NOT_CHECK };
  if (missing === 0) return { ...base, state: "ok", detail: "Every alert kind has an address" };
  return { ...base, state: "look", detail: `${missing} of ${kinds} alert kinds have no usable address, so they are not sent to Teams` };
}

/** Timers write no run record today (CD-20), so the page says so rather than showing a green light it cannot back. */
const TIMERS_ROW: HealthRow = {
  key: "timers",
  label: "Scheduled jobs",
  state: "unknown",
  detail: "Not known. The timers do not record when they last ran yet.",
  href: "/deliveries",
};

/** Every row of the Health page, in the order the mock lists them. */
export function healthRows(input: HealthInput): readonly HealthRow[] {
  return [emailRow(input.deliveries), webhookRow(input.deliveries), errorsRow(input.openErrors), googleRow(input.googleStatuses), teamsRow(input.teamsMissing, input.teamsKinds), TIMERS_ROW];
}

/** How many rows need a look. A row that could not be read counts as "Not known", never as fine. */
export function needsLookCount(rows: readonly HealthRow[]): number {
  return rows.filter((row) => row.state === "look").length;
}
