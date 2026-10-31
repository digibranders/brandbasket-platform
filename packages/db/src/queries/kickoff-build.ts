import { and, eq, isNotNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { projects, setupCallBookings } from "../schema";

const HOUR_MS = 3_600_000;

/** How long after the kickoff the first preview is promised. */
export const KICKOFF_PREVIEW_DUE_HOURS = 48;
/** A kickoff is left this long after its end time before the build starts by itself, so staff who write notes straight after the call start it first. */
export const KICKOFF_SETTLE_HOURS = 2;
/** When a start is late (the sweep was down), the promise is this far from now rather than a date already past. */
const LATE_START_PREVIEW_HOURS = 24;

/**
 * When the first preview is due for a build that starts now after a kickoff: 48 hours after the call (when staff said it
 * was held, else when it ended). A date already past is never promised: a late start is due a day from now.
 */
export function firstPreviewDueAfterKickoff(input: { readonly endsAt: Date | null; readonly heldAt: Date | null; readonly now: Date }): Date {
  const base = input.heldAt ?? input.endsAt ?? input.now;
  const due = new Date(base.getTime() + KICKOFF_PREVIEW_DUE_HOURS * HOUR_MS);
  return due.getTime() > input.now.getTime() ? due : new Date(input.now.getTime() + LATE_START_PREVIEW_HOURS * HOUR_MS);
}

/**
 * The kickoff has happened, so a Managed Website project waiting in onboarding is ready to build: it moves to submitted
 * with the first-preview date set. Nothing about the old onboarding checklist is asked, and `onboarding_submitted_at` stays
 * null (it means the customer sent the checklist). Only a business with an active Managed Website line has anything to
 * build, and only a project still in onboarding moves, so a second call, a project already building and a Social-only or
 * Search-only business are all left alone. The status change is recorded in project_events by its trigger. True when a
 * project moved. Staff connection.
 */
export async function markProjectReadyAfterKickoff(db: Database, input: { readonly businessId: string; readonly dueAt: Date; readonly now: Date }): Promise<boolean> {
  const rows = await db
    .update(projects)
    .set({ status: "submitted", slaDueAt: input.dueAt, updatedAt: input.now })
    .where(
      and(
        eq(projects.businessId, input.businessId),
        eq(projects.status, "onboarding"),
        sql`exists (select 1 from bundled_add_ons where business_id = ${input.businessId} and add_on = 'managed-website' and status = 'active')`,
      ),
    )
    .returning({ id: projects.id });
  return rows.length > 0;
}

/** A kickoff whose project is still waiting in onboarding: the call was held by staff, or its end time has passed. */
export interface KickoffToStart {
  readonly businessId: string;
  readonly endsAt: Date | null;
  readonly heldAt: Date | null;
}

/**
 * The kickoffs that are over and whose project has not started: held by staff, or ended at or before `endedBefore`. With
 * `confirmedOnly`, only the ones staff marked held, whatever their end time. Staff connection.
 */
export async function listKickoffsToStart(db: Database, input: { readonly endedBefore: Date; readonly confirmedOnly?: boolean }): Promise<KickoffToStart[]> {
  const over =
    input.confirmedOnly === true
      ? isNotNull(setupCallBookings.heldAt)
      : or(isNotNull(setupCallBookings.heldAt), and(isNotNull(setupCallBookings.endsAt), lte(setupCallBookings.endsAt, input.endedBefore)));
  return db
    .select({ businessId: setupCallBookings.businessId, endsAt: setupCallBookings.endsAt, heldAt: setupCallBookings.heldAt })
    .from(setupCallBookings)
    .innerJoin(projects, eq(projects.businessId, setupCallBookings.businessId))
    .where(and(eq(projects.status, "onboarding"), over));
}

/** One kickoff call as the console's board shows it. */
export interface KickoffBoardRow {
  readonly businessId: string;
  readonly businessName: string;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly heldAt: Date | null;
  readonly summary: string | null;
  /** The status of the business's newest project, or null when it has none (a plan without the website). */
  readonly projectStatus: string | null;
  readonly hasWebsite: boolean;
  /** The catalogue ids of the services the business pays for now. */
  readonly services: readonly string[];
}

/**
 * The kickoff calls worth a look: those that start (or started) in the last `lookBackDays` days or are still ahead, and
 * those held in that time. Newest start first. Staff connection.
 */
export async function listKickoffBoard(db: Database, input: { readonly now: Date; readonly lookBackDays: number }): Promise<KickoffBoardRow[]> {
  const since = new Date(input.now.getTime() - input.lookBackDays * 24 * HOUR_MS);
  const result = await db.execute(sql`
    select b.id as business_id, b.name as business_name, c.starts_at, c.ends_at, c.held_at, c.summary,
      (select p.status from projects p where p.business_id = b.id order by p.created_at desc limit 1) as project_status,
      exists (select 1 from bundled_add_ons a where a.business_id = b.id and a.add_on = 'managed-website' and a.status = 'active') as has_website,
      coalesce((select array_agg(a.add_on order by a.add_on) from bundled_add_ons a where a.business_id = b.id and a.status = 'active'), '{}') as services
    from setup_call_bookings c
    join businesses b on b.id = c.business_id
    where c.starts_at >= ${since.toISOString()}::timestamptz or c.held_at >= ${since.toISOString()}::timestamptz
    order by c.starts_at desc nulls last, c.held_at desc`);
  type Raw = { business_id: string; business_name: string; starts_at: string | Date | null; ends_at: string | Date | null; held_at: string | Date | null; summary: string | null; project_status: string | null; has_website: boolean; services: string[] | string };
  const date = (value: string | Date | null): Date | null => (value === null ? null : new Date(value));
  const list = (value: string[] | string): string[] => (Array.isArray(value) ? value : value.replace(/[{}]/g, "").split(",").filter((entry) => entry !== ""));
  return (result.rows as Raw[]).map((row) => ({
    businessId: row.business_id,
    businessName: row.business_name,
    startsAt: date(row.starts_at),
    endsAt: date(row.ends_at),
    heldAt: date(row.held_at),
    summary: row.summary,
    projectStatus: row.project_status,
    hasWebsite: row.has_website,
    services: list(row.services),
  }));
}
