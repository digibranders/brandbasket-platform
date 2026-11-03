import type { ProjectStatus, RequestNeed, WaitingOnYou } from "@brandbasket/db";
import { dayKey } from "@brandbasket/shared/lib/call-slots";
import { CUSTOMER_STAGE_HEADLINE } from "@brandbasket/shared/lib/project-customer-line";
import { andList, promiseDates } from "@/features/calls/rules";
import { needsYouFrom, waitingOnYouFrom, type NeedsYouRow } from "@/features/requests/rules";
import { APP_TIME_ZONE, formatDate, formatDateTime, formatTime } from "@/lib/format";
import type { Service } from "@/lib/guard-rules";
import { SERVICE_NAMES } from "@/ui/service-tag";

/*
 * What Home says, worked out from facts the backend already holds. A presentation model, not a database state: the
 * project's own statuses are not renamed or added to. Ported from apps/platform lib/home/state.ts, lib/home/due.ts,
 * lib/home/milestones.ts and lib/overview.ts (activityRows, greetingFor), with their tests. Pure, so every branch is tested
 * and the screens only draw what they are told.
 */

/** How long after launch Home greets a new site before it becomes the ongoing page. */
export const LAUNCH_GREETING_DAYS = 7;

export interface HomeFacts {
  readonly now: Date;
  readonly billing: { readonly status: "unpaid" | "paid" | "lapsed"; readonly paymentUnderReview: boolean };
  /** The services the plan pays for now. */
  readonly services: readonly Service[];
  /** The kickoff booking, or null when none was made. Times are null when the booking page did not report them. */
  readonly kickoff: { readonly startsAt: Date | null; readonly endsAt: Date | null; readonly heldAt: Date | null } | null;
  /** When the call staff marked as missed was due to start, or null. Read only while there is no booking. */
  readonly missedKickoffAt: Date | null;
  /** The newest open project, or null when there is none (a plan without the website, or after launch). */
  readonly project: { readonly status: ProjectStatus; readonly slaDueAt: Date | null; readonly onHoldReason: string | null } | null;
  /** The live website, or null before launch. */
  readonly live: { readonly hostname: string; readonly launchedAt: Date | null } | null;
}

export type ClientHomeState =
  | { readonly kind: "payment_required" }
  | { readonly kind: "payment_processing" }
  | { readonly kind: "lapsed" }
  /** `missedAt` is set when staff marked the last call as missed: Home says so above the picker. */
  | { readonly kind: "kickoff_unbooked"; readonly missedAt: Date | null }
  | { readonly kind: "kickoff_booked"; readonly startsAt: Date | null; readonly endsAt: Date | null }
  /** Staff marked the kickoff held and the build is about to start (the project still waits in onboarding). */
  | { readonly kind: "starting" }
  /** The call's time has passed and staff have not said whether it happened: nothing is claimed; the customer can book a new time. */
  | { readonly kind: "kickoff_unconfirmed"; readonly callAt: Date }
  /** Sent to us and not started yet: drawn as building, with its own headline. */
  | { readonly kind: "preparing"; readonly dueAt: Date | null }
  | { readonly kind: "building"; readonly dueAt: Date | null }
  | { readonly kind: "on_hold"; readonly reason: string | null }
  | { readonly kind: "preview_ready" }
  | { readonly kind: "revisions" }
  | { readonly kind: "approved" }
  | { readonly kind: "launched"; readonly hostname: string }
  | { readonly kind: "ongoing" };

export type HomeStateKind = ClientHomeState["kind"];

/** A kickoff is over once staff marked it held, or its end time has passed. Over is not the same as held: see `kickoff_unconfirmed`. */
export function kickoffIsOver(kickoff: HomeFacts["kickoff"], now: Date): boolean {
  if (kickoff === null) return false;
  return kickoff.heldAt !== null || (kickoff.endsAt !== null && kickoff.endsAt.getTime() <= now.getTime());
}

export function deriveClientHomeState(facts: HomeFacts): ClientHomeState {
  const { now, billing, kickoff, project, live } = facts;
  if (billing.status === "unpaid") return billing.paymentUnderReview ? { kind: "payment_processing" } : { kind: "payment_required" };
  if (billing.status === "lapsed") return { kind: "lapsed" };

  if (!kickoffIsOver(kickoff, now)) {
    if (kickoff === null || (kickoff.startsAt === null && kickoff.endsAt === null)) {
      // A booking the booking page gave no time for is still a booking: say so rather than ask again.
      return kickoff === null ? { kind: "kickoff_unbooked", missedAt: facts.services.includes("website") ? facts.missedKickoffAt : null } : { kind: "kickoff_booked", startsAt: null, endsAt: null };
    }
    return { kind: "kickoff_booked", startsAt: kickoff.startsAt, endsAt: kickoff.endsAt };
  }

  if (!facts.services.includes("website")) return { kind: "ongoing" };
  if (live !== null) {
    const launchedMs = live.launchedAt?.getTime() ?? null;
    const fresh = launchedMs !== null && now.getTime() - launchedMs < LAUNCH_GREETING_DAYS * 86_400_000;
    return fresh ? { kind: "launched", hostname: live.hostname } : { kind: "ongoing" };
  }
  // Cal.com cannot tell who joined a video call, so only staff can say it happened. Until they do (or the build starts anyway
  // after the 24 hour fallback in apps/platform's kickoff sync) Home claims nothing.
  const callAt = kickoff?.startsAt ?? kickoff?.endsAt ?? null;
  if (kickoff?.heldAt === null && callAt !== null && project?.status === "onboarding") return { kind: "kickoff_unconfirmed", callAt };
  switch (project?.status) {
    case "onboarding":
      return { kind: "starting" };
    case "submitted":
      return { kind: "preparing", dueAt: project.slaDueAt };
    case "building":
      return { kind: "building", dueAt: project.slaDueAt };
    case "on_hold":
      return { kind: "on_hold", reason: project.onHoldReason };
    case "preview":
      return { kind: "preview_ready" };
    case "revisions":
      return { kind: "revisions" };
    case "approved":
      return { kind: "approved" };
    default:
      return { kind: "ongoing" };
  }
}

/** The four templates Home is drawn in (plan 61, section 4). */
export type HomeLayout = "task" | "progress" | "review" | "overview";

/**
 * Plan 61 section 4's table. It changes the old app's mapping on purpose: `kickoff_unconfirmed` is a Task (Book a new time),
 * `revisions` is a Review (the preview and its rounds stay in front), and the payment states are Tasks rather than the old
 * separate unpaid Home.
 */
export function homeLayoutOf(state: ClientHomeState): HomeLayout {
  switch (state.kind) {
    case "payment_required":
    case "payment_processing":
    case "lapsed":
    case "kickoff_unbooked":
    case "kickoff_booked":
    case "kickoff_unconfirmed":
      return "task";
    case "starting":
    case "preparing":
    case "building":
    case "on_hold":
    case "approved":
    case "launched":
      return "progress";
    case "preview_ready":
    case "revisions":
      return "review";
    case "ongoing":
      return "overview";
  }
}

/** A promised date the customer is shown only while it is still ahead: once it passes, the page names no date. */
export function stillAhead(due: Date | null, now: Date): Date | null {
  return due !== null && due.getTime() > now.getTime() ? due : null;
}

/** The same rule for a promised day (`YYYY-MM-DD`, India): it holds through the whole of that day and is dropped from the next one. */
export function dayStillAhead(day: string | null, now: Date): string | null {
  return day !== null && day >= dayKey(now.toISOString(), APP_TIME_ZONE) ? day : null;
}

/** "Thu 5 Nov" for an India day (`YYYY-MM-DD`). */
function dayText(day: string, now: Date): string {
  return formatDate(new Date(`${day}T12:00:00+05:30`), now);
}

// ---- The website's path ----

export type MilestoneState = "done" | "now" | "todo";

export interface Milestone {
  readonly label: string;
  readonly state: MilestoneState;
  /** A stored fact in words, or null when none is stored. */
  readonly note: string | null;
}

/**
 * The website's path as five steps, for the states where a website is being built. Each word and date comes from a stored
 * fact (the call's end, the project's first-preview date, the planned launch day), never a guess.
 */
export function websiteMilestones(
  state: ClientHomeState,
  input: { readonly kickoffAt: Date | null; readonly firstPreviewDueAt: Date | null; readonly launchPlannedOn?: string | null; readonly now: Date },
): readonly Milestone[] {
  const day = (date: Date | null): string | null => (date === null ? null : formatDate(date, input.now));
  const planned = input.launchPlannedOn === undefined || input.launchPlannedOn === null ? null : dayText(input.launchPlannedOn, input.now);
  // Which step is "now": 0 the kickoff (staff have not said it happened), 1 building, 2 the customer's review, 3 changes, 4 live.
  const at = state.kind === "kickoff_unconfirmed" ? 0 : state.kind === "preview_ready" ? 2 : state.kind === "revisions" ? 3 : state.kind === "approved" ? 4 : state.kind === "launched" ? 5 : 1;
  const step = (index: number): MilestoneState => (index < at ? "done" : index === at ? "now" : "todo");
  return [
    { label: "Kickoff", state: at === 0 ? "now" : "done", note: day(input.kickoffAt) },
    {
      label: "Building",
      state: state.kind === "on_hold" ? "now" : step(1),
      note: state.kind === "on_hold" ? "Paused" : step(1) === "now" ? (input.firstPreviewDueAt === null ? "Now" : `Preview by ${day(input.firstPreviewDueAt) ?? ""}`) : null,
    },
    { label: "Your review", state: step(2), note: step(2) === "now" ? "Now" : null },
    { label: "Changes", state: step(3), note: step(3) === "now" ? "Now" : step(3) === "todo" ? "If you need any" : null },
    { label: "Live", state: step(4), note: step(4) === "done" ? null : planned !== null ? `Planned for ${planned}` : step(4) === "now" ? "Launch next" : null },
  ];
}

// ---- Words ----

/** Good morning, afternoon or evening by the hour in India. */
export function greetingFor(now: Date): string {
  const hour = Number(formatTime(now).slice(0, 2));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** The first word of a person's name, for the greeting; empty when there is none. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

// ---- Needs you ----

/** One line of Needs you: what to do, which service it belongs to, where it opens, and the word on its button. */
export interface NeedsYouItem extends NeedsYouRow {
  readonly action: string;
}

/** The checklist questions Home asks after the kickoff: only those the Social and Search work blocks on (old lib/service-setup.ts). */
export const BLOCKING_CHECKLIST_KEYS: readonly string[] = ["accounts", "budget", "areas"];

export interface NeedsYouInput {
  /** Posts waiting for the customer's OK, and the earliest day among them as words ("Tue 1 Dec"). */
  readonly posts: { readonly count: number; readonly by: string | null };
  readonly needs: readonly RequestNeed[];
  readonly waiting: readonly WaitingOnYou[];
  /** Open checklist items. Only the blocking Social and Search ones are asked here; website items are not. */
  readonly checklist: readonly { readonly key: string; readonly label: string; readonly service: Service; readonly done: boolean; readonly href: string }[];
}

/**
 * Everything waiting on the customer, most pressing first: posts to approve, then quotes to accept or pay and changes to
 * check, then conversations waiting for a reply, then the setup questions the Social and Search work cannot start without.
 */
export function needsYou(input: NeedsYouInput): readonly NeedsYouItem[] {
  const posts: NeedsYouItem[] =
    input.posts.count > 0 && input.posts.by !== null
      ? [{ key: "posts", label: input.posts.count === 1 ? "Approve 1 post" : `Approve ${String(input.posts.count)} posts`, hint: `By ${input.posts.by}`, service: "social", href: "/social/content", action: "Review" }]
      : [];
  const requests = needsYouFrom(input.needs).map((row): NeedsYouItem => ({ ...row, action: row.label.startsWith("Pay for") ? "Pay" : "Review" }));
  const replies = waitingOnYouFrom(input.waiting, input.needs).map((row): NeedsYouItem => ({ ...row, action: "Reply" }));
  const setup = input.checklist
    .filter((item) => !item.done && BLOCKING_CHECKLIST_KEYS.includes(item.key))
    .map((item): NeedsYouItem => ({ key: `setup-${item.key}`, label: item.label, hint: "We need this to start", service: item.service, href: item.href, action: "Add" }));
  return [...posts, ...requests, ...replies, ...setup];
}

// ---- What we did ----

/** One line of What we did. */
export interface ActivityRow {
  readonly key: string;
  readonly at: Date;
  readonly label: string;
  readonly service: Service | null;
}

/** Staff updates plus the two dated facts already stored (preview sent, went live), newest first. */
export function activityRows(input: {
  readonly events: readonly { readonly id: string; readonly occurredAt: Date; readonly title: string; readonly service: Service | null }[];
  readonly previewSentAt: Date | null;
  readonly launchedAt: Date | null;
  readonly hostname: string | null;
  readonly limit: number;
}): ActivityRow[] {
  const rows: ActivityRow[] = input.events.map((event) => ({ key: event.id, at: event.occurredAt, label: event.title, service: event.service }));
  if (input.previewSentAt !== null) rows.push({ key: "preview", at: input.previewSentAt, label: "Your website preview was sent to you", service: "website" });
  if (input.launchedAt !== null) {
    rows.push({ key: "launched", at: input.launchedAt, label: input.hostname === null ? "Your website went live" : `Your website went live on ${input.hostname}`, service: "website" });
  }
  return rows.sort((a, b) => b.at.getTime() - a.at.getTime() || b.key.localeCompare(a.key)).slice(0, input.limit);
}

// ---- Enquiries by day ----

/** How many days the strip and the chart cover, and how many before them they compare with. */
export const ENQUIRY_DAYS = 30;

export interface EnquirySeries {
  /** One label per day, oldest first: "Mon 5 Oct". */
  readonly labels: readonly string[];
  readonly current: readonly number[];
  readonly previous: readonly number[];
  readonly currentTotal: number;
  readonly previousTotal: number;
}

/** The India days of the window, oldest first, ending today. */
function windowDays(now: Date, count: number, offset: number): readonly string[] {
  const noon = new Date(`${dayKey(now.toISOString(), APP_TIME_ZONE)}T12:00:00+05:30`).getTime();
  return Array.from({ length: count }, (_, index) => dayKey(new Date(noon - (count - 1 - index + offset) * 86_400_000).toISOString(), APP_TIME_ZONE));
}

/** The first moment of the comparison window: enquiries received from then on are all the chart needs. */
export function enquiryWindowStart(now: Date): Date {
  const first = windowDays(now, ENQUIRY_DAYS, ENQUIRY_DAYS)[0] ?? dayKey(now.toISOString(), APP_TIME_ZONE);
  return new Date(`${first}T00:00:00+05:30`);
}

/** Enquiries per India day for the last 30 days (today included) and the 30 days before, for the strip and the chart. */
export function enquirySeries(receivedAt: readonly Date[], now: Date): EnquirySeries {
  const counts = new Map<string, number>();
  for (const at of receivedAt) {
    const key = dayKey(at.toISOString(), APP_TIME_ZONE);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const currentDays = windowDays(now, ENQUIRY_DAYS, 0);
  const previousDays = windowDays(now, ENQUIRY_DAYS, ENQUIRY_DAYS);
  const current = currentDays.map((day) => counts.get(day) ?? 0);
  const previous = previousDays.map((day) => counts.get(day) ?? 0);
  const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
  return { labels: currentDays.map((day) => dayText(day, now)), current, previous, currentTotal: sum(current), previousTotal: sum(previous) };
}

// ---- What happens next (kickoff states) ----

export interface NextStepRow {
  readonly title: string;
  /** The promise or the date, already written. */
  readonly meta: string;
  readonly state: MilestoneState;
}

/**
 * The rows of What happens next before and around the kickoff. Dates appear once the call has a time. Ported from
 * apps/platform lib/first-look-steps.ts; the date and the note are one line here (mock: homeWelcome nextSteps).
 */
export function kickoffSteps(input: { readonly hasWebsite: boolean; readonly callStart: Date | null; readonly held: boolean; readonly now: Date }): readonly NextStepRow[] {
  const dates = input.callStart === null ? null : promiseDates(input.callStart.toISOString());
  const call: NextStepRow =
    input.callStart === null
      ? { title: "Kickoff call", meta: "The time you pick", state: "now" }
      : { title: "Kickoff call", meta: formatDateTime(input.callStart, input.now), state: input.held ? "done" : "now" };
  const startBy = dates === null ? "Within 48 hours of the call" : `By ${dayText(dates.startBy, input.now)}`;
  if (!input.hasWebsite) return [call, { title: "We start work", meta: startBy, state: "todo" }];
  return [
    call,
    { title: "We start building", meta: startBy, state: "todo" },
    { title: "You check the preview", meta: "Approve it or ask for changes", state: "todo" },
    { title: "Your website is live", meta: dates === null ? "Within 7 working days of the call" : `By ${dayText(dates.liveBy, input.now)}`, state: "todo" },
  ];
}

// ---- The status line of the website states ----

export type WebsiteState = Extract<ClientHomeState, { kind: "kickoff_unconfirmed" | "starting" | "preparing" | "building" | "on_hold" | "preview_ready" | "revisions" | "approved" | "launched" }>;

export interface StatusCopy {
  readonly title: string;
  readonly text: string;
}

/** What Home says about the website, per state. Ported from apps/platform components/home/progress-home.tsx copyFor. */
export function websiteCopy(state: WebsiteState, now: Date): StatusCopy {
  switch (state.kind) {
    case "kickoff_unconfirmed":
      return { title: "We're confirming your call", text: `Your call was at ${formatDateTime(state.callAt, now)}. If you couldn't join, you can book a new time.` };
    case "starting":
      return { title: "We are getting your website started", text: "Your kickoff is done. The date of your first preview appears here as soon as the build starts." };
    case "preparing":
    case "building":
      return {
        title: CUSTOMER_STAGE_HEADLINE[state.kind === "preparing" ? "submitted" : "building"],
        text: state.dueAt === null ? "We will email you, and show it here, when your first preview is ready." : `Your first preview will be ready by ${formatDateTime(state.dueAt, now)}. We will email you and show it here.`,
      };
    case "on_hold":
      return { title: "Your build is paused", text: state.reason ?? "We will tell you here when it starts again." };
    case "preview_ready":
      return { title: "Your website preview is ready", text: "Look at it on your phone too: that is where most of your customers will see it." };
    case "revisions":
      return { title: "We are making your changes", text: "We will email you, and show it here, when the new preview is ready." };
    case "approved":
      return { title: "Your website is approved", text: "We are getting it ready to go live. We will email you the day it is live." };
    case "launched":
      return { title: "Your website is live", text: `It is at ${state.hostname}. We keep it running, and your plan covers the updates.` };
  }
}

/** The line under Home's greeting: today, and the services that are active. Ported from apps/platform's Home page. */
export function homeLede(services: readonly Service[], now: Date): string {
  const names = services.map((service) => SERVICE_NAMES[service]);
  const active = names.length === 0 ? "" : ` Your ${andList(names)} ${names.length === 1 ? "service is" : "services are"} active.`;
  return `${formatDate(now, now)}.${active}`;
}
