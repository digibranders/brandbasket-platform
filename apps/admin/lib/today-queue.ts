import type { ErrorIssue, Lead, SupportTicket } from "@brandbasket/db";
import { SUPPORT_CATEGORY_LABELS } from "@brandbasket/shared/lib/support";
import type { AttentionItem } from "./pipeline";
import { breachClock, requestClock } from "./deadline-clock";
import { clock, longDay, shortDate } from "./team-time";

/** Every kind of work Today shows: the pipeline's attention kinds, plus requests, sign-ups, errors, failed deliveries, kickoff calls, approved previews, domain moves, unconfirmed starts and the compliance, report and silent-preview rows. */
export type TodayKind =
  | AttentionItem["kind"]
  | "request"
  | "signup"
  | "error"
  | "delivery"
  | "kickoff"
  | "google"
  | "approved"
  | "domain"
  | "unconfirmed_start"
  | "privacy"
  | "breach"
  | "closure"
  | "report"
  | "preview_silent";

export interface TodayItem {
  /** Unique across the queue. */
  readonly key: string;
  readonly kind: TodayKind;
  readonly href: string;
  readonly title: string;
  readonly detail: string;
  /** When it should be dealt with by; null when nothing sets a clock. */
  readonly dueAt: Date | null;
  /** The button's words when the kind's usual one does not fit (the Google rows each say what the button does). */
  readonly action?: string;
  /** Set on the compliance rows: their clock reads "17d 08h remaining" or "5h 12m left" instead of "2 days late". */
  readonly clock?: "request" | "breach";
}

export interface KickoffNeedingOutcome {
  readonly businessId: string;
  readonly businessName: string;
  readonly endsAt: Date;
}

export interface ApprovedPreviewNeedingLaunch {
  readonly businessId: string;
  readonly businessName: string;
  readonly dueAt: Date | null;
}

export interface DomainMoveNeedingAction {
  readonly id: string;
  readonly businessId: string;
  readonly businessName: string;
  readonly hostname: string;
  readonly status: string;
  readonly createdAt: Date;
}

export interface UnconfirmedStartItem {
  readonly businessId: string;
  readonly businessName: string;
  readonly startedAt: Date;
}

export interface PrivacyRequestDue {
  readonly id: string;
  readonly reference: string;
  /** The kind in the staff's words, such as "Access to my data". */
  readonly kindLabel: string;
  readonly dueAt: Date;
}

export interface BreachReportDue {
  readonly id: string;
  readonly summary: string;
  /** The report owed next: CERT-In first, then the Data Protection Board. */
  readonly duty: "CERT-In" | "Data Protection Board";
  readonly deadline: Date;
}

export interface ClosureErasingSoon {
  readonly businessId: string;
  readonly businessName: string;
  readonly eraseAfter: Date;
}

export interface ReportsToReview {
  /** Reports that are drafts or approved and not yet sent. */
  readonly count: number;
  /** The end of the 5th of the month: the window the plan gives for the review. */
  readonly dueAt: Date;
}

export interface SilentPreview {
  readonly businessId: string;
  readonly businessName: string;
  readonly sentAt: Date;
  /** Whole days since the preview went out. */
  readonly days: number;
}

export interface TodayInput {
  /** From attentionItems: payments to sort, add-ons to start, previews overdue and due, new enquiries. */
  readonly attention: readonly AttentionItem[];
  /** Requests nobody on the team has answered yet (status "new"). */
  readonly newTickets: readonly Pick<SupportTicket, "id" | "subject" | "displayRef" | "category" | "createdAt">[];
  /** Sign-ups on the dashboard that have not paid (lead status "account_created"). */
  readonly unpaidSignups: readonly (Pick<Lead, "id" | "businessName" | "createdAt"> & {
    readonly ownerName?: string | null;
  })[];
  /** Errors nobody has looked at yet (status "new"). */
  readonly newErrors: readonly Pick<ErrorIssue, "id" | "operation" | "route" | "occurrenceCount" | "firstSeenAt">[];
  /** Deliveries that failed in the last 24 hours (the rail's count); null when that count could not be read. */
  readonly failedDeliveries: number | null;
  /** Kickoff calls that are over and not marked held (or as missed); null when they could not be read. One item each. */
  readonly kickoffsNeedingOutcome: readonly KickoffNeedingOutcome[] | null;
  /** Billing status issues: past_due and lapsed subscriptions for money-capable roles. */
  readonly billing?: readonly TodayItem[];
  /** Approved website previews waiting to go live. */
  readonly approvedPreviews?: readonly ApprovedPreviewNeedingLaunch[];
  /** Requests from customers to move to their own domain. */
  readonly domainMoves?: readonly DomainMoveNeedingAction[];
  /** Projects whose website build started automatically after 24 hours without kickoff call confirmation. */
  readonly unconfirmedStarts?: readonly UnconfirmedStartItem[];
  /** Google problems: sites that cannot be verified, silent sources, a lost sign-in (lib/google-today.ts). Already built and shown in their own section. */
  readonly google?: readonly TodayItem[];
  /** Open privacy requests, each with its own due date (compliance read; nothing without the oversight capability). */
  readonly privacyRequests?: readonly PrivacyRequestDue[];
  /** Open breaches with a report still owed. */
  readonly breaches?: readonly BreachReportDue[];
  /** Accounts whose erase date is close. */
  readonly closures?: readonly ClosureErasingSoon[];
  /** The month's reports waiting for a review, or null when none are. */
  readonly reportsToReview?: ReportsToReview | null;
  /** Previews sent and unanswered for 5 days or more. */
  readonly silentPreviews?: readonly SilentPreview[];
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
  domain: DAY_MS,
} as const;

/** CD-8: a sent preview is silent after this many days. */
export const SILENT_PREVIEW_DAYS = 5;
/** An account is "erasing soon" when its erase date is this close. */
export const CLOSURE_SOON_DAYS = 7;
/** The reports are reviewed in the first five days of the month (CD-15). */
export const REPORT_REVIEW_DAYS = 5;

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
      detail: lead.ownerName ? `Signed up ${shortDate(lead.createdAt)} · ${lead.ownerName}` : `Signed up ${shortDate(lead.createdAt)}`,
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
  // A failed delivery has no due time: nothing sets a clock on it, so it sorts after the timed work.
  const deliveries: readonly TodayItem[] =
    input.failedDeliveries !== null && input.failedDeliveries > 0
      ? [
          {
            key: "deliveries:failed",
            kind: "delivery",
            href: "/deliveries",
            title: `${input.failedDeliveries} ${input.failedDeliveries === 1 ? "email or webhook" : "emails and webhooks"} failed`,
            detail: "",
            dueAt: null,
          },
        ]
      : [];
  // Every call here has already ended, so each item is overdue from the start; its clock is the call's end time. Recording an
  // outcome from the kickoff prompt marks the call held or removes its booking, which takes it out of this list.
  const kickoffs = (input.kickoffsNeedingOutcome ?? []).map(
    (call): TodayItem => ({
      key: `kickoff:${call.businessId}`,
      kind: "kickoff",
      href: "/",
      title: "Did the kickoff happen?",
      detail: `${call.businessName} · ended ${shortDate(call.endsAt)}, ${clock(call.endsAt)}`,
      dueAt: call.endsAt,
    }),
  );
  const approved = (input.approvedPreviews ?? []).map(
    (item): TodayItem => ({
      key: `approved:${item.businessId}`,
      kind: "approved",
      href: `/clients/${item.businessId}/website`,
      title: `Website approved: ${item.businessName}`,
      detail: "Ready to launch",
      dueAt: item.dueAt,
      action: "Launch",
    }),
  );
  const domainMoves = (input.domainMoves ?? []).map(
    (item): TodayItem => ({
      key: `domain:${item.id}`,
      kind: "domain",
      href: `/clients/${item.businessId}/website`,
      title: `Domain move: ${item.businessName}`,
      detail: `${item.hostname} · ${item.status}`,
      dueAt: after(item.createdAt, WAIT_LIMITS.domain),
    }),
  );
  // Projects whose build started automatically after 24h without call confirmation.
  const unconfirmed = (input.unconfirmedStarts ?? []).map(
    (item): TodayItem => ({
      key: `unconfirmed_start:${item.businessId}`,
      kind: "unconfirmed_start",
      href: `/clients/${item.businessId}/website`,
      title: "Started without call confirmation",
      detail: item.businessName,
      dueAt: null,
    }),
  );
  const privacy = (input.privacyRequests ?? []).map(
    (request): TodayItem => ({
      key: `privacy:${request.id}`,
      kind: "privacy",
      href: "/privacy-requests",
      title: `Privacy request ${request.reference}`,
      detail: request.kindLabel,
      dueAt: request.dueAt,
      clock: "request",
    }),
  );
  const breaches = (input.breaches ?? []).map(
    (breach): TodayItem => ({
      key: `breach:${breach.id}`,
      kind: "breach",
      href: "/breaches",
      title: `Breach report due: ${breach.duty}`,
      detail: breach.summary.length > 80 ? `${breach.summary.slice(0, 80).trimEnd()}...` : breach.summary,
      dueAt: breach.deadline,
      clock: "breach",
    }),
  );
  const closures = (input.closures ?? []).map(
    (closure): TodayItem => ({
      key: `closure:${closure.businessId}`,
      kind: "closure",
      href: `/clients/${closure.businessId}`,
      title: `Account closing: ${closure.businessName}`,
      detail: `Erased after ${shortDate(closure.eraseAfter)}`,
      dueAt: closure.eraseAfter,
    }),
  );
  const reports: readonly TodayItem[] =
    input.reportsToReview === undefined || input.reportsToReview === null
      ? []
      : [
          {
            key: "reports:review",
            kind: "report",
            href: "/reports",
            title: `${input.reportsToReview.count} ${input.reportsToReview.count === 1 ? "report" : "reports"} to review`,
            detail: `Review by the ${REPORT_REVIEW_DAYS}th`,
            dueAt: input.reportsToReview.dueAt,
          },
        ];
  // The customer's move, so no clock: it waits in its own group until they answer.
  const silent = (input.silentPreviews ?? []).map(
    (preview): TodayItem => ({
      key: `preview_silent:${preview.businessId}`,
      kind: "preview_silent",
      href: `/clients/${preview.businessId}/website`,
      title: `Preview sent, no answer: ${preview.businessName}`,
      detail: `Sent ${shortDate(preview.sentAt)}, ${preview.days} days ago`,
      dueAt: null,
    }),
  );
  return [
    ...attention,
    ...requests,
    ...signups,
    ...errors,
    ...deliveries,
    ...kickoffs,
    ...(input.billing ?? []),
    ...approved,
    ...domainMoves,
    ...unconfirmed,
    ...(input.google ?? []),
    ...privacy,
    ...breaches,
    ...closures,
    ...reports,
    ...silent,
  ].sort(byDue);
}

export const GROUP_HEADINGS = {
  late: "Late",
  dueToday: "Due today",
  waiting: "Waiting on someone",
  upcoming: "Upcoming",
} as const;

export interface TodayGroup {
  readonly heading: (typeof GROUP_HEADINGS)[keyof typeof GROUP_HEADINGS];
  readonly items: readonly TodayItem[];
}

/** Kinds whose next move is the customer's: until their clock runs out they wait rather than count as today's work. */
const WAITING_KINDS: ReadonlySet<TodayKind> = new Set<TodayKind>(["signup", "preview_silent"]);

/**
 * Splits a queue from todayQueue into Late (due before now), Waiting on someone (a customer's move, not yet late), Due today
 * (due from now until the end of the team's day) and Upcoming (everything else, including items with no due time). Each
 * group keeps the queue's order and empty groups are left out.
 */
export function groupTodayQueue(queue: readonly TodayItem[], now: Date, endOfToday: Date): readonly TodayGroup[] {
  const late: TodayItem[] = [];
  const waiting: TodayItem[] = [];
  const dueToday: TodayItem[] = [];
  const upcoming: TodayItem[] = [];
  for (const item of queue) {
    if (item.dueAt !== null && item.dueAt.getTime() < now.getTime()) late.push(item);
    else if (WAITING_KINDS.has(item.kind)) waiting.push(item);
    else if (item.dueAt !== null && item.dueAt.getTime() < endOfToday.getTime()) dueToday.push(item);
    else upcoming.push(item);
  }
  const groups: readonly TodayGroup[] = [
    { heading: GROUP_HEADINGS.late, items: late },
    { heading: GROUP_HEADINGS.dueToday, items: dueToday },
    { heading: GROUP_HEADINGS.waiting, items: waiting },
    { heading: GROUP_HEADINGS.upcoming, items: upcoming },
  ];
  return groups.filter((group) => group.items.length > 0);
}

export type TodayFilter = "all" | "late" | "customers" | "builds" | "money" | "enquiries" | "compliance" | "system";

export const TODAY_FILTERS: readonly { readonly id: TodayFilter; readonly label: string }[] = [
  { id: "all", label: "All" },
  { id: "late", label: "Late" },
  { id: "customers", label: "Customers" },
  { id: "builds", label: "Builds" },
  { id: "money", label: "Money" },
  { id: "enquiries", label: "Enquiries" },
  { id: "compliance", label: "Compliance" },
  { id: "system", label: "System" },
];

const FILTER_OF_KIND: Readonly<Record<TodayKind, Exclude<TodayFilter, "all" | "late">>> = {
  request: "customers",
  report: "customers",
  overdue: "builds",
  due: "builds",
  "add-on": "builds",
  approved: "builds",
  domain: "builds",
  kickoff: "builds",
  unconfirmed_start: "builds",
  preview_silent: "builds",
  payment: "money",
  "new-lead": "enquiries",
  signup: "enquiries",
  privacy: "compliance",
  breach: "compliance",
  closure: "compliance",
  error: "system",
  delivery: "system",
  google: "system",
};

/** Whether an item belongs under a chip. `late` is by clock, every other chip by kind (Google sits under System, kickoff under Builds). */
export function matchesTodayFilter(item: TodayItem, filter: TodayFilter, now: Date): boolean {
  if (filter === "all") return true;
  if (filter === "late") return item.dueAt !== null && item.dueAt.getTime() < now.getTime();
  return FILTER_OF_KIND[item.kind] === filter;
}

export function todayFilterCounts(items: readonly TodayItem[], now: Date): Readonly<Record<TodayFilter, number>> {
  const counts = Object.fromEntries(TODAY_FILTERS.map((filter) => [filter.id, 0])) as Record<TodayFilter, number>;
  for (const filter of TODAY_FILTERS) counts[filter.id] = items.filter((item) => matchesTodayFilter(item, filter.id, now)).length;
  return counts;
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
  if (kind === "approved") return "Launch";
  if (kind === "kickoff") return "Call completed";
  if (kind === "report") return "Review";
  return "Open";
}

/** The clock on a row: the compliance rows read in their own units, everything else as `dueLabel`. */
export function rowClock(item: TodayItem, now: Date, endOfToday: Date): DueLabel {
  if (item.dueAt !== null && item.clock !== undefined) {
    const { text, late } = (item.clock === "request" ? requestClock : breachClock)(item.dueAt, now);
    return { text, tone: late ? "late" : "plain" };
  }
  return dueLabel(item.dueAt, now, endOfToday);
}

/** The sentence in a row's side panel: the one step the button runs. */
export const NEXT_STEPS: Readonly<Record<TodayKind, string>> = {
  payment: "Check the payment against the client's plan.",
  "add-on": "Contact the client to start the add-on.",
  overdue: "The first preview is late. Open the website and send it.",
  due: "The first preview is due. Open the website and send it.",
  "new-lead": "Reply to the enquiry.",
  request: "Read the request and reply.",
  signup: "They signed up and have not paid. Open the enquiry to follow up.",
  error: "Look at the error and set its status.",
  delivery: "Send the failed emails and webhooks again, or open the list to see each one.",
  kickoff: "Say whether the kickoff call happened. This starts the 48 hour first preview clock.",
  google: "Open the client and fix the Google connection.",
  approved: "The customer approved the website. Launch it.",
  domain: "Open the website and move the domain.",
  unconfirmed_start: "The build started without a confirmed call. Check with the client.",
  privacy: "Answer the request before its due date and close it with an outcome.",
  breach: "Make the report and record when it was made.",
  closure: "The account is erased after the date shown. Restore or extend it from the client's page.",
  report: "Review the drafts and send them to the customers.",
  preview_silent: "The customer has not answered the preview. Open the website and follow up.",
};

/** The client a row is about, when it is about one: where the panel's Open client button goes. */
export function clientIdOf(item: TodayItem): string | null {
  if (item.kind === "kickoff") return item.key.slice("kickoff:".length);
  const match = /^\/clients\/([^/?#]+)/.exec(item.href);
  return match?.[1] ?? null;
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

/** The chips a failed source leaves unread, by the label `guarded` records for it. A source with no chip (calls, open requests) is not here. */
const SOURCE_FILTERS: Readonly<Record<string, readonly TodayFilter[]>> = {
  clients: ["builds", "money", "compliance"],
  leads: ["enquiries"],
  "flagged payments": ["money"],
  "add-ons to contact": ["builds"],
  "requests needing a reply": ["customers"],
  reports: ["customers"],
  "new errors": ["system"],
  deliveries: ["system"],
  Google: ["system"],
  "kickoff calls": ["builds"],
  "unconfirmed starts": ["builds"],
  "domain moves": ["builds"],
  "privacy requests": ["compliance"],
  breaches: ["compliance"],
  "closing accounts": ["compliance"],
};

/** Which chips show "?" for their count because a source behind them failed to read. */
export function filtersFailedBy(failed: readonly string[]): readonly TodayFilter[] {
  return [...new Set(failed.flatMap((label) => SOURCE_FILTERS[label] ?? []))];
}
