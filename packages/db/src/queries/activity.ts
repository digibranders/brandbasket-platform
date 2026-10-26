import { desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { activityEvents, type ActivityActorKind } from "../schema";
import { isUuid } from "./tenant";

type Runner = Database | ScopedTransaction;

export interface ActivityInput {
  readonly businessId: string | null;
  readonly actorKind: ActivityActorKind;
  readonly actorId: string | null;
  readonly kind: string;
  readonly summary: string;
  readonly data?: Record<string, unknown>;
  readonly visibleToClient?: boolean;
}

export interface ActivityRow extends Required<Omit<ActivityInput, "data" | "visibleToClient">> {
  readonly id: string;
  readonly data: Record<string, unknown>;
  readonly visibleToClient: boolean;
  readonly createdAt: Date;
}

const ROW_COLUMNS = {
  id: activityEvents.id,
  businessId: activityEvents.businessId,
  actorKind: activityEvents.actorKind,
  actorId: activityEvents.actorId,
  kind: activityEvents.kind,
  summary: activityEvents.summary,
  data: activityEvents.data,
  visibleToClient: activityEvents.visibleToClient,
  createdAt: activityEvents.createdAt,
} as const;

/** Writes one line of a business's history (or a system-wide one, with no business). */
export async function recordActivity(db: Runner, input: ActivityInput): Promise<void> {
  await db.insert(activityEvents).values({
    businessId: input.businessId,
    actorKind: input.actorKind,
    actorId: input.actorId,
    kind: input.kind,
    summary: input.summary,
    data: input.data ?? {},
    visibleToClient: input.visibleToClient ?? false,
  });
}

/** A business's history, newest first. An id that is not a business id has none. */
export async function listActivityForBusiness(db: Runner, businessId: string, limit: number): Promise<readonly ActivityRow[]> {
  if (!isUuid(businessId)) return [];
  return db
    .select(ROW_COLUMNS)
    .from(activityEvents)
    .where(eq(activityEvents.businessId, businessId))
    .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
    .limit(limit);
}

/** Everything recorded lately, across every business, newest first. Staff connection only. */
export async function listRecentActivity(db: Runner, limit: number): Promise<readonly ActivityRow[]> {
  return db.select(ROW_COLUMNS).from(activityEvents).orderBy(desc(activityEvents.createdAt), desc(activityEvents.id)).limit(limit);
}
