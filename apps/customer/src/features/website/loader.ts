import "server-only";
import {
  findClientIntake,
  findLatestProject,
  findPreviewImageInfo,
  findAnalyticsConnection,
  findSearchConnection,
  findSetupCallBooking,
  findSiteHealthFacts,
  getPrimaryDomain,
  findLiveBundledAddOns,
  isPackageOfferForfeited,
  listEnquiries,
  listPreviewVersions,
  listProjectEvents,
  listSearchDays,
  listVisitDays,
  listVisitLists,
  listWebsitePages,
  withTenantScope,
  type Project,
  type SiteHealthFacts,
  type WebsitePage,
} from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { isMonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { isCustomerVisitsEnabled } from "@brandbasket/shared/lib/launch-flags";
import { isTemporarySubdomain } from "@brandbasket/shared/lib/onboarding/domain-form";
import { addDays } from "@brandbasket/shared/lib/calendar/local-date";
import { dayKey } from "@brandbasket/shared/lib/call-slots";
import { kickoffMeetingLink } from "@brandbasket/shared/lib/setup-call-link";
import { readBookingUrl } from "@/features/calls/server/calls";
import { cache } from "react";
import { SEARCH_LOOKBACK_DAYS, searchSummary } from "@/features/search/rules/search-presence";
import { getAppDb, getStaffDb } from "@/lib/db";
import { APP_TIME_ZONE } from "@/lib/format";
import type { CustomerContext } from "@/lib/guards";
import { load, type Loaded } from "@/lib/loaded";
import { uptimeSince } from "./rules/health";
import { websiteOffer, type WebsiteOffer } from "./rules/not-bought";
import { enquiriesSince, SITE_ENQUIRY_KINDS, type StoredDomain } from "./rules/overview";
import { WEBSITE_PREVIEW_IMAGE_PATH } from "./rules/paths";
import type { ProjectHistory } from "./rules/screen";
import { listMonths, pickVisits, visitLists, visitsSummary, visitWindow, type VisitLists, type VisitsSummary } from "./rules/visits";

export interface LiveSite {
  /** Where the site answers: their own domain, or the free address they started on. */
  readonly hostname: string;
  readonly launchedAt: Date | null;
}

/** What every Website page needs first. Without it nothing true can be said, so its failure is the page's error state. */
export interface WebsiteCore {
  readonly project: Project | null;
  readonly domain: StoredDomain | null;
  /** Live = the latest project is live and a primary domain exists (ported from readLiveWebsite). */
  readonly live: LiveSite | null;
}

/** The project, the main domain and the live site, read once per request under the business's own scope. */
export const loadWebsiteCore = cache(
  (tenant: TenantContext): Promise<Loaded<WebsiteCore>> =>
    load("website.core", () =>
      withTenantScope(getAppDb(), tenant, async (tx) => {
        const project = await findLatestProject(tx);
        const primary = await getPrimaryDomain(tx);
        const domain = primary === null ? null : { hostname: primary.hostname, status: primary.status, isFreeAddress: isTemporarySubdomain(primary.hostname) };
        const live = project !== null && project.status === "live" && domain !== null ? { hostname: domain.hostname, launchedAt: project.launchedAt } : null;
        return { project, domain, live };
      }),
    ),
);

/** The pages the sitemap sync found, for the Pages tab and list. Read once per request. */
export const loadWebsitePages = cache(
  (tenant: TenantContext): Promise<Loaded<readonly WebsitePage[]>> => load("website.pages", () => withTenantScope(getAppDb(), tenant, listWebsitePages)),
);

export interface PreviewVersion {
  readonly version: number;
  readonly sentAt: Date;
}

/** Each panel of the Overview, loaded on its own. Null where the project's state does not show that panel. */
export interface WebsiteOverview {
  readonly history: Loaded<ProjectHistory> | null;
  /** Only while onboarding, where it picks between the setup and the kickoff screens. */
  readonly kickoffFirst: Loaded<boolean> | null;
  readonly preview: Loaded<{ readonly versions: readonly PreviewVersion[]; readonly pictureUrl: string | null }> | null;
  /** Website enquiries in the last 30 days, once live. */
  readonly enquiries: Loaded<number> | null;
  /** The site health checks, once live. */
  readonly health: Loaded<SiteHealthFacts> | null;
  /** Visits, once live and while CUSTOMER_VISITS_ENABLED is on. Its data is null until a day has been counted. */
  readonly visits: Loaded<VisitsData | null> | null;
  /** True while a connected Google site (Analytics or Search Console) has no measured day yet. Read only when visits has no data. */
  readonly visitsWaiting: Loaded<boolean> | null;
}

// shortcut: counts from the newest 200 website enquiries (listEnquiries' page limit), so a business above 200 in 30 days reads 200; upgrade when packages/db has a count by period.
const ENQUIRY_SCAN_LIMIT = 200;

export async function loadWebsiteOverview(context: CustomerContext, core: WebsiteCore, now: Date): Promise<WebsiteOverview> {
  const { tenant } = context;
  const { project } = core;
  if (project === null) return { history: null, kickoffFirst: null, preview: null, enquiries: null, health: null, visits: null, visitsWaiting: null };
  const db = getAppDb();
  const [history, kickoffFirst, preview, enquiries, health, visits] = await Promise.all([
    load("website.history", async () => {
      const [booking, events] = await Promise.all([
        withTenantScope(db, tenant, (tx) => findSetupCallBooking(tx, tenant.businessId)),
        withTenantScope(db, tenant, (tx) => listProjectEvents(tx, project.id)),
      ]);
      const bookingUrl = await readBookingUrl().catch(() => null);
      return {
        events: events.map((event) => ({ status: event.status, at: event.occurredAt })),
        callStartsAt: booking?.startsAt ?? null,
        callEndsAt: booking?.endsAt ?? null,
        meetingUrl: kickoffMeetingLink(booking?.inviteeUri, bookingUrl),
      };
    }),
    project.status === "onboarding"
      ? load("website.intake", () => withTenantScope(db, tenant, async (tx) => (await findClientIntake(tx, tenant.businessId))?.completedAt != null))
      : null,
    project.status === "preview"
      ? load("website.preview", async () => {
          // Staff connection: customers have no grant on project_preview_versions. The business comes from the session and the
          // project is the one read under the customer's own scope above; the query matches both.
          const [rows, picture] = await Promise.all([
            listPreviewVersions(getStaffDb(), { projectId: project.id, businessId: tenant.businessId }),
            withTenantScope(db, tenant, findPreviewImageInfo),
          ]);
          return {
            versions: rows.map((row) => ({ version: row.version, sentAt: row.sentAt })),
            // The picture is shown only when it was taken of the project's current preview link.
            pictureUrl: picture !== null && picture.previewUrl === project.previewUrl ? `${WEBSITE_PREVIEW_IMAGE_PATH}?v=${picture.capturedAt.getTime()}` : null,
          };
        })
      : null,
    core.live === null
      ? null
      : load("website.enquiries", async () =>
          enquiriesSince(await withTenantScope(db, tenant, (tx) => listEnquiries(tx, { kind: SITE_ENQUIRY_KINDS, limit: ENQUIRY_SCAN_LIMIT })), now),
        ),
    core.live === null ? null : loadSiteHealth(tenant, now),
    core.live === null ? null : loadVisits(tenant, now),
  ]);
  const visitsWaiting = visits !== null && visits.ok && visits.data === null ? await loadVisitsWaiting(tenant, now) : null;
  return { history, kickoffFirst, preview, enquiries, health, visits, visitsWaiting };
}

/** What the Website screen draws for visits: the 30 days' total, and the month's pages and channels when they were pulled. */
export interface VisitsData {
  readonly summary: VisitsSummary;
  readonly lists: VisitLists | null;
}

/**
 * Website visits (gate G1). Null while CUSTOMER_VISITS_ENABLED is off, so nothing is read and nothing is drawn. The customer's
 * Google Analytics numbers win when they are connected and have counted a day; otherwise our own script's. Data is null when
 * neither has: the panel is not drawn, and no number is made up.
 */
export function loadVisits(tenant: TenantContext, now: Date): Promise<Loaded<VisitsData | null>> | null {
  if (!isCustomerVisitsEnabled()) return null;
  return load("website.visits", () =>
    withTenantScope(getAppDb(), tenant, async (tx) => {
      const window = visitWindow(now);
      const connection = await findAnalyticsConnection(tx);
      const analytics =
        connection?.status === "connected" ? visitsSummary("ga4", await listVisitDays(tx, "ga4", window.previousFrom, window.to), window, now) : null;
      const own = analytics === null ? visitsSummary("own", await listVisitDays(tx, "own", window.previousFrom, window.to), window, now) : null;
      const summary = pickVisits(analytics, own);
      if (summary === null) return null;
      const months = listMonths(now);
      const lists =
        visitLists(months.current, await listVisitLists(tx, summary.source, months.current)) ??
        visitLists(months.previous, await listVisitLists(tx, summary.source, months.previous));
      return { summary, lists };
    }),
  );
}

/**
 * Whether a connected Google site is still waiting for its first measured day, so the strip can say numbers are coming instead of
 * going quiet. Asked only once visits found no day in its window. A failed read is reported and the strip stays as it was.
 */
export function loadVisitsWaiting(tenant: TenantContext, now: Date): Promise<Loaded<boolean>> {
  return load("website.visits-waiting", () =>
    withTenantScope(getAppDb(), tenant, async (tx) => {
      if ((await findAnalyticsConnection(tx))?.status === "connected") return true;
      if ((await findSearchConnection(tx))?.status !== "connected") return false;
      const today = dayKey(now.toISOString(), APP_TIME_ZONE);
      return searchSummary(await listSearchDays(tx, addDays(today, -SEARCH_LOOKBACK_DAYS), today)) === null;
    }),
  );
}

/** The stored site health checks, for the Website page's panel and Home's Your services. */
export function loadSiteHealth(tenant: TenantContext, now: Date): Promise<Loaded<SiteHealthFacts>> {
  return load("website.health", () => withTenantScope(getAppDb(), tenant, (tx) => findSiteHealthFacts(tx, uptimeSince(now))));
}

/** The Not bought screen's offer: the website priced with the package discount the services the business holds would give. */
export function loadWebsiteOffer(context: CustomerContext): Promise<Loaded<WebsiteOffer>> {
  return load("website.offer", async () => {
    const { bundled, forfeited } = await withTenantScope(getAppDb(), context.tenant, async (tx) => ({
      bundled: await findLiveBundledAddOns(tx, context.businessId),
      forfeited: await isPackageOfferForfeited(tx, context.businessId),
    }));
    const held = bundled.flatMap((row) => (row.status === "active" && row.endRequestedAt === null && isMonthlyAddOnId(row.addOn) ? [row.addOn] : []));
    return websiteOffer(held, forfeited, context.currency);
  });
}
