import { and, desc, eq, sql } from "drizzle-orm";
import { projectPreviewVersions } from "../schema";
import { hasPostgresCode, UNIQUE_VIOLATION } from "./tenant";
import type { Runner } from "./projects";

/** One preview send staff made: the link sent, when, and by whom (null for a send that was not made through the console). */
interface PreviewSend {
  readonly projectId: string;
  readonly businessId: string;
  readonly previewUrl: string;
  readonly sentAt: Date;
  readonly staffId: string | null;
}

/**
 * Records one preview send as the project's next version and returns its number. The number is read and written in one
 * INSERT, so a send cannot take a number another send already holds. Two sends racing for the same number meet the unique
 * index; the loser retries once and reads the new maximum. A retry needs its own transaction (a failed statement aborts the
 * transaction it is in), so call this on the plain connection, not inside a transaction.
 */
export async function recordPreviewVersion(
  db: Runner,
  input: PreviewSend,
): Promise<number> {
  try {
    return await insertNextVersion(db, input);
  } catch (error) {
    if (!hasPostgresCode(error, UNIQUE_VIOLATION)) throw error;
    return insertNextVersion(db, input);
  }
}

async function insertNextVersion(
  db: Runner,
  input: PreviewSend,
): Promise<number> {
  const [row] = await db
    .insert(projectPreviewVersions)
    .values({
      projectId: input.projectId,
      businessId: input.businessId,
      version: sql`(select coalesce(max(${projectPreviewVersions.version}), 0) + 1 from ${projectPreviewVersions} where ${projectPreviewVersions.projectId} = ${input.projectId})`,
      previewUrl: input.previewUrl,
      sentAt: input.sentAt,
      sentByStaffId: input.staffId,
    })
    .returning({ version: projectPreviewVersions.version });
  if (row === undefined) throw new Error(`Preview version for project ${input.projectId} was not inserted`);
  return row.version;
}

/** Every preview sent on one project, newest first. Scoped by the business as well as the project, so a wrong business finds nothing. */
export async function listPreviewVersions(
  db: Runner,
  input: { readonly projectId: string; readonly businessId: string },
): Promise<
  readonly {
    readonly version: number;
    readonly previewUrl: string;
    readonly sentAt: Date;
    readonly sentByStaffId: string | null;
  }[]
> {
  return db
    .select({
      version: projectPreviewVersions.version,
      previewUrl: projectPreviewVersions.previewUrl,
      sentAt: projectPreviewVersions.sentAt,
      sentByStaffId: projectPreviewVersions.sentByStaffId,
    })
    .from(projectPreviewVersions)
    .where(and(eq(projectPreviewVersions.projectId, input.projectId), eq(projectPreviewVersions.businessId, input.businessId)))
    .orderBy(desc(projectPreviewVersions.version));
}
