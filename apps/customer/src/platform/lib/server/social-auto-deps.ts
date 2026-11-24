import "server-only";
import { findExistingBusinessId, hasTakenSocialAutoEvent, recordSocialAutoEvent, type WebhookResult } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { notifyEvent } from "@brandbasket/shared/server/notify-event";
import { bodyFingerprint, webhookEventName } from "@/platform/lib/webhook-event";
import { getStaffDb } from "./db";
import type { SocialAutoDeps } from "./social-auto-webhook";

/** The real dependencies: this app's staff connection (the one every webhook handler uses) and notify(). */
export function socialAutoDeps(): SocialAutoDeps {
  const db = getStaffDb();
  return {
    secret: process.env.SOCIAL_AUTO_WEBHOOK_SECRET?.trim() || null,
    taken: (eventId) => hasTakenSocialAutoEvent(db, eventId),
    resolveBusiness: (externalId) => findExistingBusinessId(db, externalId.split(":")[0] ?? ""),
    notify: (input) => notifyEvent(db, input),
    record: (input) => recordSocialAutoEvent(db, input),
  };
}

/** Notes a delivery that came to nothing (refused or failed) for the Deliveries record. Never throws. */
export async function noteSocialAutoFailure(body: string, result: Extract<WebhookResult, "failed" | "bad_signature">, error: string | null): Promise<void> {
  try {
    await recordSocialAutoEvent(getStaffDb(), { eventId: null, eventType: webhookEventName(body, "type"), result, error, businessId: null, ...bodyFingerprint(body) });
  } catch (cause) {
    console.error("[social-auto-webhook] a delivery could not be noted", errorLogInfo(cause));
  }
}
