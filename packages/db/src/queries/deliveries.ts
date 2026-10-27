import { and, desc, eq, gte, ilike, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import {
  alertDeliveries,
  businesses,
  emailMessages,
  webhookEvents,
  type AlertDestination,
  type AlertResult,
  type WebhookResult,
  type WebhookSource,
} from "../schema";
import { containsPattern } from "./like";

type Runner = Database | ScopedTransaction;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How long webhook and alert records are kept (docs/operations/retention-schedule.md). */
export const DELIVERY_RETENTION_MS = 90 * DAY_MS;

/** What every delivery list takes: failed rows only or all, a search term or none, and how many rows at most. */
export interface DeliveryListFilter {
  readonly failedOnly: boolean;
  readonly search: string | null;
  readonly limit: number;
}

export interface WebhookEventInput {
  readonly source: WebhookSource;
  readonly eventType: string;
  readonly result: WebhookResult;
  readonly error: string | null;
  readonly businessId: string | null;
  readonly bodySha256: string;
  readonly bodyBytes: number;
}

export interface StoredWebhookEvent extends WebhookEventInput {
  readonly id: string;
  readonly businessName: string | null;
  readonly receivedAt: Date;
}

const WEBHOOK_COLUMNS = {
  id: webhookEvents.id,
  source: webhookEvents.source,
  eventType: webhookEvents.eventType,
  result: webhookEvents.result,
  error: webhookEvents.error,
  businessId: webhookEvents.businessId,
  businessName: businesses.name,
  bodySha256: webhookEvents.bodySha256,
  bodyBytes: webhookEvents.bodyBytes,
  receivedAt: webhookEvents.receivedAt,
} as const;

const WEBHOOK_FAILED = inArray(webhookEvents.result, ["failed", "bad_signature"]);

export async function recordWebhookEvent(db: Runner, input: WebhookEventInput): Promise<void> {
  await db.insert(webhookEvents).values(input);
}

export async function listWebhookEvents(
  db: Runner,
  filter: DeliveryListFilter & { readonly source: WebhookSource | null },
): Promise<StoredWebhookEvent[]> {
  const conditions: SQL[] = [];
  if (filter.failedOnly) conditions.push(WEBHOOK_FAILED);
  if (filter.source !== null) conditions.push(eq(webhookEvents.source, filter.source));
  if (filter.search !== null) {
    const term = containsPattern(filter.search);
    const either = or(ilike(webhookEvents.eventType, term), ilike(businesses.name, term), ...(UUID.test(filter.search) ? [eq(webhookEvents.id, filter.search)] : []));
    if (either !== undefined) conditions.push(either);
  }
  return db
    .select(WEBHOOK_COLUMNS)
    .from(webhookEvents)
    .leftJoin(businesses, eq(businesses.id, webhookEvents.businessId))
    .where(and(...conditions))
    .orderBy(desc(webhookEvents.receivedAt))
    .limit(filter.limit);
}

export async function findWebhookEvent(db: Runner, id: string): Promise<StoredWebhookEvent | null> {
  if (!UUID.test(id)) return null;
  const rows = await db
    .select(WEBHOOK_COLUMNS)
    .from(webhookEvents)
    .leftJoin(businesses, eq(businesses.id, webhookEvents.businessId))
    .where(eq(webhookEvents.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export interface AlertDeliveryInput {
  readonly destination: AlertDestination;
  readonly title: string;
  readonly result: AlertResult;
  /** The Teams message, kept only when the alert did not go through. */
  readonly card: Record<string, unknown> | null;
}

export interface StoredAlertDelivery extends AlertDeliveryInput {
  readonly id: string;
  readonly attempts: number;
  readonly createdAt: Date;
  readonly lastAttemptAt: Date;
}

const ALERT_COLUMNS = {
  id: alertDeliveries.id,
  destination: alertDeliveries.destination,
  title: alertDeliveries.title,
  result: alertDeliveries.result,
  card: alertDeliveries.card,
  attempts: alertDeliveries.attempts,
  createdAt: alertDeliveries.createdAt,
  lastAttemptAt: alertDeliveries.lastAttemptAt,
} as const;

export async function recordAlertDelivery(db: Runner, input: AlertDeliveryInput): Promise<void> {
  await db.insert(alertDeliveries).values(input);
}

export async function listAlertDeliveries(db: Runner, filter: DeliveryListFilter): Promise<StoredAlertDelivery[]> {
  const conditions: SQL[] = [];
  if (filter.failedOnly) conditions.push(ne(alertDeliveries.result, "sent"));
  if (filter.search !== null) {
    const either = or(ilike(alertDeliveries.title, containsPattern(filter.search)), ...(UUID.test(filter.search) ? [eq(alertDeliveries.id, filter.search)] : []));
    if (either !== undefined) conditions.push(either);
  }
  return db.select(ALERT_COLUMNS).from(alertDeliveries).where(and(...conditions)).orderBy(desc(alertDeliveries.createdAt)).limit(filter.limit);
}

export async function findAlertDelivery(db: Runner, id: string): Promise<StoredAlertDelivery | null> {
  if (!UUID.test(id)) return null;
  const rows = await db.select(ALERT_COLUMNS).from(alertDeliveries).where(eq(alertDeliveries.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Records another try at an alert. A send that went through drops the stored card. */
export async function updateAlertDelivery(db: Runner, id: string, attempt: { readonly result: AlertResult; readonly now: Date }): Promise<void> {
  await db
    .update(alertDeliveries)
    .set({
      result: attempt.result,
      attempts: sql`${alertDeliveries.attempts} + 1`,
      lastAttemptAt: attempt.now,
      ...(attempt.result === "sent" ? { card: null } : {}),
    })
    .where(eq(alertDeliveries.id, id));
}

/** One source's deliveries in a window: how many, how many failed, and when the last good and the last failed one were. */
export interface SourceHealth {
  readonly total: number;
  readonly failed: number;
  readonly lastOkAt: Date | null;
  readonly lastFailedAt: Date | null;
}

export type DeliverySource = WebhookSource | "brevo" | "teams";
export type DeliveryHealth = Readonly<Record<DeliverySource, SourceHealth>>;

const QUIET: SourceHealth = { total: 0, failed: 0, lastOkAt: null, lastFailedAt: null };

interface HealthRow {
  readonly total: number;
  readonly failed: number;
  readonly lastOkAt: Date | null;
  readonly lastFailedAt: Date | null;
}

function healthColumns(failed: SQL, at: SQL | typeof webhookEvents.receivedAt): Record<keyof HealthRow, SQL> {
  return {
    total: sql<number>`count(*)::int`,
    failed: sql<number>`(count(*) filter (where ${failed}))::int`,
    lastOkAt: sql<Date | null>`max(${at}) filter (where not (${failed}))`,
    lastFailedAt: sql<Date | null>`max(${at}) filter (where ${failed})`,
  };
}

function asHealth(row: { readonly total: unknown; readonly failed: unknown; readonly lastOkAt: unknown; readonly lastFailedAt: unknown } | undefined): SourceHealth {
  if (row === undefined) return QUIET;
  return {
    total: Number(row.total),
    failed: Number(row.failed),
    lastOkAt: row.lastOkAt instanceof Date ? row.lastOkAt : row.lastOkAt === null ? null : new Date(String(row.lastOkAt)),
    lastFailedAt: row.lastFailedAt instanceof Date ? row.lastFailedAt : row.lastFailedAt === null ? null : new Date(String(row.lastFailedAt)),
  };
}

/** Every source's health since `since`, for the Deliveries figures, Today's systems block and the rail count. */
export async function deliveryHealth(db: Runner, since: Date): Promise<DeliveryHealth> {
  const webhookRows = await db
    .select({ source: webhookEvents.source, ...healthColumns(WEBHOOK_FAILED, webhookEvents.receivedAt) })
    .from(webhookEvents)
    .where(gte(webhookEvents.receivedAt, since))
    .groupBy(webhookEvents.source);
  const [email] = await db
    .select(healthColumns(sql`${emailMessages.status} = 'failed'`, sql`${emailMessages.createdAt}`))
    .from(emailMessages)
    .where(gte(emailMessages.createdAt, since));
  const [teams] = await db
    .select(healthColumns(sql`${alertDeliveries.result} <> 'sent'`, sql`${alertDeliveries.createdAt}`))
    .from(alertDeliveries)
    .where(gte(alertDeliveries.createdAt, since));
  const bySource = (source: WebhookSource): SourceHealth => asHealth(webhookRows.find((row) => row.source === source));
  return {
    razorpay: bySource("razorpay"),
    calcom: bySource("calcom"),
    oyechats: bySource("oyechats"),
    brevo: email === undefined || Number(email.total) === 0 ? QUIET : asHealth(email),
    teams: teams === undefined || Number(teams.total) === 0 ? QUIET : asHealth(teams),
  };
}

/** Deletes webhook and alert records past their retention. Returns how many went. */
export async function purgeOldDeliveries(db: Database, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - DELIVERY_RETENTION_MS);
  const webhooks = await db.delete(webhookEvents).where(lt(webhookEvents.receivedAt, cutoff)).returning({ id: webhookEvents.id });
  const alerts = await db.delete(alertDeliveries).where(lt(alertDeliveries.createdAt, cutoff)).returning({ id: alertDeliveries.id });
  return webhooks.length + alerts.length;
}
