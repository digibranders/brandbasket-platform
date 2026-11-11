import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ConnectedSource, SourceStatus } from "../report-states";
import { businesses, domains, projects, reportSources, websiteHosting, type ReportSourceRow } from "../schema";

/*
 * What the go live job (plan 62) reads and writes, on the staff connection: the live sites that could have a Google property,
 * and each business's Analytics and Search Console source rows as the job keeps them.
 */

export interface ProvisionSource {
  readonly externalId: string;
  readonly status: SourceStatus;
  readonly measurementId: string | null;
  readonly verifiedAt: Date | null;
  readonly provisionedAt: Date | null;
  readonly secondOwnerOk: boolean;
  readonly detail: string | null;
}

export interface ProvisionCandidate {
  readonly businessId: string;
  readonly businessName: string;
  /** The primary domain, lower case. */
  readonly hostname: string;
  readonly vercelProjectId: string;
  readonly vercelTeamId: string | null;
  /** The sync took the website offline for a lapsed plan. */
  readonly hostingPaused: boolean;
  readonly ga4: ProvisionSource | null;
  readonly gsc: ProvisionSource | null;
}

const toSource = (row: ReportSourceRow): ProvisionSource => ({
  externalId: row.externalId,
  status: row.status,
  measurementId: row.measurementId,
  verifiedAt: row.verifiedAt,
  provisionedAt: row.provisionedAt,
  secondOwnerOk: row.secondOwnerOk,
  detail: row.detail,
});

/**
 * Every business whose latest project is live, with hosting on record and a primary domain, oldest first, or just one when
 * `businessId` is given. The caller decides which of them are eligible (a free address never is).
 */
export async function listProvisionCandidates(db: Database, businessId?: string): Promise<ProvisionCandidate[]> {
  const rows = await db
    .select({
      businessId: businesses.id,
      businessName: businesses.name,
      hostname: sql<string>`lower(${domains.hostname})`,
      vercelProjectId: websiteHosting.vercelProjectId,
      vercelTeamId: websiteHosting.vercelTeamId,
      pausedAt: websiteHosting.pausedAt,
    })
    .from(websiteHosting)
    .innerJoin(businesses, eq(businesses.id, websiteHosting.businessId))
    .innerJoin(domains, and(eq(domains.businessId, websiteHosting.businessId), eq(domains.isPrimary, true), isNull(domains.removedAt)))
    .where(and(sql`exists (select 1 from ${projects} where ${projects.businessId} = ${websiteHosting.businessId} and ${projects.status} = 'live')`, businessId === undefined ? undefined : eq(businesses.id, businessId)))
    .orderBy(websiteHosting.createdAt);
  if (rows.length === 0) return [];
  const sources = await db.select().from(reportSources).where(inArray(reportSources.businessId, rows.map((row) => row.businessId)));
  const sourceOf = (id: string, source: ConnectedSource): ProvisionSource | null => {
    const found = sources.find((row) => row.businessId === id && row.source === source);
    return found === undefined ? null : toSource(found);
  };
  return rows.map((row) => ({
    businessId: row.businessId,
    businessName: row.businessName,
    hostname: row.hostname,
    vercelProjectId: row.vercelProjectId,
    vercelTeamId: row.vercelTeamId,
    hostingPaused: row.pausedAt !== null,
    ga4: sourceOf(row.businessId, "ga4"),
    gsc: sourceOf(row.businessId, "gsc"),
  }));
}

export interface ProvisionedSourceInput {
  readonly businessId: string;
  readonly source: ConnectedSource;
  readonly externalId: string;
  readonly status: SourceStatus;
  readonly measurementId?: string | null;
  readonly verifiedAt?: Date | null;
  readonly provisionedAt?: Date | null;
  readonly secondOwnerOk?: boolean;
  readonly detail?: string | null;
  readonly now: Date;
}

/** Creates or updates one source row. A field left out keeps what it had; a new `externalId` replaces the old one. */
export async function saveProvisionedSource(db: Database, input: ProvisionedSourceInput): Promise<void> {
  const fields = {
    externalId: input.externalId,
    status: input.status,
    ...(input.measurementId === undefined ? {} : { measurementId: input.measurementId }),
    ...(input.verifiedAt === undefined ? {} : { verifiedAt: input.verifiedAt }),
    ...(input.provisionedAt === undefined ? {} : { provisionedAt: input.provisionedAt }),
    ...(input.secondOwnerOk === undefined ? {} : { secondOwnerOk: input.secondOwnerOk }),
    ...(input.detail === undefined ? {} : { detail: input.detail === null ? null : input.detail.slice(0, 300) }),
    updatedAt: input.now,
  };
  await db
    .insert(reportSources)
    .values({ businessId: input.businessId, source: input.source, ...fields })
    .onConflictDoUpdate({ target: [reportSources.businessId, reportSources.source], set: fields });
}

/*
 * What staff do from the console (plan 62, step 5). They only change rows on the staff connection; the go live job acts on
 * them on its next pass (apps/platform/lib/google-provision.ts).
 */

/** Asks the job to look at Search Console again now: clears the 30 minute wait. True when there was an unverified site to ask about. */
export async function retryGoogleVerification(db: Database, businessId: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(reportSources)
    .set({ provisionedAt: null, updatedAt: now })
    .where(and(eq(reportSources.businessId, businessId), eq(reportSources.source, "gsc"), isNull(reportSources.verifiedAt), ne(reportSources.status, "removed")))
    .returning({ id: reportSources.id });
  return rows.length > 0;
}

/** Takes the business out of Google: both sources become `removed`, nothing is deleted, and the job leaves the site alone. Returns the rows changed. */
export async function detachGoogle(db: Database, businessId: string, now: Date): Promise<number> {
  const rows = await db
    .update(reportSources)
    .set({ status: "removed", detail: "Detached by staff", updatedAt: now })
    .where(and(eq(reportSources.businessId, businessId), ne(reportSources.status, "removed")))
    .returning({ id: reportSources.id });
  return rows.length;
}

/** Undoes a detach: a removed source goes back to waiting (a verified Search Console site to its first pull), so the job picks the site up again. Returns the rows changed. */
export async function provisionGoogleAgain(db: Database, businessId: string, now: Date): Promise<number> {
  const rows = await db
    .update(reportSources)
    .set({
      status: sql`case when ${reportSources.source} = 'gsc' and ${reportSources.verifiedAt} is not null then 'pending' else 'awaiting_setup' end`,
      detail: null,
      updatedAt: now,
    })
    .where(and(eq(reportSources.businessId, businessId), eq(reportSources.status, "removed")))
    .returning({ id: reportSources.id });
  return rows.length;
}

/** How many Search Console sites and Analytics properties a Google account holds, from our own rows (a detached one no longer counts). */
export async function countGoogleSources(db: Database, slot = 1): Promise<{ readonly gsc: number; readonly ga4: number }> {
  const rows = await db
    .select({ source: reportSources.source, count: sql<number>`count(*)::int` })
    .from(reportSources)
    .where(and(eq(reportSources.googleSlot, slot), ne(reportSources.status, "removed")))
    .groupBy(reportSources.source);
  const countOf = (source: ConnectedSource): number => rows.find((row) => row.source === source)?.count ?? 0;
  return { gsc: countOf("gsc"), ga4: countOf("ga4") };
}

export interface GoogleAttentionCutoffs {
  /** A Search Console site still unverified and made before this is stuck. */
  readonly unverifiedBefore: Date;
  /** A connected site whose latest day is before this (YYYY-MM-DD) has stopped getting data. */
  readonly gscDataBefore: string;
  readonly ga4DataBefore: string;
}

export type GoogleAttentionRow =
  | { readonly kind: "unverified"; readonly businessId: string; readonly businessName: string; readonly since: Date }
  | { readonly kind: "no-data"; readonly businessId: string; readonly businessName: string; readonly source: ConnectedSource; readonly latestDay: string };

/*
 * The latest day with a number for a source row, as raw SQL because it reads another table from inside a filter. `gsc.clicks`
 * and `ga4.visits` are the metrics the pulls always write (latestGscDay and latestGa4Day).
 */
const LATEST_DAY = sql`(select max(md.day) from metric_daily md where md.business_id = report_sources.business_id and md.metric = case report_sources.source when 'gsc' then 'gsc.clicks' else 'ga4.visits' end)`;

/**
 * The Google problems Today lists, already filtered by the caller's cutoffs: Search Console sites that have been waiting to be
 * verified too long (not while the site's hosting is paused, the job does nothing then), and connected sources whose newest day
 * is too old. A source with no day yet is not listed: a new site has none. Detached and lost sources are not listed either.
 */
export async function listGoogleAttention(db: Database, cutoffs: GoogleAttentionCutoffs): Promise<GoogleAttentionRow[]> {
  const unverified = await db
    .select({ businessId: reportSources.businessId, businessName: businesses.name, since: reportSources.createdAt })
    .from(reportSources)
    .innerJoin(businesses, eq(businesses.id, reportSources.businessId))
    .where(
      and(
        eq(reportSources.source, "gsc"),
        eq(reportSources.status, "awaiting_setup"),
        isNull(reportSources.verifiedAt),
        sql`${reportSources.createdAt} < ${cutoffs.unverifiedBefore}`,
        sql`not exists (select 1 from website_hosting wh where wh.business_id = ${reportSources.businessId} and wh.paused_at is not null)`,
      ),
    );
  const silent = await db
    .select({ businessId: reportSources.businessId, businessName: businesses.name, source: reportSources.source, latestDay: sql<string>`${LATEST_DAY}::text` })
    .from(reportSources)
    .innerJoin(businesses, eq(businesses.id, reportSources.businessId))
    .where(
      and(
        eq(reportSources.status, "connected"),
        sql`((${reportSources.source} = 'gsc' and ${LATEST_DAY} < ${cutoffs.gscDataBefore}::date) or (${reportSources.source} = 'ga4' and ${LATEST_DAY} < ${cutoffs.ga4DataBefore}::date))`,
      ),
    );
  return [
    ...unverified.map((row): GoogleAttentionRow => ({ kind: "unverified", ...row })),
    ...silent.map((row): GoogleAttentionRow => ({ kind: "no-data", ...row })),
  ];
}
