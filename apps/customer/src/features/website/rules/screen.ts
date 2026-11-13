import type { Project } from "@brandbasket/db";
import { dayOf, dayStillAhead, stillAhead } from "./dates";
import { progressView, revisionDue, type ProgressView } from "./progress";
import { liveDate, websiteTimeline, type TimelineEvent, type WebsiteStep } from "./timeline";

/*
 * What the Website page derives from the project, ported from apps/platform lib/server/website.ts (loadWebsite). Pure, so the
 * "due only while ahead" rules are tested here; the loader only reads.
 */

export type ProjectFacts = Pick<
  Project,
  "status" | "onHoldReason" | "onboardingSubmittedAt" | "slaDueAt" | "previewSentAt" | "launchedAt" | "launchPlannedOn"
>;

export interface ProjectHistory {
  /** project_events, oldest first. */
  readonly events: readonly TimelineEvent[];
  readonly callStartsAt: Date | null;
}

export interface WebsiteProgress {
  readonly view: ProgressView;
  /** The four rows of "What happens next"; null without a project, or when its history could not be read. */
  readonly steps: readonly WebsiteStep[] | null;
}

/**
 * The page's state from `projects.status`, with the dates the customer is promised. A date shows only while it is still ahead:
 * the first preview from `slaDueAt` while submitted or building, the updated preview two working days after the last ask while
 * in revisions, the live date from liveDate. Without the history, the lines simply name no date.
 */
export function websiteProgress(input: {
  readonly project: ProjectFacts | null;
  readonly history: ProjectHistory | null;
  readonly kickoffFirst: boolean;
  readonly now: Date;
}): WebsiteProgress {
  const { project, history, kickoffFirst, now } = input;
  const events = history?.events ?? [];
  const timeline =
    project === null
      ? null
      : {
          project: { ...project, slaDueAt: stillAhead(project.slaDueAt, now) },
          events,
          callStartsAt: history?.callStartsAt ?? null,
          now,
        };
  const asked = events.findLast((event) => event.status === "revisions");
  const firstPreviewDue = project === null ? null : stillAhead(project.slaDueAt, now);
  const previewDue =
    project === null
      ? null
      : project.status === "revisions" && asked !== undefined
        ? dayStillAhead(revisionDue(dayOf(asked.at)), now)
        : (project.status === "submitted" || project.status === "building") && firstPreviewDue !== null
          ? dayOf(firstPreviewDue)
          : null;
  const callStartsAt = history?.callStartsAt ?? null;
  return {
    view: progressView({
      status: project?.status ?? null,
      holdReason: project?.onHoldReason ?? null,
      previewDue,
      liveBy: timeline === null ? null : dayStillAhead(liveDate(timeline)?.liveBy ?? null, now),
      kickoffFirst,
      kickoffDay: callStartsAt === null ? null : dayOf(callStartsAt),
    }),
    steps: timeline === null || history === null ? null : websiteTimeline(timeline),
  };
}
