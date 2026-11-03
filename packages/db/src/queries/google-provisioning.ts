import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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
