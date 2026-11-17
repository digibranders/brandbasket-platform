import { listLivePushSubscriptions, markPushDelivered, revokePushSubscriptionById, type Database, type NotificationAudience, type PushSubscriptionRow } from "@brandbasket/db";
import webpush from "web-push";
import type { PushMessage, PushSender, PushTarget } from "./push-sender";

/*
 * The real push sender: web push to every live browser a person (or the staff) has subscribed. The subscription row is the
 * opt-in, and notify() has already checked the person's Push choice for the event, so nothing is re-read here. Quiet hours hold
 * a customer's push back: it is dropped, not deferred, because the bell and the email carry the same event.
 */

export interface Vapid {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly subject: string;
}

/** The VAPID keys from the environment, or null unless all three are set (the fake sender stays). */
export function vapidFromEnv(env: Readonly<Record<string, string | undefined>>): Vapid | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

const INDIA_OFFSET_MINUTES = 330;
const QUIET_FROM_MINUTE = 21 * 60;
const QUIET_UNTIL_MINUTE = 8 * 60;

/** 21:00 up to 08:00 India time. */
export function inQuietHours(now: Date): boolean {
  const minute = (((now.getUTCHours() * 60 + now.getUTCMinutes() + INDIA_OFFSET_MINUTES) % 1440) + 1440) % 1440;
  return minute >= QUIET_FROM_MINUTE || minute < QUIET_UNTIL_MINUTE;
}

/** The one customer event that is sent at any hour. */
const SENT_IN_QUIET_HOURS = "billing.payment_failed";

/** An hour is long enough for a phone that is off or out of range; after that the notice is stale and the bell has it. */
const TTL_SECONDS = 60 * 60;

export interface PushStore {
  readonly live: (audience: NotificationAudience, userId: string | null) => Promise<readonly PushSubscriptionRow[]>;
  readonly delivered: (id: string) => Promise<void>;
  readonly gone: (id: string) => Promise<void>;
}

export interface PushTransport {
  /** Throws an error with a `statusCode` when the push service refuses. */
  readonly send: (subscription: { readonly endpoint: string; readonly keys: { readonly p256dh: string; readonly auth: string } }, payload: string) => Promise<void>;
}

export function createDbPushStore(db: Database): PushStore {
  return {
    live: (audience, userId) => listLivePushSubscriptions(db, audience, userId),
    delivered: (id) => markPushDelivered(db, id),
    gone: (id) => revokePushSubscriptionById(db, id),
  };
}

export function createWebPushTransport(vapid: Vapid): PushTransport {
  const details = { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey };
  return {
    send: async (subscription, payload) => {
      await webpush.sendNotification(subscription, payload, { vapidDetails: details, TTL: TTL_SECONDS });
    },
  };
}

function statusOf(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number") return error.statusCode;
  return null;
}

export function createWebPushSender(deps: { readonly store: PushStore; readonly transport: PushTransport; readonly now?: () => Date }): PushSender {
  const now = deps.now ?? (() => new Date());
  return {
    send: async (target: PushTarget, message: PushMessage): Promise<void> => {
      if (target.audience === "customer" && message.event !== SENT_IN_QUIET_HOURS && inQuietHours(now())) return;
      const subscriptions = await deps.store.live(target.audience, target.userId);
      if (subscriptions.length === 0) return;
      // `tag` is read by the service worker: a repeat with the same tag replaces the one on screen.
      const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url, tag: message.tag });
      let failures = 0;
      let firstFailure: unknown;
      for (const subscription of subscriptions) {
        try {
          await deps.transport.send({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload);
          await deps.store.delivered(subscription.id);
        } catch (error) {
          const status = statusOf(error);
          if (status === 404 || status === 410) {
            await deps.store.gone(subscription.id);
          } else {
            failures += 1;
            firstFailure ??= error;
          }
        }
      }
      if (failures > 0) throw new Error(`Push failed for ${failures} of ${subscriptions.length} subscriptions.`, { cause: firstFailure });
    },
  };
}
