import { and, asc, eq, gte, inArray, isNull, lt, ne, notInArray, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { businesses, onboardingProgress, projects, setupCallBookings, staffMembers, users, type ProjectStatus } from "../schema";
import { PROJECT_MOVE_FROM, type ProjectMove } from "./project-moves";
import { isUuid } from "./tenant";

/** A staff write across tenants: the plain staff connection, or a transaction opened on it. */
type Runner = Database | ScopedTransaction;

export class ProjectMoveRefusedError extends Error {
  readonly move: ProjectMove;

  constructor(move: ProjectMove, projectId: string) {
    super(`Project ${projectId} cannot take the move "${move}" from its current status.`);
    this.name = "ProjectMoveRefusedError";
    this.move = move;
  }
}

/** What a staff move returns: enough to write the activity line and refresh the right pages. */
export interface MovedProject {
  readonly id: string;
  readonly businessId: string;
  readonly status: ProjectStatus;
}

const MOVED = { id: projects.id, businessId: projects.businessId, status: projects.status } as const;

function startsFrom(move: ProjectMove) {
  return inArray(projects.status, [...PROJECT_MOVE_FROM[move]]);
}

function onlyRow(rows: readonly MovedProject[], move: ProjectMove, projectId: string): MovedProject {
  const row = rows[0];
  if (row === undefined) throw new ProjectMoveRefusedError(move, projectId);
  return row;
}

/** Cancels an open build. It does not touch the client's plan or billing; staff handle that separately. */
export async function cancelProject(db: Runner, projectId: string): Promise<MovedProject> {
  if (!isUuid(projectId)) throw new ProjectMoveRefusedError("cancel", projectId);
  const rows = await db
    .update(projects)
    .set({ status: "cancelled", onHoldReason: null })
    .where(and(eq(projects.id, projectId), startsFrom("cancel")))
    .returning(MOVED);
  return onlyRow(rows, "cancel", projectId);
}

export class ProjectBuilderNotStaffError extends Error {
  constructor(userId: string) {
    super(`User ${userId} is not active staff, so they cannot be a builder.`);
    this.name = "ProjectBuilderNotStaffError";
  }
}

/** Sets who is building an open project, or clears it with null. Only an active staff member can be assigned. */
export async function assignProjectBuilder(db: Runner, projectId: string, staffUserId: string | null): Promise<MovedProject> {
  if (!isUuid(projectId)) throw new ProjectMoveRefusedError("assign", projectId);
  if (staffUserId !== null) {
    const [staff] = await db
      .select({ userId: staffMembers.userId })
      .from(staffMembers)
      .where(and(eq(staffMembers.userId, staffUserId), eq(staffMembers.active, true)))
      .limit(1);
    if (staff === undefined) throw new ProjectBuilderNotStaffError(staffUserId);
  }
  const rows = await db
    .update(projects)
    .set({ assignedStaffId: staffUserId })
    .where(and(eq(projects.id, projectId), startsFrom("assign")))
    .returning(MOVED);
  return onlyRow(rows, "assign", projectId);
}

/** A calendar day, `YYYY-MM-DD`, that really exists. */
function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Sets the day staff plan to put an open project's website live, or clears it with null. The customer sees it once it is set
 * (a plan, not a promise), so a day that is not a real calendar day is refused rather than stored.
 */
export async function setProjectLaunchPlannedOn(db: Runner, projectId: string, day: string | null): Promise<MovedProject> {
  if (!isUuid(projectId) || (day !== null && !isCalendarDay(day))) throw new ProjectMoveRefusedError("plan-launch", projectId);
  const rows = await db
    .update(projects)
    .set({ launchPlannedOn: day })
    .where(and(eq(projects.id, projectId), startsFrom("plan-launch")))
    .returning(MOVED);
  return onlyRow(rows, "plan-launch", projectId);
}

/**
 * Gives the client one more round of changes than their plan includes. The allowance is revision_rounds_included;
 * revision_rounds_granted counts the rounds the client has already asked for (requestProjectRevisions adds to it).
 */
export async function grantRevisionRound(db: Runner, projectId: string): Promise<MovedProject> {
  if (!isUuid(projectId)) throw new ProjectMoveRefusedError("grant-round", projectId);
  const rows = await db
    .update(projects)
    .set({ revisionRoundsIncluded: sql`${projects.revisionRoundsIncluded} + 1` })
    .where(and(eq(projects.id, projectId), startsFrom("grant-round")))
    .returning(MOVED);
  return onlyRow(rows, "grant-round", projectId);
}

const CLOSED_STATUSES: readonly ProjectStatus[] = ["live", "cancelled"];
/** Statuses whose first preview is promised by sla_due_at: the clock runs until the preview goes out. */
const CLOCK_RUNNING: readonly ProjectStatus[] = ["submitted", "building"];

/** One card on the console's Projects board. */
export interface StaffProjectRow {
  readonly projectId: string;
  readonly businessId: string;
  readonly businessName: string;
  readonly status: ProjectStatus;
  readonly slaDueAt: Date | null;
  readonly previewSentAt: Date | null;
  readonly launchedAt: Date | null;
  readonly onHoldReason: string | null;
  readonly revisionRoundsIncluded: number;
  /** Rounds the client has asked for (revision_rounds_granted). */
  readonly revisionRoundsUsed: number;
  readonly builderId: string | null;
  readonly builderName: string | null;
  readonly callStartsAt: Date | null;
}

/**
 * Every open build, and every build that went live on or after monthStart, with its business, builder and kickoff
 * call. Ordered by the first-preview promise date (sla_due_at, set once and never cleared), so a build past its first
 * preview keeps its original place; builds with no promise date come last.
 */
export async function listOpenProjectsForStaff(db: Database, monthStart: Date): Promise<StaffProjectRow[]> {
  return db
    .select({
      projectId: projects.id,
      businessId: projects.businessId,
      businessName: businesses.name,
      status: projects.status,
      slaDueAt: projects.slaDueAt,
      previewSentAt: projects.previewSentAt,
      launchedAt: projects.launchedAt,
      onHoldReason: projects.onHoldReason,
      revisionRoundsIncluded: projects.revisionRoundsIncluded,
      revisionRoundsUsed: projects.revisionRoundsGranted,
      builderId: projects.assignedStaffId,
      builderName: users.name,
      callStartsAt: setupCallBookings.startsAt,
    })
    .from(projects)
    .innerJoin(businesses, eq(businesses.id, projects.businessId))
    .leftJoin(users, eq(users.id, projects.assignedStaffId))
    .leftJoin(setupCallBookings, eq(setupCallBookings.businessId, projects.businessId))
    .where(and(ne(projects.status, "cancelled"), or(ne(projects.status, "live"), gte(projects.launchedAt, monthStart))))
    .orderBy(asc(projects.slaDueAt), asc(businesses.name));
}

/** What the Project tab's Build controls need about a business's open build. */
export interface StaffProjectControls {
  readonly id: string;
  readonly businessId: string;
  readonly status: ProjectStatus;
  readonly onHoldReason: string | null;
  readonly revisionRoundsIncluded: number;
  readonly revisionRoundsUsed: number;
  readonly assignedStaffId: string | null;
  /** The day staff plan to put the website live (`YYYY-MM-DD`), or null while none is set. */
  readonly launchPlannedOn: string | null;
}

/** The business's open build, or null when it has none (live, cancelled, or never started). */
export async function findOpenProjectForStaff(db: Database, businessId: string): Promise<StaffProjectControls | null> {
  if (!isUuid(businessId)) return null;
  const [row] = await db
    .select({
      id: projects.id,
      businessId: projects.businessId,
      status: projects.status,
      onHoldReason: projects.onHoldReason,
      revisionRoundsIncluded: projects.revisionRoundsIncluded,
      revisionRoundsUsed: projects.revisionRoundsGranted,
      assignedStaffId: projects.assignedStaffId,
      launchPlannedOn: projects.launchPlannedOn,
    })
    .from(projects)
    .where(and(eq(projects.businessId, businessId), notInArray(projects.status, [...CLOSED_STATUSES])))
    .limit(1);
  return row ?? null;
}

/** One kickoff call on the console's Calls page. */
export interface StaffCallRow {
  readonly businessId: string;
  readonly businessName: string;
  /** Null when the booking page reported that a call was booked but not when. */
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  /** How many of the four answer steps (business, content, brand, domain) the open build has done. */
  readonly setupDone: number;
}

/** The website's four answer steps; "review" is the send step and does not count. */
export const SETUP_STEPS_TOTAL = 4;

/** Kickoff calls starting in [from, until), plus every booking with no reported time. Earliest first, no-time last. */
export async function listSetupCallsForStaff(db: Database, from: Date, until: Date): Promise<StaffCallRow[]> {
  return db
    .select({
      businessId: setupCallBookings.businessId,
      businessName: businesses.name,
      startsAt: setupCallBookings.startsAt,
      endsAt: setupCallBookings.endsAt,
      setupDone: sql<number>`(
        select count(*)::int from ${onboardingProgress} op
        join ${projects} p on p.id = op.project_id
        where op.business_id = ${setupCallBookings.businessId}
          and op.completed_at is not null
          and op.step <> 'review'
          and p.status not in ('live', 'cancelled')
      )`,
    })
    .from(setupCallBookings)
    .innerJoin(businesses, eq(businesses.id, setupCallBookings.businessId))
    // A call staff marked held by phone has no time and already happened, so it is not "booked, time not reported".
    .where(
      or(
        and(isNull(setupCallBookings.startsAt), isNull(setupCallBookings.heldAt)),
        and(gte(setupCallBookings.startsAt, from), lt(setupCallBookings.startsAt, until)),
      ),
    )
    .orderBy(asc(setupCallBookings.startsAt), asc(businesses.name));
}

/** Builds whose first preview was promised before now and has not gone out. */
export async function countLateProjects(db: Database, now: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projects)
    .where(and(inArray(projects.status, [...CLOCK_RUNNING]), lt(projects.slaDueAt, now)));
  return row?.count ?? 0;
}

/** Kickoff calls starting in [from, until). */
export async function countCallsBetween(db: Database, from: Date, until: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(setupCallBookings)
    .where(and(gte(setupCallBookings.startsAt, from), lt(setupCallBookings.startsAt, until)));
  return row?.count ?? 0;
}
