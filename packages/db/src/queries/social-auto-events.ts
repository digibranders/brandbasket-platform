import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { businesses, socialAutoCursor, webhookEvents, type WebhookResult, type WebhookSource } from "../schema";

type Runner = Database | ScopedTransaction;

/** social-auto's webhook deliveries and catch up reads are kept in webhook_events, which the console's Deliveries page lists. */
const SOURCE: WebhookSource = "social_auto";
const CURSOR = "events";

export interface SocialAutoEventInput {
  /** Null for a delivery that was refused before its body was read. */
  readonly eventId: string | null;
  readonly eventType: string;
  readonly result: WebhookResult;
  readonly businessId: string | null;
  readonly error?: string | null;
  readonly bodySha256: string;
  readonly bodyBytes: number;
}

/** Whether this social-auto event id was already taken (handled or ignored). */
export async function hasTakenSocialAutoEvent(db: Runner, eventId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.source, SOURCE), eq(webhookEvents.eventId, eventId), inArray(webhookEvents.result, ["handled", "ignored"])))
    .limit(1);
  return row !== undefined;
}

/** Stores one event. The unique index makes a second handled or ignored row for the same id fail: the caller treats that as a repeat. */
export async function recordSocialAutoEvent(db: Runner, input: SocialAutoEventInput): Promise<void> {
  await db.insert(webhookEvents).values({ source: SOURCE, ...input, error: input.error ?? null });
}

/** The id back when a business with it exists, else null: an event for a workspace that is not ours is ignored. */
export async function findExistingBusinessId(db: Runner, businessId: string): Promise<string | null> {
  const [row] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  return row?.id ?? null;
}

/** The highest event seq the catch up has read; 0 before its first run. */
export async function readSocialAutoCursor(db: Runner): Promise<number> {
  const [row] = await db.select({ seq: socialAutoCursor.seq }).from(socialAutoCursor).where(eq(socialAutoCursor.name, CURSOR)).limit(1);
  return row?.seq ?? 0;
}

/** Remembers how far the catch up has read. Never moves back, so two overlapping runs cannot undo each other. */
export async function saveSocialAutoCursor(db: Runner, seq: number): Promise<void> {
  await db
    .insert(socialAutoCursor)
    .values({ name: CURSOR, seq })
    .onConflictDoUpdate({ target: socialAutoCursor.name, set: { seq: sql`greatest(${socialAutoCursor.seq}, excluded.seq)`, updatedAt: sql`now()` } });
}
