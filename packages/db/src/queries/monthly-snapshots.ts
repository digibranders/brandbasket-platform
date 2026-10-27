import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { monthlySnapshots, type MonthlySnapshot, type SetupService } from "../schema";

type Runner = Database | ScopedTransaction;

/** The figures staff can enter. Null means "not measured": it clears the stored figure. */
export interface SnapshotFigures {
  readonly adSpendCents: number | null;
  readonly adBudgetCents: number | null;
  readonly adEnquiries: number | null;
  readonly postsPublished: number | null;
  readonly postsPlanned: number | null;
  readonly keywordsPageOne: number | null;
  readonly keywordsPageOnePrev: number | null;
}

/** Saves one month's figures for a service, replacing that month's row. `month` is `YYYY-MM-01`. Staff connection. */
export async function upsertMonthlySnapshot(
  db: Runner,
  input: { readonly businessId: string; readonly service: SetupService; readonly month: string; readonly figures: SnapshotFigures; readonly staffId: string; readonly now: Date },
): Promise<void> {
  await db
    .insert(monthlySnapshots)
    .values({ businessId: input.businessId, service: input.service, month: input.month, ...input.figures, updatedByStaffId: input.staffId })
    .onConflictDoUpdate({
      target: [monthlySnapshots.businessId, monthlySnapshots.service, monthlySnapshots.month],
      set: { ...input.figures, updatedByStaffId: input.staffId, updatedAt: input.now },
    });
}

/** The business's rows for a month (up to one per service). `month` is `YYYY-MM-01`. */
export async function listMonthlySnapshots(db: Runner, businessId: string, month: string): Promise<MonthlySnapshot[]> {
  return db
    .select()
    .from(monthlySnapshots)
    .where(and(eq(monthlySnapshots.businessId, businessId), eq(monthlySnapshots.month, month)));
}
