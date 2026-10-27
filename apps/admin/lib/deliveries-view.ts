import type {
  AlertDestination,
  AlertResult,
  DeliveryHealth,
  DeliverySource,
  EmailStatus,
  StoredAlertDelivery,
  StoredEmail,
  StoredWebhookEvent,
  WebhookResult,
} from "@brandbasket/db";
import type { FigureItem } from "@/components/console/figures";

export type DeliveryDirection = "in" | "out";
/** ok: it went through. quiet: nothing went wrong, nothing was done (ignored, kept locally). failed: someone should look. */
export type DeliveryOutcome = "ok" | "quiet" | "failed";

/** One line of the Deliveries list, whatever its source. */
export interface DeliveryRow {
  readonly id: string;
  readonly at: Date;
  readonly source: DeliverySource;
  readonly direction: DeliveryDirection;
  readonly event: string;
  /** A provider's own event code, shown in a code style. */
  readonly eventIsCode: boolean;
  /** The client, the address an email went to, or the alert's title; null when not known. */
  readonly target: string | null;
  readonly outcome: DeliveryOutcome;
  readonly resultLabel: string;
  /** Why it failed, when known. */
  readonly detail: string | null;
  readonly resend: "email" | "alert" | null;
  readonly href: string;
}

export interface DeliveryFilter {
  readonly failedOnly: boolean;
  readonly direction: DeliveryDirection | null;
  readonly source: DeliverySource | null;
  readonly search: string | null;
}

export const DELIVERY_SOURCES: readonly DeliverySource[] = ["razorpay", "calcom", "oyechats", "brevo", "teams"];

export const SOURCE_LABELS: Readonly<Record<DeliverySource, string>> = {
  razorpay: "Razorpay",
  calcom: "Cal.com",
  oyechats: "OyeChats",
  brevo: "Brevo",
  teams: "Teams",
};

const FIGURE_LABELS: Readonly<Record<DeliverySource, string>> = {
  razorpay: "Razorpay",
  calcom: "Cal.com",
  oyechats: "OyeChats",
  brevo: "Brevo email",
  teams: "Teams alerts",
};

const WEBHOOK_LABELS: Readonly<Record<WebhookResult, string>> = { handled: "Handled", ignored: "Ignored", failed: "Failed", bad_signature: "Bad signature" };
const WEBHOOK_OUTCOMES: Readonly<Record<WebhookResult, DeliveryOutcome>> = { handled: "ok", ignored: "quiet", failed: "failed", bad_signature: "failed" };
const EMAIL_LABELS: Readonly<Record<EmailStatus, string>> = { sent: "Sent", local_only: "Kept, not sent", failed: "Not sent" };
const EMAIL_OUTCOMES: Readonly<Record<EmailStatus, DeliveryOutcome>> = { sent: "ok", local_only: "quiet", failed: "failed" };
const ALERT_LABELS: Readonly<Record<AlertResult, string>> = { sent: "Sent", rejected: "Refused by Teams", unreachable: "Teams not reached", unreadable: "Address unreadable" };
const CHANNEL_LABELS: Readonly<Record<AlertDestination, string>> = { enquiries: "Enquiries card", support: "Requests card", system: "System card" };

const MAX_SEARCH = 100;

export function sourceDirection(source: DeliverySource): DeliveryDirection {
  return source === "brevo" || source === "teams" ? "out" : "in";
}

/** "setup-link" becomes "Setup link". */
function templateName(template: string): string {
  const words = template.replaceAll("-", " ").replaceAll("_", " ").trim();
  return words === "" ? "Email" : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

export function canResendEmail(email: Pick<StoredEmail, "status" | "bodyRedacted">): boolean {
  return email.status === "failed" && !email.bodyRedacted;
}

export function webhookRow(event: StoredWebhookEvent): DeliveryRow {
  return {
    id: event.id,
    at: event.receivedAt,
    source: event.source,
    direction: "in",
    event: event.eventType,
    eventIsCode: true,
    target: event.businessName,
    outcome: WEBHOOK_OUTCOMES[event.result],
    resultLabel: WEBHOOK_LABELS[event.result],
    detail: event.error,
    resend: null,
    href: `/deliveries/${event.id}`,
  };
}

export function emailRow(email: StoredEmail): DeliveryRow {
  const label = EMAIL_LABELS[email.status];
  return {
    id: email.id,
    at: email.createdAt,
    source: "brevo",
    direction: "out",
    event: templateName(email.template),
    eventIsCode: false,
    target: email.toAddress,
    outcome: EMAIL_OUTCOMES[email.status],
    resultLabel: email.status === "failed" && email.attempts > 1 ? `${label}, ${email.attempts} tries` : label,
    detail: email.error,
    resend: canResendEmail(email) ? "email" : null,
    href: `/outbox/${email.id}`,
  };
}

export function alertRow(alert: StoredAlertDelivery): DeliveryRow {
  return {
    id: alert.id,
    at: alert.createdAt,
    source: "teams",
    direction: "out",
    event: CHANNEL_LABELS[alert.destination],
    eventIsCode: false,
    target: alert.title,
    outcome: alert.result === "sent" ? "ok" : "failed",
    resultLabel: ALERT_LABELS[alert.result],
    detail: null,
    resend: alert.result !== "sent" && alert.card !== null ? "alert" : null,
    href: `/deliveries/${alert.id}`,
  };
}

/** The sources' rows laid together, newest first, `limit` at most. */
export function mergeDeliveries(lists: readonly (readonly DeliveryRow[])[], limit: number): DeliveryRow[] {
  return lists
    .flat()
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}

/** The page's filters from its address. Anything unknown is ignored. */
export function readDeliveryFilter(params: {
  readonly result?: string;
  readonly direction?: string;
  readonly source?: string;
  readonly q?: string;
}): DeliveryFilter {
  const search = (params.q ?? "").trim().slice(0, MAX_SEARCH);
  return {
    failedOnly: params.result === "failed",
    direction: params.direction === "in" || params.direction === "out" ? params.direction : null,
    source: DELIVERY_SOURCES.find((source) => source === params.source) ?? null,
    search: search === "" ? null : search,
  };
}

/** The page's address with some filters changed. */
export function deliveriesHref(filter: DeliveryFilter, change: Partial<DeliveryFilter>): string {
  const next = { ...filter, ...change };
  const params = new URLSearchParams();
  if (next.failedOnly) params.set("result", "failed");
  if (next.direction !== null) params.set("direction", next.direction);
  if (next.source !== null) params.set("source", next.source);
  if (next.search !== null) params.set("q", next.search);
  const query = params.toString();
  return query === "" ? "/deliveries" : `/deliveries?${query}`;
}

export function wantsSource(filter: DeliveryFilter, source: DeliverySource): boolean {
  return (filter.source === null || filter.source === source) && (filter.direction === null || filter.direction === sourceDirection(source));
}

export function wantsWebhooks(filter: DeliveryFilter): boolean {
  return filter.direction !== "out" && (filter.source === null || sourceDirection(filter.source) === "in");
}

export function deliveryFigures(health: DeliveryHealth): readonly FigureItem[] {
  return DELIVERY_SOURCES.map((source) => {
    const { total, failed } = health[source];
    const allGood = source === "brevo" || source === "teams" ? "all sent" : "all handled";
    const note = failed === 0 ? allGood : source === "brevo" ? `${failed} not sent` : `${failed} failed`;
    return { label: FIGURE_LABELS[source], value: total, note, tone: failed === 0 ? "good" : "bad" };
  });
}

export function deliveryTotals(health: DeliveryHealth): { readonly in: number; readonly out: number; readonly failed: number } {
  let incoming = 0;
  let outgoing = 0;
  let failed = 0;
  for (const source of DELIVERY_SOURCES) {
    if (sourceDirection(source) === "in") incoming += health[source].total;
    else outgoing += health[source].total;
    failed += health[source].failed;
  }
  return { in: incoming, out: outgoing, failed };
}
