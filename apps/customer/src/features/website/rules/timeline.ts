import type { ProjectStatus } from "@brandbasket/db";
import { addWorkingDays, REVISION_READY_WORKING_DAYS } from "@brandbasket/shared/lib/working-days";
import { dayLabel, dayOf } from "./dates";

/*
 * Ported from apps/platform lib/website/timeline.ts: the four rows under "What happens next" and the live date. One change:
 * a build range reads "Wed 28 Oct to Mon 2 Nov" (the app's one date format) where the old page wrote "28 Oct to 2 Nov".
 */

/** The days the customer is given (decision 4): changing one number here changes every date the Website page shows. */
const APPROVE_WITHIN_WORKING_DAYS = 2;
const LIVE_AFTER_APPROVAL_WORKING_DAYS = 1;
const LIVE_WITHIN_WORKING_DAYS_OF_CALL = 7;

export interface TimelineProject {
  readonly status: ProjectStatus;
  readonly onboardingSubmittedAt: Date | null;
  readonly slaDueAt: Date | null;
  readonly previewSentAt: Date | null;
  readonly launchedAt: Date | null;
  /** The day staff plan to go live (`YYYY-MM-DD`), or null while none is set. */
  readonly launchPlannedOn?: string | null;
}

/** One row of project_events, oldest first. */
export interface TimelineEvent {
  readonly status: ProjectStatus;
  readonly at: Date;
}

export interface TimelineInput {
  readonly project: TimelineProject;
  readonly events: readonly TimelineEvent[];
  /** The kickoff call's start, or null when none is booked. */
  readonly callStartsAt: Date | null;
  readonly now: Date;
}

export type StepKey = "call" | "build" | "check" | "live";
export type StepState = "done" | "now" | "next";

export interface WebsiteStep {
  readonly key: StepKey;
  readonly title: string;
  /** A short second line, or null. */
  readonly note: string | null;
  /** The date on the right: "Tue 27 Oct", "Wed 28 Oct to Mon 2 Nov", "By Thu 5 Nov", "Today", or "" when none is known. */
  readonly when: string;
  readonly state: StepState;
}

const by = (day: string): string => `By ${dayLabel(day)}`;

/** The newest event with this status, or null. */
function last(events: readonly TimelineEvent[], status: ProjectStatus): Date | null {
  return events.findLast((event) => event.status === status)?.at ?? null;
}

/** Which of the four steps is in progress: 0 call, 1 build, 2 check, 3 live, 4 all done. */
export function currentStep(input: TimelineInput): 0 | 1 | 2 | 3 | 4 {
  const { project, callStartsAt, now } = input;
  switch (project.status) {
    case "onboarding":
      return callStartsAt !== null && callStartsAt.getTime() <= now.getTime() ? 1 : 0;
    case "submitted":
    case "building":
    case "revisions":
      return 1;
    case "preview":
      return 2;
    case "approved":
      return 3;
    case "live":
      return 4;
    case "on_hold":
    case "cancelled":
      return project.previewSentAt === null ? 1 : 2;
  }
}

/** When the site can go live, and what the customer must do for that date to hold. Null when there is no basis for a date. */
export function liveDate(input: TimelineInput): { readonly liveBy: string; readonly approveBy: string | null } | null {
  const { project, events, callStartsAt } = input;
  // A paused build has no promise: the dates come back when it is resumed.
  if (project.status === "on_hold") return null;
  // A day staff have set is what the customer is told, in place of the working-day estimate below.
  if (project.launchPlannedOn !== undefined && project.launchPlannedOn !== null && project.status !== "live") return { liveBy: project.launchPlannedOn, approveBy: null };
  if (project.status === "approved") {
    const approvedAt = last(events, "approved");
    return approvedAt === null ? null : { liveBy: addWorkingDays(dayOf(approvedAt), LIVE_AFTER_APPROVAL_WORKING_DAYS), approveBy: null };
  }
  const asked = project.status === "revisions" ? last(events, "revisions") : null;
  const sent = project.status === "preview" ? project.previewSentAt : null;
  const from = asked !== null ? addWorkingDays(dayOf(asked), REVISION_READY_WORKING_DAYS) : sent !== null ? dayOf(sent) : null;
  if (from !== null) {
    const approveBy = addWorkingDays(from, APPROVE_WITHIN_WORKING_DAYS);
    return { liveBy: addWorkingDays(approveBy, LIVE_AFTER_APPROVAL_WORKING_DAYS), approveBy };
  }
  if (callStartsAt !== null) return { liveBy: addWorkingDays(dayOf(callStartsAt), LIVE_WITHIN_WORKING_DAYS_OF_CALL), approveBy: null };
  if (project.onboardingSubmittedAt !== null) {
    return { liveBy: addWorkingDays(dayOf(project.onboardingSubmittedAt), LIVE_WITHIN_WORKING_DAYS_OF_CALL), approveBy: null };
  }
  return null;
}

/** The four rows under "What happens next". */
export function websiteTimeline(input: TimelineInput): readonly WebsiteStep[] {
  const { project, events, callStartsAt } = input;
  const at = currentStep(input);
  const stateOf = (index: number): StepState => (index < at ? "done" : index === at ? "now" : "next");
  const live = liveDate(input);
  const revising = project.status === "revisions";

  const askedAt = last(events, "revisions");
  const readyBy = revising
    ? askedAt === null
      ? null
      : addWorkingDays(dayOf(askedAt), REVISION_READY_WORKING_DAYS)
    : project.slaDueAt !== null
      ? dayOf(project.slaDueAt)
      : null;
  const buildStarted = last(events, "building") ?? last(events, "submitted") ?? project.onboardingSubmittedAt;
  const buildDoneWhen =
    project.previewSentAt === null
      ? ""
      : buildStarted === null || dayOf(buildStarted) === dayOf(project.previewSentAt)
        ? dayLabel(dayOf(project.previewSentAt))
        : `${dayLabel(dayOf(buildStarted))} to ${dayLabel(dayOf(project.previewSentAt))}`;

  const approvedAt = last(events, "approved");
  const checkWhen = stateOf(2) === "now" && project.status !== "on_hold" ? "Today" : stateOf(2) === "done" && approvedAt !== null ? dayLabel(dayOf(approvedAt)) : "";
  const liveWhen =
    project.status === "live" ? (project.launchedAt === null ? "" : dayLabel(dayOf(project.launchedAt))) : live === null ? "" : by(live.liveBy);

  return [
    { key: "call", title: "Kickoff call", note: null, when: callStartsAt === null ? "" : dayLabel(dayOf(callStartsAt)), state: stateOf(0) },
    {
      key: "build",
      title: stateOf(1) === "done" ? "We built it" : revising ? "We are making your changes" : "We build your website",
      note: stateOf(1) === "now" && (project.status === "onboarding" || project.status === "submitted") ? "We start within 48 hours of the call" : null,
      when: stateOf(1) === "done" ? buildDoneWhen : stateOf(1) === "now" && readyBy !== null && project.status !== "on_hold" ? by(readyBy) : "",
      state: stateOf(1),
    },
    {
      key: "check",
      title: "You check the preview",
      note: stateOf(2) === "now" && project.status === "preview" ? "Approve it or ask for changes" : null,
      when: checkWhen,
      state: stateOf(2),
    },
    {
      key: "live",
      title: "Your website is live",
      note: live !== null && live.approveBy !== null && project.status !== "live" ? `If you approve by ${dayLabel(live.approveBy)}` : null,
      when: liveWhen,
      state: stateOf(3),
    },
  ];
}
