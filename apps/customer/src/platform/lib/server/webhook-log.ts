import "server-only";
import { hasTakenWebhookEvent, recordWebhookEvent, type WebhookResult, type WebhookSource } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { bodyFingerprint, webhookEventName } from "@/platform/lib/webhook-event";
import { getStaffDb } from "./db";

/** Where each provider writes the event's name in its body. */
const EVENT_FIELD: Readonly<Record<WebhookSource, string>> = { razorpay: "event", calcom: "triggerEvent", oyechats: "event", brevo: "event", social_auto: "type" };

export interface WebhookOutcome {
  readonly result: WebhookResult;
  readonly error?: string | null;
  readonly businessId?: string | null;
  /** The id the repeat check used; leave out to use the body's hash (see webhookEventId). */
  readonly eventId?: string | null;
}

/**
 * The id a delivery is deduplicated by: the provider's own event id when it sends one (Razorpay's x-razorpay-event-id),
 * otherwise a hash of the signed body, which a redelivery repeats byte for byte.
 */
export function webhookEventId(body: string, providerId?: string | null): string {
  const id = providerId?.trim() ?? "";
  return id !== "" && id.length <= 200 ? id : `body:${bodyFingerprint(body).bodySha256}`;
}

/**
 * Whether this event id was already handled or ignored, so the caller answers 200 and does nothing. Fails open: if the check
 * cannot be made the delivery is acted on, because every handler is safe to run twice and a lost payment event is worse.
 * Two deliveries racing each other can both pass; the second note is refused by the unique index and logged.
 */
export async function isRepeatWebhook(source: WebhookSource, eventId: string): Promise<boolean> {
  try {
    return await hasTakenWebhookEvent(getStaffDb(), source, eventId);
  } catch (error) {
    console.error("[webhook-log] A repeat check could not be made.", { source, ...errorLogInfo(error) });
    return false;
  }
}

/**
 * Notes one received webhook for the console's Deliveries page: its event, result and fingerprint, never its body.
 * Runs on the staff connection like the handlers themselves. Never throws: the provider must get its answer even when
 * the note cannot be written.
 */
export async function noteWebhook(source: WebhookSource, body: string, outcome: WebhookOutcome): Promise<void> {
  try {
    await recordWebhookEvent(getStaffDb(), {
      source,
      eventType: webhookEventName(body, EVENT_FIELD[source]),
      result: outcome.result,
      error: outcome.error ?? null,
      businessId: outcome.businessId ?? null,
      eventId: outcome.eventId ?? webhookEventId(body),
      ...bodyFingerprint(body),
    });
  } catch (error) {
    console.error("[webhook-log] A webhook could not be noted.", { source, ...errorLogInfo(error) });
  }
}
