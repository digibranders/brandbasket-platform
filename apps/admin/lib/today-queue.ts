import type { ErrorIssue, Lead, SupportTicket } from "@brandbasket/db";
import { SUPPORT_CATEGORY_LABELS } from "@brandbasket/shared/lib/support";
import type { AttentionItem } from "./pipeline";
import { clock, longDay, shortDate } from "./team-time";

/** Every kind of work Today shows: the pipeline's attention kinds, plus requests, sign-ups and errors. */
export type TodayKind = AttentionItem["kind"] | "request" | "signup" | "error";

export interface TodayItem {
  /** Unique across the queue. */
  readonly key: string;
  readonly kind: TodayKind;
  readonly href: string;
  readonly title: string;
  readonly detail: string;
  /** When it should be dealt with by; null when nothing sets a clock. */
  readonly dueAt: Date | null;
}

export interface TodayInput {
  /** From attentionItems: payments to sort, add-ons to start, previews overdue and due, new enquiries. */
  readonly attention: readonly AttentionItem[];
  /** Requests nobody on the team has answered yet (status "new"). */
  readonly newTickets: readonly Pick<SupportTicket, "id" | "subject" | "displayRef" | "category" | "createdAt">[];
  /** Sign-ups on the dashboard that have not paid (lead status "account_created"). */
  readonly unpaidSignups: readonly Pick<Lead, "id" | "businessName" | "createdAt">[];
  /** Errors nobody has looked at yet (status "new"). */
  readonly newErrors: readonly Pick<ErrorIssue, "id" | "operation" | "route" | "occurrenceCount" | "firstSeenAt">[];
  /** The end of the team's day: a preview due after it is not today's work. */
  readonly endOfToday: Date;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** How long each kind may wait before it is late. Previews carry their own promised date. */
export const WAIT_LIMITS = {
  newLead: HOUR_MS,
  request: 4 * HOUR_MS,
  payment: DAY_MS,
  addOn: DAY_MS,
  error: DAY_MS,
  signup: 2 * DAY_MS,
} as const;

function after(date: Date | null, ms: number): Date | null {
  return date === null ? null : new Date(date.getTime() + ms);
}

function fromAttention(item: AttentionItem): TodayItem {
  const base = { key: item.key, kind: item.kind, href: item.href };
  const at = item.at;
  switch (item.kind) {
    case "payment":
      return { ...base, title: `Payment needs a look: ${item.name}`, detail: at === null ? "Money to sort" : `Raised ${shortDate(at)}`, dueAt: after(at, WAIT_LIMITS.payment) };
    case "add-on":
      return { ...base, title: `Add-on to start: ${item.name}`, detail: item.reason, dueAt: after(at, WAIT_LIMITS.addOn) };
    case "overdue":
      return { ...base, title: `Preview overdue: ${item.name}`, detail: at === null ? item.reason : `Was due ${shortDate(at)}`, dueAt: at };
    case "due":
      return { ...base, title: `Preview due: ${item.name}`, detail: at === null ? item.reason : `Due ${shortDate(at)}`, dueAt: at };
    case "new-lead":
      return { ...base, title: `New enquiry: ${item.name}`, detail: at === null ? "New" : `Arrived ${shortDate(at)} at ${clock(at)}`, dueAt: after(at, WAIT_LIMITS.newLead) };
    default: {
      const unhandled: never = item.kind;
      throw new Error(`Unhandled attention kind: ${String(unhandled)}`);
    }
  }
}

function byDue(a: TodayItem, b: TodayItem): number {
  if (a.dueAt === null && b.dueAt === null) return 0;
  if (a.dueAt === null) return 1;
  if (b.dueAt === null) return -1;
  return a.dueAt.getTime() - b.dueAt.getTime();
}

/**
 * Everything that needs a person, earliest deadline first, so the latest work leads and what is due soonest follows.
 * The sort is stable, so items with the same deadline keep the order they were given in.
 */
export function todayQueue(input: TodayInput): readonly TodayItem[] {
  const attention = input.attention
    .filter((item) => !(item.kind === "due" && item.at !== null && item.at.getTime() >= input.endOfToday.getTime()))
    .map(fromAttention);
  const requests = input.newTickets.map(
    (ticket): TodayItem => ({
      key: `request:${ticket.id}`,
      kind: "request",
      href: `/support/${ticket.id}`,
      title: `No reply yet: "${ticket.subject}"`,
      detail: `${ticket.displayRef} · ${SUPPORT_CATEGORY_LABELS[ticket.category]}`,
      dueAt: after(ticket.createdAt, WAIT_LIMITS.request),
    }),
  );
  const signups = input.unpaidSignups.map(
    (lead): TodayItem => ({
      key: `signup:${lead.id}`,
      kind: "signup",
      href: `/leads/${lead.id}`,
      title: `Signed up, not paid: ${lead.businessName}`,
      detail: `Signed up ${shortDate(lead.createdAt)}`,
      dueAt: after(lead.createdAt, WAIT_LIMITS.signup),
    }),
  );
  const errors = input.newErrors.map(
    (issue): TodayItem => ({
      key: `error:${issue.id}`,
      kind: "error",
      href: `/support/errors/${issue.id}`,
      title: `New error: ${issue.operation}`,
      detail: `${issue.route} · ${issue.occurrenceCount} ${issue.occurrenceCount === 1 ? "time" : "times"}`,
      dueAt: after(issue.firstSeenAt, WAIT_LIMITS.error),
    }),
  );
  return [...attention, ...requests, ...signups, ...errors].sort(byDue);
}

export type DueTone = "late" | "soon" | "plain";

export interface DueLabel {
  readonly text: string;
  readonly tone: DueTone;
}

/** "2 days late", "3h late", "by 18:00" (later today) or "due 2 Dec". */
export function dueLabel(dueAt: Date | null, now: Date, endOfToday: Date): DueLabel {
  if (dueAt === null) return { text: "", tone: "plain" };
  const lateBy = now.getTime() - dueAt.getTime();
  if (lateBy > 0) {
    const days = Math.floor(lateBy / DAY_MS);
    if (days >= 1) return { text: `${days} ${days === 1 ? "day" : "days"} late`, tone: "late" };
    return { text: `${Math.max(1, Math.floor(lateBy / HOUR_MS))}h late`, tone: "late" };
  }
  if (dueAt.getTime() < endOfToday.getTime()) return { text: `by ${clock(dueAt)}`, tone: "soon" };
  return { text: `due ${shortDate(dueAt)}`, tone: "plain" };
}

/** The button on a queue row. */
export function actionLabel(kind: TodayKind): string {
  if (kind === "payment") return "Check";
  if (kind === "request") return "Reply";
  return "Open";
}

/** The line under the greeting: "Monday 30 November. 9 things need someone today, 2 are late." */
export function todaySummary(now: Date, count: number, late: number, incomplete = false): string {
  const day = longDay(now);
  // A list that failed to load may hide work, so an empty queue is not "all clear".
  if (count === 0) return incomplete ? `${day}.` : `${day}. Nothing needs anyone right now.`;
  const things = count === 1 ? "1 thing needs" : `${count} things need`;
  const lateText = late === 0 ? "" : late === 1 ? ", 1 is late" : `, ${late} are late`;
  return `${day}. ${things} someone today${lateText}.`;
}
