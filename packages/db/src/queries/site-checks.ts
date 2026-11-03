import { and, count, desc, eq, gte, inArray, isNotNull, like, min, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { siteChecks, type NewSiteCheck, type SiteCheckStatus } from "../schema/site-checks";
import type { ScopedTransaction } from "../scope";
import { currentBusinessId, isUuid } from "./tenant";

/**
 * The words the site health job starts a failed PageSpeed call's `error` with. The job reads them back to keep the PageSpeed
 * call to once a day per site even when it fails.
 */
export const PHONE_SPEED_FAILED = "Phone speed check failed";

/** A website the site health job checks: the business, its name for the staff alert, and where the site answers. */
export interface SiteHealthWebsite {
  readonly businessId: string;
  readonly businessName: string;
  readonly hostname: string;
}

/**
 * Staff side: every live website, as the customer app defines live (loadWebsiteCore): the business's latest project is
 * `live` and it has a primary domain, its own or the free address. A site the hosting sync took offline for a lapsed plan
 * (website_hosting.paused_at) is left out: it is down on purpose.
 */
export async function listLiveWebsites(db: Database): Promise<SiteHealthWebsite[]> {
  const result = await db.execute<{ business_id: string; business_name: string; hostname: string }>(sql`
    select b.id::text as business_id, b.name as business_name, d.hostname
    from businesses b
    join lateral (
      select p.status from projects p where p.business_id = b.id order by p.created_at desc, p.id desc limit 1
    ) latest on latest.status = 'live'
    join domains d on d.business_id = b.id and d.is_primary and d.removed_at is null
    where not exists (select 1 from website_hosting h where h.business_id = b.id and h.paused_at is not null)
    order by b.id
  `);
  return result.rows.map((row) => ({ businessId: row.business_id, businessName: row.business_name, hostname: row.hostname }));
}

/** What the job needs to know before it checks a site again. */
export interface SiteCheckState {
  /** The latest up and down results, newest first (at most `depth`); error rows are not results about the site. */
  readonly recent: readonly { readonly status: "up" | "down"; readonly checkedAt: Date }[];
  /** When PageSpeed was last tried, measured or failed, or null. */
  readonly lastSpeedAttemptAt: Date | null;
}

/** Staff side: the business's latest results and its last PageSpeed attempt. */
export async function findSiteCheckState(db: Database, businessId: string, depth = 3): Promise<SiteCheckState> {
  if (!isUuid(businessId)) throw new Error(`businessId must be a UUID, received "${businessId}"`);
  const recent = await db
    .select({ status: siteChecks.status, checkedAt: siteChecks.checkedAt })
    .from(siteChecks)
    .where(and(eq(siteChecks.businessId, businessId), inArray(siteChecks.status, ["up", "down"])))
    .orderBy(desc(siteChecks.checkedAt))
    .limit(depth);
  const [speed] = await db
    .select({ checkedAt: siteChecks.checkedAt })
    .from(siteChecks)
    .where(and(eq(siteChecks.businessId, businessId), or(isNotNull(siteChecks.phoneSpeedScore), like(siteChecks.error, `%${PHONE_SPEED_FAILED}%`))))
    .orderBy(desc(siteChecks.checkedAt))
    .limit(1);
  return {
    recent: recent.map((row) => ({ status: row.status === "up" ? "up" : "down", checkedAt: row.checkedAt })),
    lastSpeedAttemptAt: speed?.checkedAt ?? null,
  };
}

/** Staff side: stores one check. */
export async function insertSiteCheck(db: Database, check: NewSiteCheck): Promise<void> {
  if (!isUuid(check.businessId)) throw new Error(`businessId must be a UUID, received "${check.businessId}"`);
  await db.insert(siteChecks).values(check);
}

/** What the customer's Site health panel is built from. Every part is null until a check has produced it. */
export interface SiteHealthFacts {
  /** The latest result about the site (up or down) and when it was taken. */
  readonly latest: { readonly status: Exclude<SiteCheckStatus, "error">; readonly checkedAt: Date } | null;
  /** The first check ever stored, of any status: how long the site has been watched. */
  readonly firstCheckedAt: Date | null;
  /** Up and down results since `since` (30 days back). */
  readonly up: number;
  readonly down: number;
  readonly certificate: { readonly expiresAt: Date; readonly checkedAt: Date } | null;
  readonly phoneSpeed: { readonly score: number; readonly checkedAt: Date } | null;
}

/** Customer side, inside withTenantScope: the facts for the Site health panel. `since` is the start of the uptime window. */
export async function findSiteHealthFacts(tx: ScopedTransaction, since: Date): Promise<SiteHealthFacts> {
  const businessId = await currentBusinessId(tx);
  const own = eq(siteChecks.businessId, businessId);
  const [latest] = await tx
    .select({ status: siteChecks.status, checkedAt: siteChecks.checkedAt })
    .from(siteChecks)
    .where(and(own, inArray(siteChecks.status, ["up", "down"])))
    .orderBy(desc(siteChecks.checkedAt))
    .limit(1);
  const [first] = await tx.select({ at: min(siteChecks.checkedAt) }).from(siteChecks).where(own);
  const tallies = await tx
    .select({ status: siteChecks.status, total: count() })
    .from(siteChecks)
    .where(and(own, gte(siteChecks.checkedAt, since), inArray(siteChecks.status, ["up", "down"])))
    .groupBy(siteChecks.status);
  const [certificate] = await tx
    .select({ expiresAt: siteChecks.sslExpiresAt, checkedAt: siteChecks.checkedAt })
    .from(siteChecks)
    .where(and(own, isNotNull(siteChecks.sslExpiresAt)))
    .orderBy(desc(siteChecks.checkedAt))
    .limit(1);
  const [speed] = await tx
    .select({ score: siteChecks.phoneSpeedScore, checkedAt: siteChecks.checkedAt })
    .from(siteChecks)
    .where(and(own, isNotNull(siteChecks.phoneSpeedScore)))
    .orderBy(desc(siteChecks.checkedAt))
    .limit(1);
  const tally = (status: SiteCheckStatus): number => tallies.find((row) => row.status === status)?.total ?? 0;
  return {
    latest: latest === undefined ? null : { status: latest.status === "up" ? "up" : "down", checkedAt: latest.checkedAt },
    firstCheckedAt: first?.at ?? null,
    up: tally("up"),
    down: tally("down"),
    certificate: certificate?.expiresAt == null ? null : { expiresAt: certificate.expiresAt, checkedAt: certificate.checkedAt },
    phoneSpeed: speed?.score == null ? null : { score: speed.score, checkedAt: speed.checkedAt },
  };
}
