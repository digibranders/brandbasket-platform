import { desc, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { breachRegister, type BreachStatus } from "../schema";

export interface NewBreach {
  readonly recordedBy: string;
  readonly detectedAt: Date;
  readonly summary: string;
  readonly dataCategories: readonly string[];
}

export interface StoredBreach {
  readonly id: string;
  readonly detectedAt: Date;
  readonly reportedCertInAt: Date | null;
  readonly reportedBoardAt: Date | null;
  readonly peopleNotifiedAt: Date | null;
  readonly summary: string;
  readonly dataCategories: readonly string[];
  readonly status: BreachStatus;
  readonly recordedBy: string;
  readonly createdAt: Date;
}

/** Adds a breach to the register, open, with nothing reported yet. Returns its id. */
export async function logBreach(db: Database, input: NewBreach): Promise<string> {
  const rows = await db
    .insert(breachRegister)
    .values({ recordedBy: input.recordedBy, detectedAt: input.detectedAt, summary: input.summary, dataCategories: [...input.dataCategories] })
    .returning({ id: breachRegister.id });
  const row = rows[0];
  if (row === undefined) throw new Error("A breach insert returned no row");
  return row.id;
}

export interface BreachProgress {
  readonly reportedCertInAt?: Date;
  readonly reportedBoardAt?: Date;
  readonly peopleNotifiedAt?: Date;
  readonly status?: BreachStatus;
}

/**
 * Records progress on a breach: a report made, or a new status. A report date already set is kept (the register is the
 * proof of when a report was made, so a later edit must not move it); the status can move either way.
 */
export async function updateBreach(db: Database, id: string, progress: BreachProgress): Promise<void> {
  await db
    .update(breachRegister)
    .set({
      ...(progress.reportedCertInAt === undefined ? {} : { reportedCertInAt: sql`coalesce(${breachRegister.reportedCertInAt}, ${progress.reportedCertInAt})` }),
      ...(progress.reportedBoardAt === undefined ? {} : { reportedBoardAt: sql`coalesce(${breachRegister.reportedBoardAt}, ${progress.reportedBoardAt})` }),
      ...(progress.peopleNotifiedAt === undefined ? {} : { peopleNotifiedAt: sql`coalesce(${breachRegister.peopleNotifiedAt}, ${progress.peopleNotifiedAt})` }),
      ...(progress.status === undefined ? {} : { status: progress.status }),
      updatedAt: new Date(),
    })
    .where(eq(breachRegister.id, id));
}

/** Every breach, the most recently found first. */
export async function listBreaches(db: Database): Promise<readonly StoredBreach[]> {
  const rows = await db.select().from(breachRegister).orderBy(desc(breachRegister.detectedAt));
  return rows.map((row) => ({ ...row, status: row.status as BreachStatus }));
}
