import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { projects, staffMembers, type ProjectStatus } from "../schema";
import { PROJECT_MOVE_FROM, type ProjectMove } from "./project-moves";
import { isUuid } from "./tenant";

/** A staff write across tenants: the plain staff connection, or a transaction opened on it. */
type Runner = Database | ScopedTransaction;

/** The longest hold reason staff may type; the client sees it on their dashboard. */
export const ON_HOLD_REASON_MAX = 200;

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

/** Moves a submitted build to building. The status list is the gate: anything else matches no row and throws. */
export async function setProjectBuilding(db: Runner, projectId: string): Promise<MovedProject> {
  if (!isUuid(projectId)) throw new ProjectMoveRefusedError("start-building", projectId);
  const rows = await db
    .update(projects)
    .set({ status: "building" })
    .where(and(eq(projects.id, projectId), startsFrom("start-building")))
    .returning(MOVED);
  return onlyRow(rows, "start-building", projectId);
}

/**
 * Puts an open build on hold with the reason the client will see, and remembers its status so Resume can return it
 * there. In an UPDATE every right-hand side reads the row as it was, so status_before_hold takes the old status.
 */
export async function putProjectOnHold(db: Runner, projectId: string, reason: string): Promise<MovedProject> {
  const trimmed = reason.trim();
  if (!isUuid(projectId) || trimmed === "" || trimmed.length > ON_HOLD_REASON_MAX) throw new ProjectMoveRefusedError("hold", projectId);
  const rows = await db
    .update(projects)
    .set({ status: "on_hold", onHoldReason: trimmed, statusBeforeHold: sql`${projects.status}` })
    .where(and(eq(projects.id, projectId), startsFrom("hold")))
    .returning(MOVED);
  return onlyRow(rows, "hold", projectId);
}

/** Returns a held build to where it was. A hold recorded before status_before_hold existed resumes into building. */
export async function resumeProject(db: Runner, projectId: string): Promise<MovedProject> {
  if (!isUuid(projectId)) throw new ProjectMoveRefusedError("resume", projectId);
  const rows = await db
    .update(projects)
    .set({
      status: sql`coalesce(${projects.statusBeforeHold}, 'building'::project_status)`,
      onHoldReason: null,
      statusBeforeHold: null,
    })
    .where(and(eq(projects.id, projectId), startsFrom("resume")))
    .returning(MOVED);
  return onlyRow(rows, "resume", projectId);
}

/** Cancels an open build. It does not touch the client's plan or billing; staff handle that separately. */
export async function cancelProject(db: Runner, projectId: string): Promise<MovedProject> {
  if (!isUuid(projectId)) throw new ProjectMoveRefusedError("cancel", projectId);
  const rows = await db
    .update(projects)
    .set({ status: "cancelled", statusBeforeHold: null })
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
