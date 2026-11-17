import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { pushSubscriptions, type NotificationAudience, type PushSubscriptionRow } from "../schema/notifications";
import type { ScopedTransaction } from "../scope";

/** The longest user agent the table accepts (push_subscriptions_user_agent_check). */
export const PUSH_USER_AGENT_MAX = 300;

export interface PushSubscriptionInput {
  readonly audience: NotificationAudience;
  readonly userId: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly userAgent?: string | null;
}

/**
 * Stores a browser's subscription for a person, on the staff connection: an endpoint is unique across everyone, so a browser
 * that another person signed in on earlier holds a row the customer connection cannot see. The caller passes the signed-in
 * user's id from the session, never one a form carried. Re-subscribing the same browser updates the row and clears
 * `revoked_at`; a browser handed to someone else moves to them.
 */
export async function savePushSubscription(db: Database, input: PushSubscriptionInput): Promise<void> {
  const userAgent = input.userAgent === undefined || input.userAgent === null ? null : input.userAgent.slice(0, PUSH_USER_AGENT_MAX);
  await db
    .insert(pushSubscriptions)
    .values({ audience: input.audience, userId: input.userId, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, userAgent })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { audience: input.audience, userId: input.userId, p256dh: input.p256dh, auth: input.auth, userAgent, revokedAt: null, lastSuccessAt: null },
    });
}

/** Turns a browser's push off for the signed-in person. Inside withUserScope (customer) or on the staff connection. True when a live row was revoked. */
export async function revokePushSubscription(tx: ScopedTransaction | Database, userId: string, endpoint: string, at: Date = new Date()): Promise<boolean> {
  const rows = await tx
    .update(pushSubscriptions)
    .set({ revokedAt: at })
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint), isNull(pushSubscriptions.revokedAt)))
    .returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}

/** Live subscriptions to send to: one customer's, or (userId null) every staff browser. Staff connection. */
export async function listLivePushSubscriptions(db: Database, audience: NotificationAudience, userId: string | null): Promise<PushSubscriptionRow[]> {
  const where =
    audience === "staff" || userId === null
      ? and(eq(pushSubscriptions.audience, audience), isNull(pushSubscriptions.revokedAt))
      : and(eq(pushSubscriptions.audience, audience), eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.revokedAt));
  return db.select().from(pushSubscriptions).where(where);
}

export async function markPushDelivered(db: Database, id: string, at: Date = new Date()): Promise<void> {
  await db.update(pushSubscriptions).set({ lastSuccessAt: at }).where(eq(pushSubscriptions.id, id));
}

/** The push service said the subscription is gone (404 or 410). */
export async function revokePushSubscriptionById(db: Database, id: string, at: Date = new Date()): Promise<void> {
  await db.update(pushSubscriptions).set({ revokedAt: at }).where(eq(pushSubscriptions.id, id));
}
