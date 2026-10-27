import { desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { businessActivity, type ActivityActorKind } from "../schema";
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
  id: businessActivity.id,
  businessId: businessActivity.businessId,
  actorKind: businessActivity.actorKind,
  actorId: businessActivity.actorId,
  kind: businessActivity.kind,
  summary: businessActivity.summary,
  data: businessActivity.data,
  visibleToClient: businessActivity.visibleToClient,
  createdAt: businessActivity.createdAt,
} as const;

/** Writes one line of a business's history (or a system-wide one, with no business). */
export async function recordActivity(db: Runner, input: ActivityInput): Promise<void> {
  await db.insert(businessActivity).values({
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
    .from(businessActivity)
    .where(eq(businessActivity.businessId, businessId))
    .orderBy(desc(businessActivity.createdAt), desc(businessActivity.id))
    .limit(limit);
}

/** Everything recorded lately, across every business, newest first. Staff connection only. */
export async function listRecentActivity(db: Runner, limit: number): Promise<readonly ActivityRow[]> {
  return db.select(ROW_COLUMNS).from(businessActivity).orderBy(desc(businessActivity.createdAt), desc(businessActivity.id)).limit(limit);
}
