import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { businesses, webhookEvents, type WebhookResult, type WebhookSource } from "../schema";

type Runner = Database | ScopedTransaction;

/*
 * social-auto's webhook deliveries, kept in webhook_events (the check constraint already accepts "social_auto"). The column's
 * TypeScript type does not list it yet, because the console's Deliveries page has no label or health line for it; one cast here
 * keeps the rest of the code (and the console's types) untouched until that page learns the source.
 */
const SOURCE = "social_auto" as WebhookSource;

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
