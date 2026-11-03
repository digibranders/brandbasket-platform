import { and, asc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ReportService } from "../report-states";
import { activityEvents, adCampaignSnapshots, addOnSubscriptions, bundledAddOns, businesses, deliverables, enquiries, monthlySnapshots, siteChecks, type BillingCurrency, type EnquiryKind } from "../schema";
import { listBundledAddOnsForBusiness } from "./bundled-add-ons";
import { boughtSetupServicesFrom } from "./service-setup";
import { isUuid } from "./tenant";

/*
 * What the monthly report composer reads (plan 58): the raw records of one business for one month, on the staff connection.
 * Months are Indian calendar months, so a month runs from 00:00 at +05:30. Nothing here is worded or rounded; the composer
 * (packages/shared/src/lib/reports/compose.ts) does that, and leaves out whatever is null.
 */

const INDIA_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const PAID_ADD_ON_STATUSES = ["active", "scheduled", "past_due"] as const;

/** The first instant of an Indian calendar month (`YYYY-MM-01`) and of the next one. */
export function indianMonthBounds(month: string): { readonly start: Date; readonly end: Date } {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(month)) throw new RangeError(`A month is the first day, YYYY-MM-01: ${month}`);
  const [year = 0, number = 0] = month.split("-").map(Number);
  const next = number === 12 ? `${year + 1}-01-01` : `${year}-${String(number + 1).padStart(2, "0")}-01`;
  return { start: new Date(`${month}T00:00:00+05:30`), end: new Date(`${next}T00:00:00+05:30`) };
}

function previousMonth(month: string): string {
  const [year = 0, number = 0] = month.split("-").map(Number);
  return number === 1 ? `${year - 1}-12-01` : `${year}-${String(number - 1).padStart(2, "0")}-01`;
}

/** The Indian calendar day (`YYYY-MM-DD`) an instant falls on. */
export function indianDay(instant: Date): string {
  return new Date(instant.getTime() + INDIA_OFFSET_MS).toISOString().slice(0, 10);
}

export interface ReportBusiness {
  readonly id: string;
  readonly name: string;
  readonly currency: BillingCurrency;
  /** The services that get a report: the Website while its line is active, Social & Ads and Local SEO + AEO by the bought rule. */
  readonly services: readonly ReportService[];
}

/** Every business that has a service to report on, by name. Staff connection. */
export async function listReportBusinesses(db: Database): Promise<ReportBusiness[]> {
  const [fromPlans, fromAddOns] = await Promise.all([
    db.selectDistinct({ id: bundledAddOns.businessId }).from(bundledAddOns).where(eq(bundledAddOns.status, "active")),
    db.selectDistinct({ id: addOnSubscriptions.businessId }).from(addOnSubscriptions).where(inArray(addOnSubscriptions.status, [...PAID_ADD_ON_STATUSES])),
  ]);
  const ids = [...new Set([...fromPlans, ...fromAddOns].map((row) => row.id))];
  if (ids.length === 0) return [];
  const rows = await db.select({ id: businesses.id, name: businesses.name, currency: businesses.currency }).from(businesses).where(inArray(businesses.id, ids)).orderBy(asc(businesses.name), asc(businesses.id));
  const result: ReportBusiness[] = [];
  for (const row of rows) {
    const services = await listReportServices(db, row.id);
    if (services.length > 0) result.push({ ...row, services });
  }
  return result;
}

/** The services of one business that get a report this month. */
export async function listReportServices(db: Database, businessId: string): Promise<ReportService[]> {
  const [lines, subscriptions] = await Promise.all([
    listBundledAddOnsForBusiness(db, businessId),
    db.select({ addOn: addOnSubscriptions.addOn, status: addOnSubscriptions.status }).from(addOnSubscriptions).where(eq(addOnSubscriptions.businessId, businessId)),
  ]);
  const website = lines.some((line) => line.addOn === "managed-website" && line.status === "active" && line.endRequestedAt === null);
  const setup = boughtSetupServicesFrom(
    // A line that is only `pending` has not been paid for: nothing to report on yet.
    lines.filter((line) => line.status === "active"),
    subscriptions,
  );
  return [...(website ? (["website"] as const) : []), ...setup];
}

export interface RawKindCounts {
  /** Enquiries received in the month, by kind. */
  readonly counts: Readonly<Partial<Record<EnquiryKind, number>>>;
  /** Kinds the business has ever had an enquiry of by the end of the month: only these were evidently being measured. */
  readonly measured: readonly EnquiryKind[];
}

export interface RawReportFacts {
  readonly site: {
    readonly up: number;
    readonly down: number;
    readonly phoneSpeed: { readonly score: number; readonly checkedAt: Date } | null;
    readonly certificateEndsAt: Date | null;
  };
  readonly enquiries: { readonly current: RawKindCounts; readonly previous: RawKindCounts };
  readonly snapshots: readonly {
    readonly service: "social" | "search";
    readonly adSpendCents: number | null;
    readonly adEnquiries: number | null;
    readonly postsPublished: number | null;
    readonly postsPlanned: number | null;
    readonly keywordsPageOne: number | null;
    readonly keywordsPageOnePrev: number | null;
    readonly reach: number | null;
    readonly followers: number | null;
    readonly profileVisits: number | null;
  }[];
  readonly campaigns: readonly { readonly spendCents: number; readonly leads: number | null }[];
  /** Work with a date in the month: posts, improved pages and fixed listings. */
  readonly deliverables: readonly { readonly kind: "post" | "page" | "listing"; readonly status: string; readonly dueOn: string; readonly title: string }[];
  readonly activity: readonly { readonly service: ReportService | null; readonly day: string; readonly title: string }[];
}

async function enquiryKindCounts(db: Database, businessId: string, start: Date, end: Date, previousStart: Date): Promise<{ current: RawKindCounts; previous: RawKindCounts }> {
  const rows = await db
    .select({
      kind: enquiries.kind,
      current: sql<number>`count(*) filter (where ${enquiries.receivedAt} >= ${start} and ${enquiries.receivedAt} < ${end})::int`,
      previous: sql<number>`count(*) filter (where ${enquiries.receivedAt} >= ${previousStart} and ${enquiries.receivedAt} < ${start})::int`,
      beforeStart: sql<number>`count(*) filter (where ${enquiries.receivedAt} < ${start})::int`,
      beforeEnd: sql<number>`count(*) filter (where ${enquiries.receivedAt} < ${end})::int`,
    })
    .from(enquiries)
    .where(eq(enquiries.businessId, businessId))
    .groupBy(enquiries.kind);
  const side = (pick: "current" | "previous"): RawKindCounts => ({
    counts: Object.fromEntries(rows.map((row) => [row.kind, row[pick]])),
    measured: rows.filter((row) => (pick === "current" ? row.beforeEnd : row.beforeStart) > 0).map((row) => row.kind),
  });
  return { current: side("current"), previous: side("previous") };
}

/** The raw records of one business for one month (`YYYY-MM-01`). Staff connection. */
export async function readReportFacts(db: Database, businessId: string, month: string): Promise<RawReportFacts> {
  if (!isUuid(businessId)) throw new Error(`businessId must be a UUID, received "${businessId}"`);
  const { start, end } = indianMonthBounds(month);
  const { start: previousStart } = indianMonthBounds(previousMonth(month));
  const inMonth = and(eq(siteChecks.businessId, businessId), gte(siteChecks.checkedAt, start), lt(siteChecks.checkedAt, end));
  const monthDay = (bound: Date): string => indianDay(bound);

  const [tallies, speed, certificate, kinds, snapshots, campaigns, work, events] = await Promise.all([
    db
      .select({ status: siteChecks.status, total: sql<number>`count(*)::int` })
      .from(siteChecks)
      .where(and(inMonth, inArray(siteChecks.status, ["up", "down"])))
      .groupBy(siteChecks.status),
    db
      .select({ score: siteChecks.phoneSpeedScore, checkedAt: siteChecks.checkedAt })
      .from(siteChecks)
      .where(and(inMonth, isNotNull(siteChecks.phoneSpeedScore)))
      .orderBy(sql`${siteChecks.checkedAt} desc`)
      .limit(1),
    db
      .select({ endsAt: siteChecks.sslExpiresAt })
      .from(siteChecks)
      .where(and(inMonth, isNotNull(siteChecks.sslExpiresAt)))
      .orderBy(sql`${siteChecks.checkedAt} desc`)
      .limit(1),
    enquiryKindCounts(db, businessId, start, end, previousStart),
    db.select().from(monthlySnapshots).where(and(eq(monthlySnapshots.businessId, businessId), eq(monthlySnapshots.month, month))),
    db.select({ spendCents: adCampaignSnapshots.spendCents, leads: adCampaignSnapshots.leads }).from(adCampaignSnapshots).where(and(eq(adCampaignSnapshots.businessId, businessId), eq(adCampaignSnapshots.month, month))),
    db
      .select({ kind: deliverables.kind, status: deliverables.status, dueOn: deliverables.dueOn, title: deliverables.title })
      .from(deliverables)
      .where(and(eq(deliverables.businessId, businessId), gte(deliverables.dueOn, monthDay(start)), lt(deliverables.dueOn, monthDay(end)))),
    db
      .select({ service: activityEvents.service, occurredAt: activityEvents.occurredAt, title: activityEvents.title })
      .from(activityEvents)
      .where(and(eq(activityEvents.businessId, businessId), gte(activityEvents.occurredAt, start), lt(activityEvents.occurredAt, end)))
      .orderBy(asc(activityEvents.occurredAt)),
  ]);
  const tally = (status: string): number => tallies.find((row) => row.status === status)?.total ?? 0;
  const [latestSpeed] = speed;
  return {
    site: {
      up: tally("up"),
      down: tally("down"),
      phoneSpeed: latestSpeed === undefined || latestSpeed.score === null ? null : { score: latestSpeed.score, checkedAt: latestSpeed.checkedAt },
      certificateEndsAt: certificate[0]?.endsAt ?? null,
    },
    enquiries: kinds,
    snapshots: snapshots.map((row) => ({
      service: row.service === "social" ? "social" : "search",
      adSpendCents: row.adSpendCents,
      adEnquiries: row.adEnquiries,
      postsPublished: row.postsPublished,
      postsPlanned: row.postsPlanned,
      keywordsPageOne: row.keywordsPageOne,
      keywordsPageOnePrev: row.keywordsPageOnePrev,
      reach: row.reach,
      followers: row.followers,
      profileVisits: row.profileVisits,
    })),
    campaigns,
    deliverables: work.flatMap((row) => (row.dueOn === null ? [] : [{ kind: row.kind, status: row.status, dueOn: row.dueOn, title: row.title }])),
    activity: events.map((row) => ({ service: row.service, day: indianDay(row.occurredAt), title: row.title })),
  };
}
