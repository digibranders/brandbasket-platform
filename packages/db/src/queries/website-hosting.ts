import { eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { projects, websiteHosting } from "../schema";
import { isUuid } from "./tenant";

/*
 * Where each client's website is hosted (docs/plans/57-site-lapse-hosting-enforcement.md). Staff connection only: the
 * customer's own database role has no grant on website_hosting.
 */

type Runner = Database | ScopedTransaction;

export interface HostedSite {
  readonly businessId: string;
  readonly vercelProjectId: string;
  readonly vercelTeamId: string | null;
  /** Also pause the Vercel project when the website goes offline (default off, see the schema). */
  readonly hostPause: boolean;
  /** When the sync took the website offline; null while it is online. */
  readonly pausedAt: Date | null;
  readonly lastError: string | null;
  /** The business has a project that reached `live`: a site that was never launched is never paused. */
  readonly hasLiveProject: boolean;
}

const HOSTED_SITE_COLUMNS = {
  businessId: websiteHosting.businessId,
  vercelProjectId: websiteHosting.vercelProjectId,
  vercelTeamId: websiteHosting.vercelTeamId,
  hostPause: websiteHosting.hostPause,
  pausedAt: websiteHosting.pausedAt,
  lastError: websiteHosting.lastError,
  hasLiveProject: sql<boolean>`exists (select 1 from ${projects} where ${projects.businessId} = ${websiteHosting.businessId} and ${projects.status} = 'live')`,
} as const;

/** Every hosted site, oldest first; or just one business's when `businessId` is given (empty when it has none). */
export async function listHostedSites(db: Runner, businessId?: string): Promise<readonly HostedSite[]> {
  if (businessId !== undefined && !isUuid(businessId)) return [];
  const query = db.select(HOSTED_SITE_COLUMNS).from(websiteHosting);
  return businessId === undefined
    ? query.orderBy(websiteHosting.createdAt)
    : query.where(eq(websiteHosting.businessId, businessId));
}

export interface NewWebsiteHosting {
  readonly businessId: string;
  readonly vercelProjectId: string;
  readonly vercelTeamId: string | null;
}

/**
 * Records which Vercel project a business's website runs on. Pointing a business at a different project forgets that the
 * old one was paused (the next sync decides again for the new one); the old project is left as it was.
 */
export async function saveWebsiteHosting(db: Runner, input: NewWebsiteHosting): Promise<void> {
  await db
    .insert(websiteHosting)
    .values(input)
    .onConflictDoUpdate({
      target: websiteHosting.businessId,
      set: {
        vercelProjectId: input.vercelProjectId,
        vercelTeamId: input.vercelTeamId,
        pausedAt: sql`case when ${websiteHosting.vercelProjectId} = excluded.vercel_project_id then ${websiteHosting.pausedAt} else null end`,
        lastError: sql`case when ${websiteHosting.vercelProjectId} = excluded.vercel_project_id then ${websiteHosting.lastError} else null end`,
      },
    });
}

export interface HostingSyncResult {
  readonly checkedAt: Date;
  /** The full new value: the time the website was taken offline, or null while it is online. */
  readonly pausedAt: Date | null;
  readonly lastError: string | null;
}

/** Stamps what the sync found. `lastError` is cut to the column's limit. */
export async function recordHostingSync(db: Runner, businessId: string, result: HostingSyncResult): Promise<void> {
  if (!isUuid(businessId)) return;
  await db
    .update(websiteHosting)
    .set({
      lastCheckedAt: result.checkedAt,
      pausedAt: result.pausedAt,
      lastError: result.lastError === null ? null : result.lastError.slice(0, 500),
    })
    .where(eq(websiteHosting.businessId, businessId));
}
