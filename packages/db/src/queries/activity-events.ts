import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { activityEvents, type ActivityEvent, type ActivityService } from "../schema";

type Runner = Database | ScopedTransaction;

/** Adds a dated line for a customer. Staff connection. `staffId` is null for a line the system wrote (a scheduled job). */
export async function addActivityEvent(
  db: Runner,
  input: { readonly businessId: string; readonly service: ActivityService | null; readonly title: string; readonly occurredAt: Date; readonly staffId: string | null },
): Promise<void> {
  await db.insert(activityEvents).values({
    businessId: input.businessId,
    service: input.service,
    title: input.title,
    occurredAt: input.occurredAt,
    createdByStaffId: input.staffId,
  });
}

/** Removes a line that was added by mistake. True when one was removed. Staff connection. */
export async function removeActivityEvent(db: Runner, input: { readonly id: string; readonly businessId: string }): Promise<boolean> {
  const rows = await db
    .delete(activityEvents)
    .where(and(eq(activityEvents.id, input.id), eq(activityEvents.businessId, input.businessId)))
    .returning({ id: activityEvents.id });
  return rows.length > 0;
}

/** The newest lines first. Read through row-level security as the customer, or with the staff connection. */
export async function listActivityEvents(db: Runner, businessId: string, limit: number): Promise<ActivityEvent[]> {
  return db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.businessId, businessId))
    .orderBy(desc(activityEvents.occurredAt), desc(activityEvents.id))
    .limit(limit);
}
