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
import { loadIntake } from "./intake";
import { readLiveWebsite, type LiveWebsite } from "./onboarding";
import { dayStillAhead, stillAhead } from "@/lib/home/due";
import type { SentChanges, SentVersion } from "@/lib/website/history";
import { loadPreviewVersions, loadSentChanges } from "./preview-versions";
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
  /** Every preview sent, newest first. Empty when none was sent or it could not be read. */
  readonly versions: readonly SentVersion[];
  /** The rounds of changes the customer sent, newest first. Empty when none or it could not be read. */
  readonly changes: readonly SentChanges[];
  /** The day the updated preview is due while changes are made (`YYYY-MM-DD`), only while it is still ahead. */
  readonly previewDue: string | null;
  /** The day staff plan to go live (`YYYY-MM-DD`), only while it is still ahead. */
  readonly plannedLaunch: string | null;
  /** The preview picture's address, only when it was taken of the project's current preview link. */
  readonly pictureUrl: string | null;
}

const day = (date: Date): string => dayKey(date.toISOString(), BRAND_TIME_ZONE);

/**
 * Everything the Website page draws, for the signed-in business only. The project, the domain and the live site must be
 * readable (the page cannot say anything true without them); the history, the kickoff call and the picture
 * are read apart and quietly, so a failure there leaves that part out and the page still works.
 */
export async function loadWebsite(tenant: TenantContext, now: Date): Promise<WebsiteData> {
  const db = getAppDb();
  const { project, domain, live } = await withTenantScope(db, tenant, async (tx) => {
    const latest = await findLatestProject(tx);
    return { project: latest, domain: await getPrimaryDomain(tx), live: await readLiveWebsite(tx) };
  });

  const [history, picture, versions, changes] =
    project === null
      ? [null, null, [], []]
      : await Promise.all([
          quietly("website", "the project's history", null, () =>
            withTenantScope(db, tenant, async (tx) => ({
              events: (await listProjectEvents(tx, project.id)).map((event): TimelineEvent => ({ status: event.status, at: event.occurredAt })),
              callStartsAt: (await findSetupCallBooking(tx, tenant.businessId))?.startsAt ?? null,
            })),
          ),
          quietly("website", "the preview picture", null, () => withTenantScope(db, tenant, (tx) => findPreviewImageInfo(tx))),
          quietly("website", "the preview versions", [], () => loadPreviewVersions(tenant, project.id)),
          quietly("website", "the changes sent", [], () => loadSentChanges(tenant, project.id)),
        ]);

  // A customer who answered the first questions is on the kickoff-first path: the setup checklist is not theirs to finish.
  const kickoffFirst = await quietly("website", "the first questions", false, async () => (await loadIntake(tenant)).completedAt !== null);

  const events = history?.events ?? [];
  const timeline =
    project === null
      ? null
      : {
          project: {
            status: project.status,
            onboardingSubmittedAt: project.onboardingSubmittedAt,
            slaDueAt: stillAhead(project.slaDueAt, now),
            previewSentAt: project.previewSentAt,
            launchedAt: project.launchedAt,
            launchPlannedOn: project.launchPlannedOn,
          },
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
        ? dayStillAhead(revisionDue(day(asked.at)), now)
        : (project.status === "submitted" || project.status === "building") && firstPreviewDue !== null
          ? day(firstPreviewDue)
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
      liveBy: timeline === null ? null : dayStillAhead(liveDate(timeline)?.liveBy ?? null, now),
      kickoffFirst,
      kickoffDay: history?.callStartsAt == null ? null : day(history.callStartsAt),
    }),
    versions,
    changes,
    previewDue,
    plannedLaunch: dayStillAhead(project?.launchPlannedOn ?? null, now),
    pictureUrl: project !== null && picture !== null && picture.previewUrl === project.previewUrl ? `${WEBSITE_PREVIEW_IMAGE_PATH}?v=${picture.capturedAt.getTime()}` : null,
  };
}
