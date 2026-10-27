import { and, asc, desc, eq, gte, lt, lte, ne, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { serviceOfKind, type DeliverableKind, type DeliverableStatus } from "../deliverable-states";
import { deliverables, monthlyReports, siteEvents, type Deliverable, type MonthlyReport, type SiteEventKind } from "../schema/deliverables";
import type { SetupService } from "../schema/client-activity";
import type { ScopedTransaction } from "../scope";

type Runner = Database | ScopedTransaction;

/** What went wrong with a deliverable, in a code the pages and actions can answer in plain words. */
export type DeliverableErrorCode = "not_found" | "bad_request" | "wrong_state";

export class DeliverableError extends Error {
  constructor(
    readonly code: DeliverableErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DeliverableError";
  }
}

/** The SQLSTATE of a database error, looking under the wrapper drizzle puts around the driver's error. */
function sqlStateOf(error: unknown, depth = 0): string | undefined {
  if (typeof error !== "object" || error === null || depth >= 4) return undefined;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : sqlStateOf(cause, depth + 1);
}

/** The guard trigger and the table's checks refuse with 23514; a missing row or right is 42501 from the function. */
function refused(error: unknown): boolean {
  return sqlStateOf(error) === "23514";
}

// Customer side: run inside withTenantScope. Row-level security limits every read to the business.

/**
 * One service's deliverables for a window. A post waiting for the customer's OK is listed whatever its date;
 * everything else only when `due_on` falls in [from, to] (YYYY-MM-DD).
 */
export async function listDeliverablesForBusiness(
  db: Runner,
  businessId: string,
  input: { readonly service: SetupService; readonly from: string; readonly to: string },
): Promise<Deliverable[]> {
  return db
    .select()
    .from(deliverables)
    .where(
      and(
        eq(deliverables.businessId, businessId),
        eq(deliverables.service, input.service),
        or(eq(deliverables.status, "awaiting_approval"), and(gte(deliverables.dueOn, input.from), lte(deliverables.dueOn, input.to))),
      ),
    )
    .orderBy(asc(deliverables.dueOn), asc(deliverables.createdAt), asc(deliverables.id));
}

/** Posts waiting for the customer's OK, the earliest day first. */
export async function listWaitingPosts(db: Runner, businessId: string): Promise<Deliverable[]> {
  return db
    .select()
    .from(deliverables)
    .where(and(eq(deliverables.businessId, businessId), eq(deliverables.kind, "post"), eq(deliverables.status, "awaiting_approval")))
    .orderBy(asc(deliverables.dueOn), asc(deliverables.createdAt), asc(deliverables.id));
}

export async function findDeliverableForBusiness(db: Runner, businessId: string, id: string): Promise<Deliverable | null> {
  const [row] = await db
    .select()
    .from(deliverables)
    .where(and(eq(deliverables.businessId, businessId), eq(deliverables.id, id)))
    .limit(1);
  return row ?? null;
}

/** The report of the newest month for a service. */
export async function latestMonthlyReport(db: Runner, businessId: string, service: SetupService): Promise<MonthlyReport | null> {
  const [row] = await db
    .select()
    .from(monthlyReports)
    .where(and(eq(monthlyReports.businessId, businessId), eq(monthlyReports.service, service)))
    .orderBy(desc(monthlyReports.month))
    .limit(1);
  return row ?? null;
}

/**
 * The customer's one write: approves those of `ids` that are posts of the signed-in business awaiting approval, and
 * returns how many it approved. The business and the person come from the scope, never from the caller.
 */
export async function approveDeliverables(db: ScopedTransaction, ids: readonly string[]): Promise<number> {
  const list = ids.length === 0 ? sql`'{}'::uuid[]` : sql`ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}]::uuid[]`;
  try {
    const result = await db.execute<{ approved: number }>(sql`select approve_deliverables(${list}) as approved`);
    return Number(result.rows[0]?.approved ?? 0);
  } catch (error) {
    const state = sqlStateOf(error);
    if (state === "42501") throw new DeliverableError("not_found", "Those posts could not be found for this business.");
    if (state === "23514") throw new DeliverableError("bad_request", "Approve between 1 and 50 posts at a time.");
    throw error;
  }
}

/** Calls, WhatsApp taps and forms from the customer's website in [from, to). */
export async function countSiteEvents(
  db: Runner,
  businessId: string,
  window: { readonly from: Date; readonly to: Date },
): Promise<{ call: number; whatsapp: number; form: number }> {
  const rows = await db
    .select({ kind: siteEvents.kind, n: sql<number>`count(*)::int` })
    .from(siteEvents)
    .where(and(eq(siteEvents.businessId, businessId), gte(siteEvents.occurredAt, window.from), lt(siteEvents.occurredAt, window.to)))
    .groupBy(siteEvents.kind);
  const counts = { call: 0, whatsapp: 0, form: 0 };
  for (const row of rows) counts[row.kind] = row.n;
  return counts;
}

// Staff side: the staff connection.

export interface StoredPicture {
  readonly id: string;
  readonly key: string;
  readonly mimeType: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
}

export interface NewDeliverable {
  readonly businessId: string;
  readonly kind: DeliverableKind;
  readonly title: string;
  readonly caption: string | null;
  readonly dueOn: string | null;
  readonly status?: "planned" | "awaiting_approval";
  readonly staffId: string;
  readonly picture?: StoredPicture | null;
}

const pictureColumns = (picture: StoredPicture | null) => ({
  imageKey: picture?.key ?? null,
  imageMime: picture?.mimeType ?? null,
  imageBytes: picture?.bytes ?? null,
  imageWidth: picture?.width ?? null,
  imageHeight: picture?.height ?? null,
  imageSha256: picture?.sha256 ?? null,
});

/** Adds a deliverable. The service follows from the kind; the database nulls any approval the insert tries to carry. */
export async function insertDeliverable(db: Database, input: NewDeliverable & { readonly id: string }): Promise<Deliverable> {
  const [row] = await db
    .insert(deliverables)
    .values({
      id: input.id,
      businessId: input.businessId,
      service: serviceOfKind(input.kind),
      kind: input.kind,
      title: input.title,
      caption: input.caption,
      dueOn: input.dueOn,
      status: input.status ?? "planned",
      createdByStaffId: input.staffId,
      ...pictureColumns(input.picture ?? null),
    })
    .returning();
  if (row === undefined) throw new Error("The deliverable was not saved.");
  return row;
}

/**
 * Changes the words, the day, the link and (when `picture` is given) the picture of a deliverable. `picture`
 * undefined leaves it, null removes it, an object replaces it. `replacedKey` is the file the caller must now delete:
 * the old key when the picture was removed or moved to another key, and null otherwise (a replacement is stored under
 * the same key, so deleting it would delete the new file). An approved post's words cannot change in place: that is
 * `DeliverableError("wrong_state")`.
 */
export async function updateDeliverableFields(
  db: Database,
  input: {
    readonly id: string;
    readonly businessId: string;
    readonly title: string;
    readonly caption: string | null;
    readonly dueOn: string | null;
    readonly linkUrl: string | null;
    readonly picture?: StoredPicture | null | undefined;
    readonly now: Date;
  },
): Promise<{ row: Deliverable; replacedKey: string | null } | null> {
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ imageKey: deliverables.imageKey })
        .from(deliverables)
        .where(and(eq(deliverables.id, input.id), eq(deliverables.businessId, input.businessId)))
        .for("update");
      if (before === undefined) return null;
      const [row] = await tx
        .update(deliverables)
        .set({
          title: input.title,
          caption: input.caption,
          dueOn: input.dueOn,
          linkUrl: input.linkUrl,
          updatedAt: input.now,
          ...(input.picture === undefined ? {} : pictureColumns(input.picture)),
        })
        .where(and(eq(deliverables.id, input.id), eq(deliverables.businessId, input.businessId)))
        .returning();
      if (row === undefined) return null;
      const replacedKey = input.picture !== undefined && before.imageKey !== null && before.imageKey !== (input.picture?.key ?? null) ? before.imageKey : null;
      return { row, replacedKey };
    });
  } catch (error) {
    if (refused(error)) throw new DeliverableError("wrong_state", "That change is not allowed in this state.");
    throw error;
  }
}

/** Moves a deliverable along its arrows. `published_at` is set on publishing. Never to `approved`: only the customer does that. */
export async function moveDeliverable(
  db: Database,
  input: { readonly id: string; readonly businessId: string; readonly to: DeliverableStatus; readonly linkUrl?: string | null; readonly now: Date },
): Promise<Deliverable> {
  try {
    const [row] = await db
      .update(deliverables)
      .set({
        status: input.to,
        updatedAt: input.now,
        ...(input.to === "published" ? { publishedAt: input.now } : {}),
        ...(input.linkUrl === undefined ? {} : { linkUrl: input.linkUrl }),
      })
      .where(and(eq(deliverables.id, input.id), eq(deliverables.businessId, input.businessId)))
      .returning();
    if (row === undefined) throw new DeliverableError("not_found", "That deliverable could not be found.");
    return row;
  } catch (error) {
    if (refused(error)) throw new DeliverableError("wrong_state", `That cannot move to ${input.to} from where it is.`);
    throw error;
  }
}

/** Deletes a deliverable that is still planned and returns its picture key (for the caller to delete); null when there was none to delete. */
export async function deleteDeliverable(db: Database, input: { readonly id: string; readonly businessId: string }): Promise<{ imageKey: string | null } | null> {
  const [row] = await db
    .delete(deliverables)
    .where(and(eq(deliverables.id, input.id), eq(deliverables.businessId, input.businessId), eq(deliverables.status, "planned")))
    .returning({ imageKey: deliverables.imageKey });
  return row ?? null;
}

/** One deliverable of any business, by id. The console serves a post's picture from it. */
export async function findDeliverableForStaff(db: Database, id: string): Promise<Deliverable | null> {
  const [row] = await db.select().from(deliverables).where(eq(deliverables.id, id)).limit(1);
  return row ?? null;
}

/** Every service's deliverables for the console: whatever is not published yet, and what is dated `from` or later. Newest first, at most 100. */
export async function listDeliverablesForStaff(db: Database, businessId: string, input: { readonly from: string }): Promise<Deliverable[]> {
  return db
    .select()
    .from(deliverables)
    .where(and(eq(deliverables.businessId, businessId), or(ne(deliverables.status, "published"), gte(deliverables.dueOn, input.from))))
    .orderBy(desc(deliverables.createdAt), desc(deliverables.id))
    .limit(100);
}

/** Sets the report link for a service and month; a second call for the same month replaces the first. */
export async function upsertMonthlyReport(
  db: Database,
  input: { readonly businessId: string; readonly service: SetupService; readonly month: string; readonly url: string; readonly staffId: string; readonly now: Date },
): Promise<void> {
  await db
    .insert(monthlyReports)
    .values({ businessId: input.businessId, service: input.service, month: input.month, url: input.url, updatedByStaffId: input.staffId, createdAt: input.now, updatedAt: input.now })
    .onConflictDoUpdate({
      target: [monthlyReports.businessId, monthlyReports.service, monthlyReports.month],
      set: { url: input.url, updatedByStaffId: input.staffId, updatedAt: input.now },
    });
}

export async function removeMonthlyReport(db: Database, input: { readonly businessId: string; readonly service: SetupService; readonly month: string }): Promise<boolean> {
  const rows = await db
    .delete(monthlyReports)
    .where(and(eq(monthlyReports.businessId, input.businessId), eq(monthlyReports.service, input.service), eq(monthlyReports.month, input.month)))
    .returning({ id: monthlyReports.id });
  return rows.length > 0;
}

export async function listMonthlyReportsForStaff(db: Database, businessId: string, limit: number): Promise<MonthlyReport[]> {
  return db
    .select()
    .from(monthlyReports)
    .where(eq(monthlyReports.businessId, businessId))
    .orderBy(desc(monthlyReports.month), asc(monthlyReports.service))
    .limit(limit);
}

/** Records one call tap, WhatsApp tap or form. A kind and a time, nothing about the visitor. */
export async function recordSiteEvent(db: Database, input: { readonly businessId: string; readonly kind: SiteEventKind; readonly at: Date }): Promise<void> {
  await db.insert(siteEvents).values({ businessId: input.businessId, kind: input.kind, occurredAt: input.at });
}
