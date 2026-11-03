import "server-only";
import {
  findClientIntake,
  findLatestProject,
  findPreviewImageInfo,
  findAnalyticsConnection,
  findSetupCallBooking,
  findSiteHealthFacts,
  getPrimaryDomain,
  isPackageOfferForfeited,
  listEnquiries,
  listPreviewVersions,
  listProjectEvents,
  listVisitDays,
  listVisitLists,
  listWebsitePages,
  withTenantScope,
  type Project,
  type SiteHealthFacts,
  type WebsitePage,
} from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { isCustomerVisitsEnabled } from "@brandbasket/shared/lib/launch-flags";
import { isTemporarySubdomain } from "@brandbasket/shared/lib/onboarding/domain-form";
import { cache } from "react";
import { getAppDb, getStaffDb } from "@/lib/db";
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
}

// shortcut: counts from the newest 200 website enquiries (listEnquiries' page limit), so a business above 200 in 30 days reads 200; upgrade when packages/db has a count by period.
const ENQUIRY_SCAN_LIMIT = 200;

export async function loadWebsiteOverview(context: CustomerContext, core: WebsiteCore, now: Date): Promise<WebsiteOverview> {
  const { tenant } = context;
  const { project } = core;
  if (project === null) return { history: null, kickoffFirst: null, preview: null, enquiries: null, health: null, visits: null };
  const db = getAppDb();
  const [history, kickoffFirst, preview, enquiries, health, visits] = await Promise.all([
    load("website.history", () =>
      withTenantScope(db, tenant, async (tx) => ({
        events: (await listProjectEvents(tx, project.id)).map((event) => ({ status: event.status, at: event.occurredAt })),
        callStartsAt: (await findSetupCallBooking(tx, tenant.businessId))?.startsAt ?? null,
      })),
    ),
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
  return { history, kickoffFirst, preview, enquiries, health, visits };
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

/** The stored site health checks, for the Website page's panel and Home's Your services. */
export function loadSiteHealth(tenant: TenantContext, now: Date): Promise<Loaded<SiteHealthFacts>> {
  return load("website.health", () => withTenantScope(getAppDb(), tenant, (tx) => findSiteHealthFacts(tx, uptimeSince(now))));
}

/** The Not bought screen's offer: the Managed Website priced with the package discount the business would get. */
export function loadWebsiteOffer(context: CustomerContext): Promise<Loaded<WebsiteOffer>> {
  return load("website.offer", async () => {
    const forfeited = await withTenantScope(getAppDb(), context.tenant, (tx) => isPackageOfferForfeited(tx, context.businessId));
    return websiteOffer(context.services, forfeited, context.currency);
  });
}
