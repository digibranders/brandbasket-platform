import { and, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { domains, projects, type ProjectKind, type ProjectStatus } from "../schema";
import { isUuid } from "./tenant";

/** The one promised duration: the first preview is due this long after onboarding is submitted (spec §5.3). */
export const FIRST_PREVIEW_DUE_HOURS = 48;

const HOUR_MS = 60 * 60 * 1000;

/** Statuses a project leaves the "open" set with; a business may hold any number of these. */
const CLOSED_STATUSES: readonly ProjectStatus[] = ["live", "cancelled"];

/** Statuses staff can send a preview from: already sent to us, and not yet live. */
export const PROJECT_STATUSES_PREVIEWABLE: readonly ProjectStatus[] = ["submitted", "building", "revisions"];

/** A staff write across tenants: the plain staff connection, or a transaction opened on it. */
export type Runner = Database | ScopedTransaction;

export class ProjectNotInOnboardingError extends Error {
  constructor(projectId: string) {
    super(`Project ${projectId} is not in onboarding, so it cannot be submitted.`);
    this.name = "ProjectNotInOnboardingError";
  }
}

export class ProjectNotReadyForPreviewError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no project ready for a preview to be sent.`);
    this.name = "ProjectNotReadyForPreviewError";
  }
}

export class ProjectNotAwaitingResponseError extends Error {
  constructor(id: string) {
    super(`Project ${id} is not awaiting a response to a preview.`);
    this.name = "ProjectNotAwaitingResponseError";
  }
}

export class ProjectNotApprovedError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no approved project to launch.`);
    this.name = "ProjectNotApprovedError";
  }
}

export interface Project {
  readonly id: string;
  readonly businessId: string;
  readonly kind: ProjectKind;
  readonly status: ProjectStatus;
  readonly onboardingSubmittedAt: Date | null;
  /** When the first preview is promised by. Null until onboarding is submitted. */
  readonly slaDueAt: Date | null;
  /** The day staff plan to put the website live (`YYYY-MM-DD`), or null while none is set. */
  readonly launchPlannedOn: string | null;
  /** Set together, by recordProjectPreviewSent. Null until the first preview goes out. */
  readonly previewUrl: string | null;
  readonly previewSentAt: Date | null;
  readonly onHoldReason: string | null;
  readonly revisionRoundsIncluded: number;
  readonly revisionRoundsGranted: number;
  readonly launchedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const PROJECT_COLUMNS = {
  id: projects.id,
  businessId: projects.businessId,
  kind: projects.kind,
  status: projects.status,
  onboardingSubmittedAt: projects.onboardingSubmittedAt,
  slaDueAt: projects.slaDueAt,
  launchPlannedOn: projects.launchPlannedOn,
  previewUrl: projects.previewUrl,
  previewSentAt: projects.previewSentAt,
  onHoldReason: projects.onHoldReason,
  revisionRoundsIncluded: projects.revisionRoundsIncluded,
  revisionRoundsGranted: projects.revisionRoundsGranted,
  launchedAt: projects.launchedAt,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
} as const;

/**
 * The tenant's open project, or null. Row-level security limits the read to the scoped business, and
 * `projects_one_open_per_business_idx` allows at most one open project, so the result is never ambiguous.
 */
export async function findOpenProject(tx: ScopedTransaction): Promise<Project | null> {
  const rows = await tx
    .select(PROJECT_COLUMNS)
    .from(projects)
    .where(notInArray(projects.status, [...CLOSED_STATUSES]))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The tenant's most recent project, whatever its status — unlike `findOpenProject`, this also returns one that has
 * gone `live` or `cancelled`. Row-level security limits the read to the scoped business. Use this wherever the
 * caller genuinely needs to know a project's current status (e.g. whether it is `live`), not just whether there is
 * one still open in onboarding.
 */
export async function findLatestProject(tx: ScopedTransaction): Promise<Project | null> {
  const rows = await tx.select(PROJECT_COLUMNS).from(projects).orderBy(desc(projects.createdAt), desc(projects.id)).limit(1);
  return rows[0] ?? null;
}

export interface ProjectSubmission {
  readonly projectId: string;
  readonly now: Date;
}

/**
 * Moves a project from onboarding to submitted and starts the 48-hour clock, in one statement. The
 * `status = 'onboarding'` condition is the gate: a second submission, or one racing the first, matches no row and
 * throws, so the clock is never restarted. This is the only customer-side transition.
 */
export async function submitProject(tx: ScopedTransaction, submission: ProjectSubmission): Promise<Project> {
  if (!isUuid(submission.projectId)) throw new ProjectNotInOnboardingError(submission.projectId);
  const rows = await tx
    .update(projects)
    .set({
      status: "submitted",
      onboardingSubmittedAt: submission.now,
      slaDueAt: new Date(submission.now.getTime() + FIRST_PREVIEW_DUE_HOURS * HOUR_MS),
    })
    .where(and(eq(projects.id, submission.projectId), eq(projects.status, "onboarding")))
    .returning(PROJECT_COLUMNS);
  const project = rows[0];
  if (project === undefined) throw new ProjectNotInOnboardingError(submission.projectId);
  return project;
}

/**
 * Opens the onboarding project for a business that has just been created. System work only: the app role cannot
 * insert projects. Takes any transaction because it runs inside the staff-side account creation.
 */
export async function insertOnboardingProject(
  tx: ScopedTransaction,
  businessId: string,
): Promise<{ readonly id: string }> {
  const rows = await tx
    .insert(projects)
    .values({ businessId, kind: "initial_build", status: "onboarding" })
    .returning({ id: projects.id });
  const project = rows[0];
  if (project === undefined) throw new Error("Project insert returned no row");
  return project;
}

export interface ProjectPreviewSent {
  readonly businessId: string;
  readonly previewUrl: string;
  readonly now: Date;
}

/**
 * Records that staff sent a preview link for a business's open project, moving it to `preview`. Only a project
 * already sent to us can receive one — submitted, mid-build, or back for a second look after revisions; a business
 * still in onboarding, or already sent a preview, matches no row and throws. This is the only staff-side transition,
 * mirroring submitProject's "condition is the gate" shape: nothing here needs a separate read-then-write, so two
 * staff sending a preview for the same business at once cannot both succeed.
 */
export async function recordProjectPreviewSent(db: Runner, input: ProjectPreviewSent): Promise<Project> {
  const rows = await db
    .update(projects)
    .set({ status: "preview", previewUrl: input.previewUrl, previewSentAt: input.now })
    .where(and(eq(projects.businessId, input.businessId), inArray(projects.status, [...PROJECT_STATUSES_PREVIEWABLE])))
    .returning(PROJECT_COLUMNS);
  const project = rows[0];
  if (project === undefined) throw new ProjectNotReadyForPreviewError(input.businessId);
  return project;
}

export interface ProjectPreviewResponse {
  readonly businessId: string;
  readonly now: Date;
}

/**
 * Approving a preview, moving the business's project to `approved`. Only a project actually awaiting a response
 * (status `preview`) can be approved — the condition is the gate, the same shape as recordProjectPreviewSent.
 *
 * Staff-privileged on purpose, not a customer-role `ScopedTransaction`: `projects_guard_customer_transition`
 * (migration 0014) locks `bb_app` to the single onboarding -> submitted transition at the database level, so
 * every later transition, including this one, has to run as `bb_staff` even though a customer triggers it.
 * The caller (the customer's own server action) is what proves the request is really theirs — via
 * `requireCustomerAccess()`, before ever reaching this function — the same shape as every other staff-privileged
 * write in this codebase that a customer action sets off (e.g. activateFirstPayment).
 */
export async function approveProjectPreview(db: Runner, input: ProjectPreviewResponse): Promise<Project> {
  const rows = await db
    .update(projects)
    .set({ status: "approved" })
    .where(and(eq(projects.businessId, input.businessId), eq(projects.status, "preview")))
    .returning(PROJECT_COLUMNS);
  const project = rows[0];
  if (project === undefined) throw new ProjectNotAwaitingResponseError(input.businessId);
  return project;
}

/**
 * Asking for changes, moving the business's project back to `revisions` and counting the round in
 * `revisionRoundsGranted`, tracked against `revisionRoundsIncluded` for whoever later needs to know how many rounds
 * a business has used. This is a plain status move: the customer's written feedback is saved as a support ticket first
 * (sendPreviewFeedbackAction in the dashboard), not here. Staff-privileged for the same reason as
 * approveProjectPreview; see its doc comment.
 */
export async function requestProjectRevisions(db: Runner, input: ProjectPreviewResponse): Promise<Project> {
  const rows = await db
    .update(projects)
    .set({ status: "revisions", revisionRoundsGranted: sql`${projects.revisionRoundsGranted} + 1` })
    .where(and(eq(projects.businessId, input.businessId), eq(projects.status, "preview")))
    .returning(PROJECT_COLUMNS);
  const project = rows[0];
  if (project === undefined) throw new ProjectNotAwaitingResponseError(input.businessId);
  return project;
}

export interface ProjectLaunch {
  readonly businessId: string;
  readonly now: Date;
}

/**
 * Marks a business's project live: status -> `live`, `launchedAt` stamped, and its current primary domain (if it
 * has one) marked `active`, all in one transaction. Only a project actually `approved` can be launched — the same
 * "condition is the gate" shape as every other staff transition in this file. This call trusts the caller that the
 * real site is actually deployed and DNS is pointed at it; it does not check that itself (there is nothing in this
 * codebase that could). Staff-privileged for the same reason as approveProjectPreview; see its doc comment.
 */
export async function markProjectLive(db: Runner, input: ProjectLaunch): Promise<Project> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(projects)
      .set({ status: "live", launchedAt: input.now })
      .where(and(eq(projects.businessId, input.businessId), eq(projects.status, "approved")))
      .returning(PROJECT_COLUMNS);
    const project = rows[0];
    if (project === undefined) throw new ProjectNotApprovedError(input.businessId);

    await tx
      .update(domains)
      .set({ status: "active" })
      .where(and(eq(domains.businessId, input.businessId), eq(domains.isPrimary, true), isNull(domains.removedAt)));

    return project;
  });
}
