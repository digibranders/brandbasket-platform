import "server-only";
import {
  findLatestProject,
  findPreviewImageInfo,
  findSetupCallBooking,
  getPrimaryDomain,
  listProjectEvents,
  withTenantScope,
  type PrimaryDomain,
  type Project,
} from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { dayKey } from "@brandbasket/shared/lib/call-slots";
import { BRAND_TIME_ZONE } from "@/lib/call-dates";
import { liveDate, websiteTimeline, type TimelineEvent, type TimelineStep } from "@/lib/website/timeline";
import { progressView, revisionDue, type ProgressView } from "@/lib/website/progress-view";
import { WEBSITE_PREVIEW_IMAGE_PATH } from "@/lib/website/tabs";
import { getAppDb } from "./db";
import { readLiveWebsite, type LiveWebsite } from "./onboarding";
import { quietly } from "./quietly";

export interface WebsiteData {
  readonly project: Project | null;
  readonly domain: PrimaryDomain | null;
  readonly live: LiveWebsite | null;
  /** The project's history, oldest first. Empty when it could not be read. */
  readonly events: readonly TimelineEvent[];
  /** The four rows under "What happens next". Empty when there is no project or the history could not be read. */
  readonly steps: readonly TimelineStep[];
  readonly view: ProgressView;
  /** The preview picture's address, only when it was taken of the project's current preview link. */
  readonly pictureUrl: string | null;
}

const day = (date: Date): string => dayKey(date.toISOString(), BRAND_TIME_ZONE);

/**
 * Everything the Website page draws, for the signed-in business only. The project, the domain and the live site must be
 * readable (the page cannot say anything true without them); the history, the kickoff call and the picture are read apart
 * and quietly, so a failure there leaves the timeline or the picture out and the page still works.
 */
export async function loadWebsite(tenant: TenantContext, now: Date): Promise<WebsiteData> {
  const db = getAppDb();
  const { project, domain, live } = await withTenantScope(db, tenant, async (tx) => {
    const latest = await findLatestProject(tx);
    return { project: latest, domain: await getPrimaryDomain(tx), live: await readLiveWebsite(tx) };
  });

  const [history, picture] =
    project === null
      ? [null, null]
      : await Promise.all([
          quietly("website", "the project's history", null, () =>
            withTenantScope(db, tenant, async (tx) => ({
              events: (await listProjectEvents(tx, project.id)).map((event): TimelineEvent => ({ status: event.status, at: event.occurredAt })),
              callStartsAt: (await findSetupCallBooking(tx, tenant.businessId))?.startsAt ?? null,
            })),
          ),
          quietly("website", "the preview picture", null, () => withTenantScope(db, tenant, (tx) => findPreviewImageInfo(tx))),
        ]);

  const events = history?.events ?? [];
  const timeline =
    project === null
      ? null
      : {
          project: {
            status: project.status,
            onboardingSubmittedAt: project.onboardingSubmittedAt,
            slaDueAt: project.slaDueAt,
            previewSentAt: project.previewSentAt,
            launchedAt: project.launchedAt,
          },
          events,
          callStartsAt: history?.callStartsAt ?? null,
          now,
        };

  const asked = events.findLast((event) => event.status === "revisions");
  const previewDue =
    project === null
      ? null
      : project.status === "revisions" && asked !== undefined
        ? revisionDue(day(asked.at))
        : (project.status === "submitted" || project.status === "building") && project.slaDueAt !== null
          ? day(project.slaDueAt)
          : null;

  return {
    project,
    domain,
    live,
    events,
    steps: timeline === null || history === null ? [] : websiteTimeline(timeline),
    view: progressView({
      status: project?.status ?? null,
      holdReason: project?.onHoldReason ?? null,
      roundsIncluded: project?.revisionRoundsIncluded ?? 0,
      roundsGranted: project?.revisionRoundsGranted ?? 0,
      previewDue,
      liveBy: timeline === null ? null : (liveDate(timeline)?.liveBy ?? null),
    }),
    pictureUrl: project !== null && picture !== null && picture.previewUrl === project.previewUrl ? `${WEBSITE_PREVIEW_IMAGE_PATH}?v=${picture.capturedAt.getTime()}` : null,
  };
}
