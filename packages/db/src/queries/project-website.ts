import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { projectEvents, projectPreviewImages, projects, type ProjectStatus } from "../schema";
import { PROJECT_COLUMNS, type Project, type Runner } from "./projects";

export class ProjectCannotStartBuildingError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no submitted project to start building.`);
    this.name = "ProjectCannotStartBuildingError";
  }
}

export class ProjectCannotBePausedError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no project that can be paused.`);
    this.name = "ProjectCannotBePausedError";
  }
}

export class ProjectNotPausedError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no paused project to resume.`);
    this.name = "ProjectNotPausedError";
  }
}

export class PauseReasonInvalidError extends Error {
  constructor() {
    super("The reason for a pause must be 3 to 200 characters.");
    this.name = "PauseReasonInvalidError";
  }
}

/** Statuses a project can be paused from: it has been sent to us, and is not yet approved. */
export const PROJECT_STATUSES_PAUSABLE: readonly ProjectStatus[] = ["submitted", "building", "revisions", "preview"];

const PAUSE_REASON_MIN = 3;
const PAUSE_REASON_MAX = 200;

/** submitted to building. Staff start the work. */
export async function setProjectBuilding(db: Runner, input: { readonly businessId: string }): Promise<Project> {
  const rows = await db
    .update(projects)
    .set({ status: "building" })
    .where(and(eq(projects.businessId, input.businessId), eq(projects.status, "submitted")))
    .returning(PROJECT_COLUMNS);
  const project = rows[0];
  if (project === undefined) throw new ProjectCannotStartBuildingError(input.businessId);
  return project;
}

/**
 * A pausable status to on_hold with the reason the customer will read. Trims the reason and throws before touching the
 * database when it is not 3 to 200 characters.
 */
export async function setProjectOnHold(db: Runner, input: { readonly businessId: string; readonly reason: string }): Promise<Project> {
  const reason = input.reason.trim();
  if (reason.length < PAUSE_REASON_MIN || reason.length > PAUSE_REASON_MAX) throw new PauseReasonInvalidError();
  const rows = await db
    .update(projects)
    .set({ status: "on_hold", onHoldReason: reason })
    .where(and(eq(projects.businessId, input.businessId), inArray(projects.status, [...PROJECT_STATUSES_PAUSABLE])))
    .returning(PROJECT_COLUMNS);
  const project = rows[0];
  if (project === undefined) throw new ProjectCannotBePausedError(input.businessId);
  return project;
}

/**
 * on_hold back to exactly the status it was paused from (the latest history row that is not on_hold), clearing the
 * reason. With no such row it falls back to building. The paused row is locked for the read of its history, so two
 * resumes cannot both land.
 */
export async function resumeProject(db: Database, input: { readonly businessId: string }): Promise<Project> {
  return db.transaction(async (tx) => {
    const paused = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.businessId, input.businessId), eq(projects.status, "on_hold")))
      .for("update");
    const pausedId = paused[0]?.id;
    if (pausedId === undefined) throw new ProjectNotPausedError(input.businessId);

    const before = await tx
      .select({ status: projectEvents.status })
      .from(projectEvents)
      .where(and(eq(projectEvents.projectId, pausedId), ne(projectEvents.status, "on_hold")))
      .orderBy(desc(projectEvents.occurredAt), desc(projectEvents.id))
      .limit(1);
    const previous = before[0]?.status;
    const target: ProjectStatus = previous === undefined ? "building" : previous;

    const rows = await tx
      .update(projects)
      .set({ status: target, onHoldReason: null })
      .where(and(eq(projects.id, pausedId), eq(projects.status, "on_hold")))
      .returning(PROJECT_COLUMNS);
    const project = rows[0];
    if (project === undefined) throw new ProjectNotPausedError(input.businessId);
    return project;
  });
}

/** The customer's project history, oldest first. Row-level security limits it to the scoped business. */
export async function listProjectEvents(
  tx: ScopedTransaction,
  projectId: string,
): Promise<readonly { readonly status: ProjectStatus; readonly reason: string | null; readonly occurredAt: Date }[]> {
  return tx
    .select({ status: projectEvents.status, reason: projectEvents.reason, occurredAt: projectEvents.occurredAt })
    .from(projectEvents)
    .where(eq(projectEvents.projectId, projectId))
    .orderBy(projectEvents.occurredAt, projectEvents.id);
}

export interface PreviewImageInput {
  readonly projectId: string;
  readonly businessId: string;
  readonly previewUrl: string;
  readonly image: Buffer;
  readonly width: number;
  readonly height: number;
}

/** Replaces the project's picture. Staff connection. The database refuses an image over 1 MB or a size outside its bounds. */
export async function savePreviewImage(db: Runner, input: PreviewImageInput): Promise<void> {
  const picture = {
    previewUrl: input.previewUrl,
    contentType: "image/webp",
    width: input.width,
    height: input.height,
    image: input.image,
    capturedAt: sql`now()`,
  };
  await db
    .insert(projectPreviewImages)
    .values({ projectId: input.projectId, businessId: input.businessId, ...picture })
    .onConflictDoUpdate({ target: projectPreviewImages.projectId, set: picture });
}

/** What the Progress page needs without loading the bytes: the link the picture was taken of and when. Null when there is none. */
export async function findPreviewImageInfo(tx: ScopedTransaction): Promise<{ readonly previewUrl: string; readonly capturedAt: Date } | null> {
  const rows = await tx
    .select({ previewUrl: projectPreviewImages.previewUrl, capturedAt: projectPreviewImages.capturedAt })
    .from(projectPreviewImages)
    .orderBy(desc(projectPreviewImages.capturedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** The bytes, for the image route. Null when there is none. */
export async function findPreviewImage(tx: ScopedTransaction): Promise<{ readonly previewUrl: string; readonly image: Buffer; readonly capturedAt: Date } | null> {
  const rows = await tx
    .select({ previewUrl: projectPreviewImages.previewUrl, image: projectPreviewImages.image, capturedAt: projectPreviewImages.capturedAt })
    .from(projectPreviewImages)
    .orderBy(desc(projectPreviewImages.capturedAt))
    .limit(1);
  return rows[0] ?? null;
}
